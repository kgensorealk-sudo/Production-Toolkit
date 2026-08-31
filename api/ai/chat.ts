// Thin re-export only — see api/chat.ts for the full explanation. Both routes
// import the real handler from utils/chatHandler.ts instead of from each other.
//
// IMPORTANT: this file lives one folder deeper than api/chat.ts (api/ai/ vs api/),
// so it needs an EXTRA "../" to reach the root-level utils/ folder. Do not copy
// api/chat.ts's import path here verbatim — '../utils/chatHandler' from this
// location resolves to the nonexistent api/utils/chatHandler and will crash
// with ERR_MODULE_NOT_FOUND at runtime.
export { default, config } from '../../utils/chatHandler.js';
