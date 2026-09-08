import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import {
  CANDIDATE_MODELS,
  sanitizeOutput,
  generateOfflineKeeperResponse,
  buildKeeperSystemInstruction,
} from './keeperEngine.js';
import { sequenceAffiliationIdsStrict } from './affiliationSequencerLogic.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtrvpqxhjqpifglrhbzu.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cnZwcXhoanFwaWZnbHJoYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODI2MDcsImV4cCI6MjA4Mjc1ODYwN30.5uPoLzqW6GW4yY14mgA9rBcWgZOnPYom7LbLIQOkDao';
const SUPER_ADMIN_EMAIL = 'generalkevin53@gmail.com';
const SECONDARY_ADMIN_EMAIL = 'kgenso.realK@gmail.com';

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

    const userEmail = (user.email || '').toLowerCase().trim();
    const isAdmin = 
      userEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
      userEmail === SECONDARY_ADMIN_EMAIL.toLowerCase() ||
      user.app_metadata?.role?.toLowerCase() === 'admin' ||
      user.user_metadata?.role?.toLowerCase() === 'admin';

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
    const { messages, context } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
    const userText = (lastUserMessage?.content || '').trim();
    const userTextLower = userText.toLowerCase();

    // Check if user is inquiring about the Affiliation Sequencer or trying to sequence affiliations in XML
    const isAffiliationSequencingTask = 
      (userTextLower.includes('affiliation') || userTextLower.includes('ce:affiliation') || userTextLower.includes('cross-ref') || userTextLower.includes('cross ref') || userTextLower.includes('refid')) &&
      (userTextLower.includes('increments of 5') || userTextLower.includes('af0005') || userTextLower.includes('af0010') || userTextLower.includes('sequence') || userTextLower.includes('sequential') || userTextLower.includes('correct the id') || userTextLower.includes('af0020') || userTextLower.includes('af0025') || userTextLower.includes('cross-ref') || userTextLower.includes('cross ref'));

    const isAffiliationToolInquiry = 
      (userTextLower.includes('affiliation') && (userTextLower.includes('tool') || userTextLower.includes('where') || userTextLower.includes('find') || userTextLower.includes('how') || userTextLower.includes('know'))) ||
      ((userTextLower.includes("can't find") || userTextLower.includes("cannot find") || userTextLower.includes("where is the tool") || userTextLower.includes("find the tool") || userTextLower.includes("where is")) && 
       (userTextLower.includes("keeper") || userTextLower.includes("affiliation") || userTextLower.includes("new tool") || userTextLower.includes("tool")));

    // Handle XML affiliation sequencing immediately
    if (isAffiliationSequencingTask) {
      const xmlMatch = userText.match(/<([a-zA-Z0-9:]+\b[\s\S]*>)/);
      if (xmlMatch && (userText.includes('<ce:affiliation') || userText.includes('<ce:cross-ref'))) {
        const result = sequenceAffiliationIdsStrict(xmlMatch[0], 5, true);
        if (userTextLower.includes('do not provide explanations') || userTextLower.includes('modify the xml below according to one requirement only') || userTextLower.includes('complete xml, not a partial excerpt')) {
          return res.json({
            reply: result.outputXml,
            modelUsed: 'keeper-affiliation-sequencer'
          });
        }
        return res.json({
          reply: sanitizeOutput(`### 🐾 Affiliation ID Sequence & Cross-Ref Synchronization (+5 Increments)

I have corrected the \`<ce:affiliation>\` IDs to be sequential in increments of 5 (\`af0005\`, \`af0010\`, \`af0015\`...) and synchronized all corresponding author cross-reference links:

- **Total Affiliations:** ${result.totalAffiliations}
- **Affiliation IDs Corrected:** ${result.changedCount}
- **Cross-Ref Links Synchronized:** ${result.totalCrossRefsUpdated}${result.crossRefChanges.length > 0 ? ` (e.g. \`refid="${result.crossRefChanges[0].oldRefId}"\` -> \`refid="${result.crossRefChanges[0].newRefId}"\`)` : ''}
- **Integrity Guarantee:** \`<ce:author>\`, \`<ce:cross-ref id="...">\`, \`<ce:sup>\`, and \`affiliation-id\` remain strictly preserved.

\`\`\`xml
${result.outputXml}
\`\`\`

👉 **[Open Affiliation Sequencer Tool](#/affiliationSequencer)**`),
          modelUsed: 'keeper-affiliation-sequencer'
        });
      } else if (userTextLower.includes('cross-ref') || userTextLower.includes('refid') || userTextLower.includes('af0025')) {
        return res.json({
          reply: sanitizeOutput(`### 🐾 Cross-Reference Synchronization Update

I have updated the **Affiliation Sequencer** and Keeper's processing engine to automatically synchronize author \`<ce:cross-ref refid="...">\` links whenever affiliation IDs are corrected or normalized to increments of 5!

#### 🔄 What Was Corrected:
- When an affiliation ID changes (e.g. from \`af0025\` to \`af0020\`), any associated cross-reference call:
  \`<ce:cross-ref refid="af0025" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>\`
  is now automatically updated to:
  \`<ce:cross-ref refid="af0020" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>\`
- **Integrity Guarantee:** The cross-reference's own \`id="cf0040"\`, inner \`<ce:sup>d</ce:sup>\`, and all author tags remain strictly preserved.

#### 🚀 How to Run It:
1. Open the **[Affiliation Sequencer Tool](#/affiliationSequencer)**.
2. Paste your XML buffer and click **Execute Sequence**.
3. All affiliation IDs are sequentially normalized (+5 step) and corresponding author cross-references are automatically synchronized!

You can also paste the XML snippet or full article directly here in chat, and Keeper will return the fully synchronized XML.`),
          modelUsed: 'keeper-affiliation-sequencer'
        });
      }
    }

    // Handle tool location / discovery inquiry
    if (isAffiliationToolInquiry && !userText.includes('<ce:affiliation')) {
      return res.json({
        reply: sanitizeOutput(`### 🐾 Affiliation Sequencer (ID Normalizer)

The **Affiliation Sequencer** is available directly in the workspace:

1. **Direct Access:** **[Open Affiliation Sequencer](#/affiliationSequencer)**
2. **On the Dashboard:** Go to your **[Workspace Dashboard](#/dashboard)** — the **Affiliation Sequencer** card is located in the tools grid (search for *"Affiliation"* or look for the green Building icon).

---

#### 🛠️ Core Capabilities:
- **Sequential IDs (+5 Step):** Automatically standardizes \`<ce:affiliation>\` \`id\` attributes to \`af0005\`, \`af0010\`, \`af0015\`, \`af0020\`... in sequential occurrence order.
- **Automatic Cross-Ref Synchronization:** Keeps all author cross-references (\`<ce:cross-ref refid="...">\`) linked accurately to their updated affiliations.
- **Strict DTD Integrity:** Preserves \`affiliation-id\` attributes, author names, cross-ref \`id\` values, superscripts, and document structure intact.

👉 **[Launch Affiliation Sequencer Now](#/affiliationSequencer)**`),
        modelUsed: 'keeper-tool-router'
      });
    }

    const geminiClient = getGeminiClient();
    const openaiClient = getOpenAIClient();

    // If NEITHER provider has a key configured, go straight to the offline engine
    if (!geminiClient && !openaiClient) {
      const offlineReply = lastUserMessage
        ? generateOfflineKeeperResponse(lastUserMessage.content || '', context)
        : generateOfflineKeeperResponse('hello', context);
      return res.json({
        reply: sanitizeOutput(offlineReply),
        modelUsed: 'offline-keeper',
        note: 'No AI provider API keys configured (GEMINI_API_KEY / OPENAI_API_KEY). Running in Offline Editorial Engine mode.',
      });
    }

    let systemInstruction = buildKeeperSystemInstruction(context);

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
    const PER_MODEL_TIMEOUT_MS = 12000;

    let reply = '';
    let activeModel = '';
    let lastError: any = null;

    for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
      const candidate = CANDIDATE_MODELS[i];
      const timeoutMs = PER_MODEL_TIMEOUT_MS;

      // Skip a candidate outright if its provider has no API key configured,
      // rather than burning a timeout slot on a call we know will fail.
      if (candidate.provider === 'gemini' && !geminiClient) continue;
      if (candidate.provider === 'openai' && !openaiClient) continue;

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Model ${candidate.model} request timed out after ${timeoutMs / 1000}s`)),
            timeoutMs
          )
        );

        let text = '';

        if (candidate.provider === 'gemini') {
          const modelPromise = geminiClient!.models.generateContent({
            model: candidate.model,
            contents: geminiContents,
            config: {
              systemInstruction,
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
          });
          const response: any = await Promise.race([modelPromise, timeoutPromise]);
          text = response?.choices?.[0]?.message?.content || '';
        }

        if (text) {
          reply = text;
          activeModel = candidate.model;
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[AI Copilot - Vercel] Model ${candidate.model} (${candidate.provider}) encountered error:`, modelErr?.message || modelErr);
        lastError = modelErr;
      }
    }

    if (!reply) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      const fallbackReply = lastUserMessage
        ? generateOfflineKeeperResponse(lastUserMessage.content || '', context)
        : generateOfflineKeeperResponse('hello', context);
      return res.json({
        reply: sanitizeOutput(fallbackReply),
        modelUsed: 'offline-keeper-fallback',
        note: `All live AI models temporarily unavailable or under high demand. Handled by Keeper editorial engine.`,
      });
    }

    return res.json({ reply: sanitizeOutput(reply), modelUsed: activeModel });
  } catch (err: any) {
    console.error('AI Copilot API Error (Vercel):', err);
    const context = req.body?.context;
    const lastUserMessage = Array.isArray(req.body?.messages)
      ? [...req.body.messages].reverse().find((m: any) => m.role === 'user')
      : null;
    const offlineReply = lastUserMessage
      ? generateOfflineKeeperResponse(lastUserMessage.content || '', context)
      : generateOfflineKeeperResponse('hello', context);

    return res.json({
      reply: sanitizeOutput(offlineReply),
      modelUsed: 'offline-keeper-recovery',
      note: 'Recovered using offline editorial rules engine.',
    });
  }
}
