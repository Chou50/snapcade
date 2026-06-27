export function GET() {
  return Response.json({
    status: "ok",
    service: "scene2game",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
}
