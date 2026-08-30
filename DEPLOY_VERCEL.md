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
| **Keeper AI Chat** | `/api/ai/chat` & `/api/chat` | Serverless Function with model failover and 1024MB RAM |
| **Health Check** | `/api/health` | Instant zero-latency serverless endpoint |

### Keeper Features on Vercel:
- **Automatic Model Failover**: Fast-path response via `gemini-3.1-flash-lite`, with seamless fallback to `gemini-flash-latest` and `gemini-3.7-flash`.
- **Offline Editorial Rules Engine**: Even if the API key is missing or Google's API undergoes high demand, Keeper still answers inquiries, generates standardized JM queries, and navigates editorial tools without errors.
- **Enterprise Security**: Configured with strict security headers (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`).
- **CORS Preflight Support**: Full support for cross-origin preview URLs and staging environments.
