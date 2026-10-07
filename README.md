# Production Toolkit Pro

Editorial workflow suite built with React, TypeScript, Vite, and Supabase. Includes XML, reference, citation, table, and affiliation tools, plus the Keeper AI assistant.

## Local development

Requires Node.js and npm.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and configure `GEMINI_API_KEY` and optionally `OPENAI_API_KEY` for live AI responses. Without keys, the AI handlers use their offline rules engines.
3. Load the environment into the server process (for example, with PowerShell environment variables) and run `npm run dev`.
4. Open `http://localhost:3000`.

The frontend currently uses the Supabase project configured in `supabaseClient.ts`. The database schema and security migration are in `supabase_schema.sql` and `security_fixes_migration.sql`; applying them is a separate database operation.

## Checks and builds

- `npm run lint`: TypeScript checks.
- `npm run build`: frontend and Express server build.
- For the built Express server, set `NODE_ENV=production` and run `npm start`.
- See `DEPLOY_VERCEL.md` for web deployment.
- Electron source and Windows packaging scripts are retained in `electron/` and `package.json`. The Electron development port and package entry point need alignment before desktop packaging can be relied on.

## Repository layout

- `pages/`, `components/`, `contexts/`, `hooks/`: frontend tools and shared UI.
- `utils/`, `services/`: processing, AI handlers, and usage metrics.
- `api/`: Vercel function entry points; `server.ts`: Express entry point.
- `public/`: runtime assets; `image/` legacy assets have been removed.
- `constants/releaseNotes.ts`: historical release notes.
- `agent/`, `prompts/`: Production QA agent documentation.

Keep API keys in local environment files or deployment secrets. Local environment files, dependencies, and build outputs are ignored by Git.
