import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  CANDIDATE_MODELS,
  sanitizeOutput,
  generateOfflineKeeperResponse,
  buildKeeperSystemInstruction,
} from './utils/keeperEngine';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Production Toolkit Server (Express)',
      version: process.env.npm_package_version || '1.8.0',
    });
  });

  // Lazy-initialized Gemini helper
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

  // AI Chat endpoint with automated failover
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { messages, context } = req.body;

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
          note: 'Running in Offline Editorial Engine mode.'
        });
      }

      const systemInstruction = buildKeeperSystemInstruction(context);

      // Convert messages for GoogleGenAI
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
          console.warn(`[AI Copilot] Model ${model} encountered error:`, modelErr?.message || modelErr);
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
          note: `All live AI models temporarily unavailable or under high demand. Handled by Keeper editorial engine.`
        });
      }

      return res.json({ reply: sanitizeOutput(reply), modelUsed: activeModel });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
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
        note: 'Recovered using offline editorial rules engine.'
      });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Toolkit Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});
