# Roast My Screenshot (POC)

PWA-style web app (Vite + React) + tiny Express backend proxy to call an AI vision model.

## Setup

### 1) Server env

```bash
cd server
cp .env.example .env
# edit .env and set OPENAI_API_KEY
```

### 2) Client env

Not required for dev now (frontend uses relative `/api` and Vite proxies to the backend).

### 3) Install + run

From repo root:

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787

## Notes
- This is a proof-of-concept. It uploads screenshots to your backend, which forwards to an AI model.
- Don’t use sensitive screenshots.
- Next steps: rate limiting + auth/credits + blur tool + better share cards.
