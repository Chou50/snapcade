# Snapcade

Turn a photo of the current scene into a playable nine-second dodge game.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local`:

```env
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.5-flash
```

The application never sends the API key to the browser. If Gemini is unavailable, generation returns a safe `GameSpec` and asks the user to select the player and enemy directly in the image.

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
- `GEMINI_MODEL` supplied as a normal environment variable
- `GEMINI_API_KEY` supplied from Google Secret Manager
- Request timeout of at least 60 seconds; the application itself falls back after 15 seconds

Example deployment after the secret is configured:

```bash
gcloud run deploy snapcade \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_MODEL=gemini-3.5-flash \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --timeout 60
```
