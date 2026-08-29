import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Keeper - Japanese Spitz AI Companion',
    version: process.env.npm_package_version || '1.8.0'
  });
}
