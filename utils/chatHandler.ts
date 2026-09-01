import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
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

  try {
    const { messages, context } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    const geminiClient = getGeminiClient();
    const openaiClient = getOpenAIClient();

    // If NEITHER provider has a key configured, go straight to the offline engine —
    // there's nothing live to even attempt.
    if (!geminiClient && !openaiClient) {
      const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
      const offlineReply = lastUserMessage
        ? generateOfflineKeeperResponse(lastUserMessage.content || '', context)
        : generateOfflineKeeperResponse('hello', context);
      return res.json({
        reply: sanitizeOutput(offlineReply),
        modelUsed: 'offline-keeper',
        note: 'No AI provider API keys configured (GEMINI_API_KEY / OPENAI_API_KEY). Running in Offline Editorial Engine mode.',
      });
    }

    const systemInstruction = buildKeeperSystemInstruction(context);

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

    // Per-model timeout budget (7.5s max per candidate to fail over quickly if rate-limited or hanging)
    const PER_MODEL_TIMEOUT_MS = 7500;

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
