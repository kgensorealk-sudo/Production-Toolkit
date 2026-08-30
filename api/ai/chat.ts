import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler, { config } from '../chat';

export { config };
export default async function aiChatHandler(req: VercelRequest, res: VercelResponse) {
  return handler(req, res);
}
