import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import {
  CANDIDATE_MODELS,
  sanitizeOutput,
  generateOfflineKeeperResponse,
  buildKeeperSystemInstruction,
} from './keeperEngine.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

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

  try {
    const { messages, context } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      const offlineReply = lastUserMessage
        ? generateOfflineKeeperResponse(lastUserMessage.content || '', context)
        : generateOfflineKeeperResponse('hello', context);
      return res.json({
        reply: sanitizeOutput(offlineReply),
        modelUsed: 'offline-keeper',
        note: 'GEMINI_API_KEY not configured. Running in Offline Editorial Engine mode.',
      });
    }

    const systemInstruction = buildKeeperSystemInstruction(context);

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Per-model timeout budget. These must sum to comfortably less than the
    // function's maxDuration (30s in vercel.json) — otherwise a slow/hanging
    // first model can push the *whole function* past the platform limit and
    // Vercel kills it with a bare 500 before our own try/catch ever gets a
    // chance to return the graceful offline fallback. Strongest model gets
    // the most budget since it's tried first and most likely to succeed;
    // later fallbacks get progressively less. Sum: 12 + 8 + 5 = 25s, leaving
    // a ~5s cushion for network/JSON overhead.
    const TIMEOUT_BUDGET_MS = [12000, 8000, 5000];

    let reply = '';
    let activeModel = '';
    let lastError: any = null;

    for (let i = 0; i < CANDIDATE_MODELS.length; i++) {
      const model = CANDIDATE_MODELS[i];
      const timeoutMs = TIMEOUT_BUDGET_MS[i] ?? 5000;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${model} request timed out after ${timeoutMs / 1000}s`)), timeoutMs)
        );
        const modelPromise = ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            // Lowered from 0.7 — Keeper's job (JM queries, tool routing, DTD rules) is
            // precision/consistency work, not creative writing. Lower temperature reduces
            // phrasing drift and hallucinated details across repeated similar requests.
            temperature: 0.3,
          },
        });

        const response: any = await Promise.race([modelPromise, timeoutPromise]);

        if (response?.text) {
          reply = response.text;
          activeModel = model;
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[AI Copilot - Vercel] Model ${model} encountered error:`, modelErr?.message || modelErr);
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
    console.error('Gemini API Error (Vercel):', err);
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
