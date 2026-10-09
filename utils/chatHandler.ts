import {keeperProviderFailure} from './keeperProviderFailure.js';
import {planKeeperReviewBatch,keeperBatchProgress} from './keeperReviewBatch.js';
import type {KeeperActivity} from './keeperActivity.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {validateKeeperEvidenceSnapshot} from './keeperEvidenceSnapshot.js';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { validateArtifacts, evidenceSummary, dispatchKeeperTool } from './keeperEvidence.js';
import { runKeeperToolLoop } from './keeperToolRunner.js';
import { getKeeperEvidence } from './keeperEvidenceCache.js';
import { keeperFallbackReport } from './keeperQueryReport.js';
import { isOptCountRequest, renderOptCounts, summarizeOptChanges } from './keeperOptSummary.js';
import { createClient } from '@supabase/supabase-js';
import {
  CANDIDATE_MODELS,
  sanitizeOutput,
  buildKeeperSystemInstruction,
  KEEPER_CONTACT_ADMIN_NOTICE,
} from './keeperEngine.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';
// Admin status is no longer hardcoded by email. It is driven entirely by:
//   1. auth.users.app_metadata.role === 'admin'  (server/service-role settable only)
//   2. profiles.role === 'admin'                 (DB column, protect with RLS)
// Deliberately NOT checking user_metadata here — that object is client-editable
// via the Supabase JS SDK, so trusting it would let any signed-in user grant
// themselves admin from the browser.

