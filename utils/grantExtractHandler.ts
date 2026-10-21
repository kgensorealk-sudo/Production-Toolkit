import { verifySubscriptionAccess } from './subscriptionAccess.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { 
  GRANT_EXTRACTION_SYSTEM_PROMPT, 
  sanitizeGrantExtractionResult, 
  extractGrantsOffline 
} from './grantExtractor.js';

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
      timeout: 12000,
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

// Per-instance burst protection. Configure a shared gateway limit for multi-instance deployments.
const grantWindows = new Map<string, { start: number; count: number }>();
export function consumeGrantRequest(user: string, now = Date.now()) {
  for (const [id, window] of grantWindows) if (now - window.start >= 60_000) grantWindows.delete(id);
  const window = grantWindows.get(user) || { start: now, count: 0 };
  if (!grantWindows.has(user) && grantWindows.size >= 10_000) return false;
  grantWindows.set(user, window);
  return ++window.count <= 10;
}
const CANDIDATES: Array<{ model: string; provider: 'gemini' | 'openai' }> = [
  { model: process.env.KEEPER_GEMINI_MODEL || 'gemini-2.5-flash', provider: 'gemini' },
  { model: process.env.KEEPER_OPENAI_MODEL || 'gpt-4o-mini', provider: 'openai' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const access = await verifySubscriptionAccess(req);
  if (!access.authorized) return res.status(access.status || 403).json({ error: access.error });
  if (!consumeGrantRequest(access.user.id)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many analyses. Wait one minute and retry.' });
  }

  try {
    const { statement } = req.body || {};
    if (typeof statement !== 'string' || statement.length > 20_000) return res.status(400).json({ error: 'Supply a funding statement up to 20,000 characters.' });
    const textToAnalyze = statement.trim();

    if (!textToAnalyze) {
      return res.status(400).json({ error: 'Funding statement is required.' });
    }

    const geminiClient = getGeminiClient();
    const openaiClient = getOpenAIClient();

    // If neither provider is configured, run offline extractor immediately
    if (!geminiClient && !openaiClient) {
      const offlineResult = extractGrantsOffline(textToAnalyze);
      return res.json({
        result: offlineResult.formattedText,
        pairs: offlineResult.pairs,
        sponsorsCount: offlineResult.pairs.length,
        modelUsed: 'offline-keeper',
        note: 'Running in Offline Editorial Engine mode.',
      });
    }

    let rawOutput = '';
    let activeModel = '';
    const TIMEOUT_MS = 12000;

    for (const candidate of CANDIDATES) {
      if (candidate.provider === 'gemini' && !geminiClient) continue;
      if (candidate.provider === 'openai' && !openaiClient) continue;

      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          timer = setTimeout(
            () => reject(new Error(`Model ${candidate.model} request timed out after ${TIMEOUT_MS / 1000}s`)),
            TIMEOUT_MS
          )
        );

        let outputText = '';

        if (candidate.provider === 'gemini') {
          const apiPromise = geminiClient!.models.generateContent({
            model: candidate.model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Analyze the following funding statement according to your instructions:\n\n"""\n${textToAnalyze}\n"""`,
                  },
                ],
              },
            ],
            config: {
              systemInstruction: GRANT_EXTRACTION_SYSTEM_PROMPT,
            },
          });

          const response: any = await Promise.race([apiPromise, timeoutPromise]);
          outputText = (response?.text || '').trim();
        } else if (candidate.provider === 'openai') {
          const apiPromise = openaiClient!.chat.completions.create({
            model: candidate.model,
            messages: [
              { role: 'system', content: GRANT_EXTRACTION_SYSTEM_PROMPT },
              {
                role: 'user',
                content: `Analyze the following funding statement according to your instructions:\n\n"""\n${textToAnalyze}\n"""`,
              },
            ],
          }, { timeout: TIMEOUT_MS });

          const response: any = await Promise.race([apiPromise, timeoutPromise]);
          outputText = (response?.choices?.[0]?.message?.content || '').trim();
        }

        if (outputText) {
          rawOutput = outputText;
          activeModel = candidate.model;
          break;
        }
      } catch {
        console.warn(`[grant-extract] ${candidate.model} unavailable; trying fallback.`);
      } finally { if (timer) clearTimeout(timer); }
    }

    // If AI calls produced a response, sanitize and parse
    if (rawOutput) {
      const sanitized = sanitizeGrantExtractionResult(rawOutput);
      return res.json({
        result: sanitized.formattedText,
        pairs: sanitized.pairs,
        sponsorsCount: sanitized.pairs.length,
        modelUsed: activeModel,
      });
    }

    // If all candidates failed or timed out, gracefully fall back to the offline engine
    const fallbackResult = extractGrantsOffline(textToAnalyze);
    return res.json({
      result: fallbackResult.formattedText,
      pairs: fallbackResult.pairs,
      sponsorsCount: fallbackResult.pairs.length,
      modelUsed: 'offline-keeper-fallback',
      note: 'AI providers temporarily unavailable. Processed via Keeper Rule Engine.',
    });
  } catch (error: any) {
    console.error('[grant-extract] Unexpected error:', error);
    // Even on error, return offline rule engine fallback so user's workflow is never blocked
    try {
      const statement = (req.body?.statement || '').trim();
      const fallbackResult = extractGrantsOffline(statement);
      return res.json({
        result: fallbackResult.formattedText,
        pairs: fallbackResult.pairs,
        sponsorsCount: fallbackResult.pairs.length,
        modelUsed: 'offline-keeper-recovery',
      });
    } catch {
      return res.status(500).json({ error: error?.message || 'Failed to analyze funding statement' });
    }
  }
}
