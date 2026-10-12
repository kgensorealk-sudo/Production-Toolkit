# Deploying Production Toolkit Pro to Vercel

Production Toolkit Pro is fully configured to deploy to **Vercel** as a high-performance, edge-optimized static SPA with serverless backend functions for **Keeper** (the AI Companion).

---

## 🚀 1-Step Deployment

1. Push your repository to **GitHub**, **GitLab**, or **Bitbucket**.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. Vercel will automatically detect the settings from `vercel.json`:
   - **Framework Preset**: Vite
   - **Build Command**: `vite build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Under **Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google Gemini API Key from Google AI Studio.
5. Click **Deploy**.

---

## ⚙️ Architecture on Vercel

| Component | Path | Architecture |
|---|---|---|
| **Frontend UI** | `/` | Vite React SPA deployed to Vercel's global Edge CDN |
| **Keeper Sandbox** | `/api/ai/chat` & `/api/chat` | Serverless Function with model failover and 1024MB RAM |
| **Health Check** | `/api/health` | Instant zero-latency serverless endpoint |

### Keeper Features on Vercel:
- **Provider failover**: The configured candidate chain is maintained in `utils/keeperEngine.ts`. Configuration is not proof of model availability.
- **Evidence versus interpretation**: Deterministic inventory/report paths remain distinct from provider interpretation. The former offline editorial assistant has been removed; a failed provider request must not be described as a successful AI review.
- **Enterprise Security**: Configured with strict security headers (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`).
- **CORS Preflight Support**: Full support for cross-origin preview URLs and staging environments.

## Verification limits

The configured Vercel build is `vite build`; it does not automatically run the portable regression command or the repository TypeScript check. This Phase 1 change does not alter deployment configuration. See `docs/testing.md`. Historical verification reports are dated evidence, not a guarantee of the current deployed release.
