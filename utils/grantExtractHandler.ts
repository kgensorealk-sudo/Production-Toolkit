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

const CANDIDATES: Array<{ model: string; provider: 'gemini' | 'openai' }> = [
  { model: 'gemini-3.8-flash', provider: 'gemini' },
  { model: 'gemini-3.1-flash-lite', provider: 'gemini' },
  { model: 'gemini-flash-latest', provider: 'gemini' },
  { model: 'gemini-3.7-flash', provider: 'gemini' },
  { model: 'gpt-4o-mini', provider: 'openai' },
  { model: 'gpt-4o', provider: 'openai' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const { statement } = req.body || {};
    const textToAnalyze = (statement || '').trim();

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

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
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
          });

          const response: any = await Promise.race([apiPromise, timeoutPromise]);
          outputText = (response?.choices?.[0]?.message?.content || '').trim();
        }

        if (outputText) {
          rawOutput = outputText;
          activeModel = candidate.model;
          break;
        }
      } catch (err) {
        console.warn(`[grant-extract] ${candidate.model} failed, trying next candidate:`, err);
      }
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