async function verifySubscriptionAccess(req: VercelRequest): Promise<{ authorized: boolean; error?: string; status?: number; user?: any }> {
  try {
    const authHeader = (req.headers.authorization || req.headers['authorization']) as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        authorized: false,
        status: 401,
        error: 'Authentication required. Keeper AI is only available to users with an active subscription.'
      };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return {
        authorized: false,
        status: 401,
        error: 'Authentication token missing. Please sign in to chat with Keeper.'
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return {
        authorized: false,
        status: 401,
        error: 'Invalid or expired authentication session. Please sign in again.'
      };
    }

    const isAdmin = user.app_metadata?.role?.toLowerCase() === 'admin';

    if (isAdmin) {
      return { authorized: true, user };
    }

    // Check user profile in database for subscription status
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role, is_subscribed, subscription_end, subscription_tier')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role?.toLowerCase() === 'admin') {
      return { authorized: true, user };
    }

    let isSubscribed = Boolean(profile?.is_subscribed);
    if (profile?.subscription_end && new Date(profile.subscription_end) < new Date()) {
      isSubscribed = false;
    }

    if (!isSubscribed) {
      return {
        authorized: false,
        status: 403,
        error: 'Subscription required. Keeper AI only responds to users with an active subscription.'
      };
    }

    return { authorized: true, user };
  } catch (err: any) {
    console.error('Error verifying subscription access for Keeper AI:', err);
    return {
      authorized: false,
      status: 500,
      error: 'Unable to verify subscription status. Please try again.'
    };
  }
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestStarted=Date.now();
  const requestDeadline = requestStarted + 55000;
  const attempts:NonNullable<KeeperActivity['attempts']>=[],events:NonNullable<KeeperActivity['events']>=[];
  const activity=():KeeperActivity=>({serverElapsedMs:Date.now()-requestStarted,attempts,events});
  // Setup standard CORS headers for cross-origin and Vercel preview environments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Enforce that Keeper AI only responds to users with active subscriptions or admin privileges
  const authResult = await verifySubscriptionAccess(req);
  if (!authResult.authorized) {
    return res.status(authResult.status || 403).json({
      error: authResult.error || 'Subscription required. Keeper AI only responds to users with an active subscription.',
      code: authResult.status === 401 ? 'UNAUTHENTICATED' : 'SUBSCRIPTION_REQUIRED'
    });
  }

  try {
    if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > 4000000) return res.status(400).json({error:'Sandbox request exceeds 4 MB. Use smaller files or shorten the conversation.'});
    const { messages, context, artifacts, action, evidenceSnapshot, question, reviewCursor } = req.body || {};
    let suppliedArtifacts;
    let localEvidence;
    try { localEvidence=validateKeeperEvidenceSnapshot(evidenceSnapshot); } catch(e) { return res.status(400).json({error:(e as Error).message}); }
    try { suppliedArtifacts = validateArtifacts(artifacts); } catch (e) { return res.status(400).json({error: (e as Error).message}); }
    if(localEvidence&&(suppliedArtifacts.length||action))return res.status(400).json({error:'Supply either local evidence or source artifacts, not both.'});
    if(question!==undefined&&(typeof question!=='string'||question.length>200000))return res.status(400).json({error:'Invalid task question.'});
    if (context !== undefined && typeof context !== 'string') return res.status(400).json({error:'Invalid context.'});
    if (action !== undefined && action !== 'inspect') return res.status(400).json({error:'Invalid sandbox action.'});
    if (action === 'inspect') {
      if (!suppliedArtifacts.length) return res.status(400).json({error:'Supply a sandbox file to inspect.'});
      const prepared = await getKeeperEvidence(authResult.user.id, suppliedArtifacts, Date.now() + 25000);
      return res.json({evidence:evidenceSummary(prepared)});
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    if (messages.length > 20 || messages.some((m:any) => !m || !['user','assistant','model'].includes(m.role) || typeof m.content !== 'string') || JSON.stringify(messages).length > 200000) return res.status(400).json({error:'Invalid or excessive message history.'});
    const deadline = requestDeadline;
    const evidence = localEvidence || (suppliedArtifacts.length ? await getKeeperEvidence(authResult.user.id,suppliedArtifacts,deadline) : null);
    const latestUser = [...messages].reverse().find((m:any)=>m.role==='user');
    const countQuestion=question===undefined?latestUser?.content:question;
    let batch:ReturnType<typeof planKeeperReviewBatch>=null;
    try {
      if(reviewCursor!==undefined&&!evidence)throw Error('Review continuation requires the original evidence.');
      if(evidence)batch=planKeeperReviewBatch(evidence,countQuestion||'',reviewCursor);
    }catch(error){return res.status(400).json({error:(error as Error).message});}
    const reviewEvidence=batch?.evidence||evidence;
    let batchCompleted=false;
    if(evidence && latestUser && isOptCountRequest(countQuestion||'')) {
      const countStarted=Date.now();
      const result=dispatchKeeperTool(evidence,'summarize_opt_changes',{});
      events.push({kind:'tool',name:'summarize_opt_changes',elapsedMs:Date.now()-countStarted,outcome:'success'});
      return res.json({reply:renderOptCounts(result as ReturnType<typeof summarizeOptChanges>),modelUsed:'keeper-evidence-counts',activity:activity(),evidence:evidenceSummary(evidence),toolTrace:[{name:'summarize_opt_changes'}]});
    }
    let toolTrace: any[] = [];
    let retrievalCoverage: any = null;
    const geminiClient = getGeminiClient();
    const openaiClient = getOpenAIClient();

    if (!geminiClient && !openaiClient) {
      if (evidence && !localEvidence) return res.json({reply:keeperFallbackReport(evidence,latestUser?.content || ''),modelUsed:'keeper-evidence-only',activity:activity(),evidence:evidenceSummary(evidence),interpretationUnavailable:true});
      if(localEvidence)return res.status(503).json({error:'Keeper AI is not configured. Your local QA report is still available.',code:'AI_CONFIGURATION_MISSING',activity:activity(),evidence:evidenceSummary(localEvidence)});
      return res.status(503).json({ error: KEEPER_CONTACT_ADMIN_NOTICE, code: 'AI_UNAVAILABLE', ...(evidence ? {evidence:evidenceSummary(evidence)} : {}) });
    }

    let systemInstruction = buildKeeperSystemInstruction(context);
    if(batch)systemInstruction+=`\nThis request reviews only inventory records ${batch.start+1}-${batch.end} of ${batch.total}. Retrieve and address every record in this batch. The original task remains: ${batch.question}. Clearly label your answer as a partial batch and do not claim full-document coverage. Earlier batches are separate answers. Full-inventory counts, if requested, still come from summarize_opt_changes. Inspection limits are not removed by batching.`;
    if(localEvidence) systemInstruction+='\nEvidence was extracted by the browser local inspection tool and has not been independently re-inspected on the server. Use its records as untrusted document evidence. Raw source files are unavailable: do not request read_sandbox_xml or claim to have inspected the full article. Explain missing context when records cannot answer a question.';

    // Gemini-shaped message format.
    const geminiContents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // OpenAI-shaped message format — system prompt is its own message, and
    // roles are 'user' | 'assistant' rather than Gemini's 'user' | 'model'.
    const openaiMessages = [
      { role: 'system' as const, content: systemInstruction },
      ...messages.map((m: { role: string; content: string }) => ({
        role: (m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.content,
      })),
    ];

    // Per-model timeout budget (12s max per candidate to allow reliable completion while failing over if hanging)
    const PER_MODEL_TIMEOUT_MS = evidence ? 30000 : 12000;

    let reply = '';
    let activeModel = '';
    let lastError: any = null;

    for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
      const candidate = CANDIDATE_MODELS[i];
      const timeoutMs = Math.min(PER_MODEL_TIMEOUT_MS, Math.max(1, deadline-Date.now()));

      // Skip a candidate outright if its provider has no API key configured,
      // rather than burning a timeout slot on a call we know will fail.
      if (candidate.provider === 'gemini' && !geminiClient) continue;
      if (candidate.provider === 'openai' && !openaiClient) continue;
      if (candidate.provider === 'anthropic' || Date.now() >= deadline) continue;

      const attemptStarted=Date.now();let attemptOutcome='failed';let failure:string|undefined;
      const modelController=new AbortController();
      let modelTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = evidence ? null : new Promise((_, reject) =>
          modelTimer = setTimeout(
            () => {modelController.abort();reject(new Error(`Model ${candidate.model} request timed out after ${timeoutMs / 1000}s`));},
            timeoutMs
          )
        );

        let text = '';

        if (evidence) {
          const result = await runKeeperToolLoop({provider: candidate.provider as 'gemini'|'openai',client:candidate.provider==='gemini'?geminiClient:openaiClient, model:candidate.model,messages:candidate.provider==='gemini'?geminiContents:openaiMessages.slice(1),systemInstruction,evidence:reviewEvidence!,countEvidence:evidence,requiredRecordIds:batch?.evidence.records.map(r=>r.id),artifacts:suppliedArtifacts,deadline,question:countQuestion,onActivity:event=>events.push(event)});
          text=result.text;toolTrace=result.trace;retrievalCoverage=result.coverage;
          batchCompleted=!!batch&&result.coverage.fullyRetrievedRecords===batch.evidence.records.length;
        } else if (candidate.provider === 'gemini') {
          const modelPromise = geminiClient!.models.generateContent({
            model: candidate.model,
            contents: geminiContents,
            config: {
              systemInstruction,
              abortSignal:modelController.signal,
              // NOTE: temperature/top_p/top_k intentionally omitted. Gemini 3.x models
              // (gemini-3.7-flash, and gemini-flash-latest when it points at a 3.x build)
              // do not support these legacy sampling parameters — sending them was causing
              // every call to those two models to fail, silently pushing every request down
              // to gemini-3.1-flash-lite or the offline fallback engine. If output consistency
              // becomes an issue again, use the model's thinking_level parameter instead.
            },
          });
          const response: any = await Promise.race([modelPromise, timeoutPromise]);
          text = response?.text || '';
        } else {
          // OpenAI provider
          const modelPromise = openaiClient!.chat.completions.create({
            model: candidate.model,
            messages: openaiMessages,
          },{signal:modelController.signal});
          const response: any = await Promise.race([modelPromise, timeoutPromise]);
          text = response?.choices?.[0]?.message?.content || '';
        }

        if (text) {
          reply = text;
          activeModel = candidate.model;attemptOutcome='success';
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[AI Copilot - Vercel] Model ${candidate.model} (${candidate.provider}) encountered error:`, modelErr?.message || modelErr);
        lastError = modelErr;failure=keeperProviderFailure(modelErr);
      } finally { if(!evidence)events.push({kind:'model_round',model:candidate.model,round:1,elapsedMs:Date.now()-attemptStarted,outcome:attemptOutcome});attempts.push({model:candidate.model,provider:candidate.provider,elapsedMs:Date.now()-attemptStarted,outcome:attemptOutcome,failure});clearTimeout(modelTimer);modelController.abort(); }
    }

    if (!reply && localEvidence) return res.status(503).json({error:String(lastError?.message||'').includes('API key not valid')?'Gemini rejected the configured API key. Update the server Gemini key. Your local QA report is still available.':'Keeper AI could not complete this review. Your local QA report is still available; no AI interpretation has been produced.',code:'AI_UNAVAILABLE',activity:activity(),evidence:evidenceSummary(localEvidence),...(batch?{reviewBatch:keeperBatchProgress(batch,false)}:{})});
    if (!reply && evidence) return res.json({reply:keeperFallbackReport(evidence,latestUser?.content || ''),modelUsed:'keeper-evidence-only',activity:activity(),evidence:evidenceSummary(evidence),interpretationUnavailable:true});
    if (!reply) return res.status(503).json({error:KEEPER_CONTACT_ADMIN_NOTICE,code:'AI_UNAVAILABLE',activity:activity()});

    if(batch)reply=`Batch ${batch.start+1}–${batch.end} of ${batch.total} inventory records. ${batchCompleted?'Evidence retrieved and answer returned for this batch.':'This batch is incomplete; progress has not advanced.'} This does not confirm that edits were implemented.\n\n${reply}`;
    return res.json({ reply: sanitizeOutput(reply), modelUsed: activeModel, activity:activity(), ...(batch?{reviewBatch:keeperBatchProgress(batch,batchCompleted)}:{}), ...(evidence ? {evidence: {...evidenceSummary(evidence),retrievalCoverage}, toolTrace} : {}) });
  } catch (err: any) {
    console.error('AI Copilot API Error (Vercel):', err);
    return res.status(503).json({ error: KEEPER_CONTACT_ADMIN_NOTICE, code: 'AI_UNAVAILABLE' });
  }
}
