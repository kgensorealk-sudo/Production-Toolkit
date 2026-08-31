// Thin re-export only — the real handler lives in utils/chatHandler.ts and is
// shared between this route and api/ai/chat.ts, so there is a single source
// of truth for Keeper's chat logic instead of two copies drifting apart.
//
// This file lives directly under api/, so it needs only ONE "../" to reach
// the root-level utils/ folder. Do not copy api/ai/chat.ts's import path
// here verbatim — that one needs an extra "../" because it lives one folder
// deeper (api/ai/ vs api/).
export { default, config } from '../utils/chatHandler.js';
