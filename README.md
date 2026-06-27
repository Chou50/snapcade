# Snapcade

Turn a photo of the current scene into a playable mini-game grounded in the objects from that photo.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

```env
GEMINI_API_KEY=your_key
GEMINI_AGENT=antigravity-preview-05-2026
```

The application never sends the API key to the browser. Game generation runs through the Gemini API Interactions API using the Antigravity managed agent. The user prompt is optional: the agent can generate an English game prompt from the uploaded image, return visible scene objects, and expose a reader-facing calculation trace. If the managed agent is unavailable, generation returns a safe `GameSpec` and keeps the app playable.

## Verification

```bash
npm test
npm run build
```

The health endpoint is available at `/api/health`.

## Cloud Run

The included multi-stage `Dockerfile` runs the Next.js standalone server as a non-root user on port `8080`.

Recommended production configuration:

- Region: `asia-northeast1`
- Public access enabled for the demo
- `GEMINI_AGENT` supplied as a normal environment variable
- `GEMINI_API_KEY` supplied from Google Secret Manager
- Request timeout of at least 60 seconds; the application itself falls back after 15 seconds

Example deployment after the secret is configured:

```bash
gcloud run deploy snapcade \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_AGENT=antigravity-preview-05-2026 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --timeout 60
```
