import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Keeper - Japanese Spitz AI Companion',
    version: process.env.npm_package_version || '1.8.0',
    platform: 'Vercel Serverless'
  });
}
