import express from 'express';
import path from 'path';
import chatHandler from './utils/chatHandler.js';

async function startServer() {
  const app = express();
  const portFromEnv = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const PORT = !isNaN(portFromEnv) ? portFromEnv : 3000;

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

  // AI Chat endpoints (supporting both /api/ai/chat and /api/chat)
  app.post('/api/ai/chat', (req, res) => {
    chatHandler(req as any, res as any);
  });
  app.post('/api/chat', (req, res) => {
    chatHandler(req as any, res as any);
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

