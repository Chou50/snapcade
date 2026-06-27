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
GEMINI_VISION_MODEL=gemini-3-flash-preview
GEMINI_AGENT=antigravity-preview-05-2026
```

The application never sends the API key to the browser. Game generation uses a two-stage Gemini pipeline: Gemini Vision first analyzes the uploaded image and generates an English game prompt from visible objects, then the Antigravity managed agent implements that prompt as a structured `GameSpec`. The user prompt is optional and acts as extra direction. The UI exposes this reader-facing calculation trace. If Gemini or the managed agent is unavailable, generation returns a safe `GameSpec` and keeps the app playable.

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
- `GEMINI_VISION_MODEL` supplied as a normal environment variable
- `GEMINI_AGENT` supplied as a normal environment variable
- `GEMINI_API_KEY` supplied from Google Secret Manager
- Request timeout of at least 120 seconds; the application itself falls back after the staged Gemini pipeline timeouts

Example deployment after the secret is configured:

```bash
gcloud run deploy snapcade \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_VISION_MODEL=gemini-3-flash-preview,GEMINI_AGENT=antigravity-preview-05-2026 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --timeout 120
```
