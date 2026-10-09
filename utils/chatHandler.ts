import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import {
  CANDIDATE_MODELS,
  sanitizeOutput,
  buildKeeperSystemInstruction,
  KEEPER_CONTACT_ADMIN_NOTICE,
} from './keeperEngine.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
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
    const geminiClient = getGeminiClient();
    const openaiClient = getOpenAIClient();

    if (!geminiClient && !openaiClient) {
      return res.status(503).json({ error: KEEPER_CONTACT_ADMIN_NOTICE, code: 'AI_UNAVAILABLE' });
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

    if (!reply) return res.status(503).json({ error: KEEPER_CONTACT_ADMIN_NOTICE, code: 'AI_UNAVAILABLE' });

    return res.json({ reply: sanitizeOutput(reply), modelUsed: activeModel });
  } catch (err: any) {
    console.error('AI Copilot API Error (Vercel):', err);
    return res.status(503).json({ error: KEEPER_CONTACT_ADMIN_NOTICE, code: 'AI_UNAVAILABLE' });
  }
}
