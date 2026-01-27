# Roast My Screenshot (POC)

Vite + React frontend, plus a backend roast endpoint.

## Local dev (current)

This repo still includes an Express server in `server/` for local experimentation, but for phone/production the recommended path is **Vercel**.

Run locally:

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787

## Vercel deployment (phone-friendly HTTPS)

This repo is now **Vercel-friendly** using **Option A**:
- Frontend is built from `client/`
- Backend is provided by Vercel serverless functions in `api/`

### What you deploy
- Frontend: `https://<yourapp>.vercel.app/`
- Backend: `https://<yourapp>.vercel.app/api/roast`

### Required env vars (recommended)
In Vercel Project Settings → Environment Variables:
- `OPENAI_API_KEY` (server-side key)
- `OPENAI_MODEL` (optional, default: `gpt-4o-mini`)

### Optional: user-supplied API key
The UI includes **“Use your own API key”**.
- If the user enters a key, the frontend sends it to `/api/roast` via header `X-User-OpenAI-Key`.
- The backend will use that key instead of the server key.

Note: This is convenient for testing, but you should be explicit in UI copy that the key is sent to your server endpoint.

### Deploy steps (simple)
1) Push this repo to GitHub
2) Create a new Vercel project from that repo
3) Add env vars above
4) Deploy

## Practical note about screenshots
Real screenshots can be large. The client resizes/compresses images before upload to reduce payload size (important for serverless limits).
