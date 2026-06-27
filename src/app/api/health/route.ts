export function GET() {
  return Response.json({
    status: "ok",
    service: "snapcade",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
}
