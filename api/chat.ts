import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import {
  CANDIDATE_MODELS,
  sanitizeOutput,
  generateOfflineKeeperResponse,
  buildKeeperSystemInstruction,
} from '../utils/keeperEngine';

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
        ? generateOfflineKeeperResponse(lastUserMessage.content || '')
        : generateOfflineKeeperResponse('hello');
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

    let reply = '';
    let activeModel = '';
    let lastError: any = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${model} request timed out after 7.5s`)), 7500)
        );
        const modelPromise = ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
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
        ? generateOfflineKeeperResponse(lastUserMessage.content || '')
        : generateOfflineKeeperResponse('hello');
      return res.json({
        reply: sanitizeOutput(fallbackReply),
        modelUsed: 'offline-keeper-fallback',
        note: `All live AI models temporarily unavailable or under high demand. Handled by Keeper editorial engine.`,
      });
    }

    return res.json({ reply: sanitizeOutput(reply), modelUsed: activeModel });
  } catch (err: any) {
    console.error('Gemini API Error (Vercel):', err);
    const lastUserMessage = Array.isArray(req.body?.messages)
      ? [...req.body.messages].reverse().find((m: any) => m.role === 'user')
      : null;
    const offlineReply = lastUserMessage
      ? generateOfflineKeeperResponse(lastUserMessage.content || '')
      : generateOfflineKeeperResponse('hello');

    return res.json({
      reply: sanitizeOutput(offlineReply),
      modelUsed: 'offline-keeper-recovery',
      note: 'Recovered using offline editorial rules engine.',
    });
  }
}
