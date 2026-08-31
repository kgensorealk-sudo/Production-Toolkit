// Thin re-export only. The real handler used to live here, but api/ai/chat.ts
// imported it as `../chat`, which is one API route importing another API route
// as a module. Vercel bundles every file directly under /api as its own isolated
// serverless function, so that cross-function import was never reliable — it
// broke in production with:
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/api/chat'
//     imported from /var/task/api/ai/chat.js
// The actual implementation now lives in utils/chatHandler.ts (outside /api,
// so it isn't itself treated as a route) and both api/chat.ts and
// api/ai/chat.ts import it from there instead of from each other.
export { default, config } from '../utils/chatHandler';
