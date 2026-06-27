import { GoogleGenAI } from "@google/genai";
import { DEFAULT_GAME_SPEC, sanitizeGameSpec } from "@/lib/game-spec";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 15_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const gameSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", enum: ["1.0"] },
    template: { type: "string", enum: ["dodge"] },
    title: { type: "string", description: "A short, playful game title." },
    objective: { type: "string", description: "One sentence describing how to win." },
    player: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string", description: "The visible object controlled by the player." },
        box2d: {
          type: ["array", "null"],
          description: "[ymin, xmin, ymax, xmax], integers normalized to 0-1000, or null when not confidently visible.",
          items: { type: "integer", minimum: 0, maximum: 1000 },
          minItems: 4,
          maxItems: 4,
        },
        fallbackAsset: { type: "string", enum: ["player"] },
      },
      required: ["label", "box2d", "fallbackAsset"],
    },
    enemy: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string", description: "The visible object the player must dodge." },
        box2d: {
          type: ["array", "null"],
          description: "[ymin, xmin, ymax, xmax], integers normalized to 0-1000, or null when not confidently visible.",
          items: { type: "integer", minimum: 0, maximum: 1000 },
          minItems: 4,
          maxItems: 4,
        },
        fallbackAsset: { type: "string", enum: ["enemy"] },
      },
      required: ["label", "box2d", "fallbackAsset"],
    },
    difficulty: { type: "integer", enum: [1, 2, 3] },
    durationSeconds: { type: "integer", minimum: 8, maximum: 12 },
    theme: {
      type: "object",
      additionalProperties: false,
      properties: {
        primaryColor: { type: "string", description: "A six-digit hexadecimal color such as #7758FF." },
        backgroundTint: { type: "string", description: "A dark six-digit hexadecimal color." },
      },
      required: ["primaryColor", "backgroundTint"],
    },
  },
  required: [
    "version",
    "template",
    "title",
    "objective",
    "player",
    "enemy",
    "difficulty",
    "durationSeconds",
    "theme",
  ],
} as const;

function safeFallback(prompt: string, warning: string) {
  const { gameSpec } = sanitizeGameSpec({
    ...DEFAULT_GAME_SPEC,
    objective: prompt,
  });

  return Response.json({
    source: "fallback",
    gameSpec,
    warnings: [warning],
    steps: ["Scene received", "Safe defaults prepared", "Manual object selection ready"],
  });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const image = formData.get("image");
  const rawPrompt = formData.get("prompt");
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim().slice(0, 300) : "";

  if (!(image instanceof File) || !prompt) {
    return Response.json({ error: "An image and prompt are required." }, { status: 400 });
  }
  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
    return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 415 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image must be 10 MB or smaller." }, { status: 413 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return safeFallback(prompt, "Gemini is not configured; manual selection enabled");
  }

  const imageData = Buffer.from(await image.arrayBuffer()).toString("base64");
  const client = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const instruction = `
Create a short dodge game from the supplied scene and user request.

User request: ${prompt}

Rules:
- Use only the fixed template "dodge".
- Choose one clearly visible object as the player and one clearly visible, different object as the enemy.
- Bounding boxes must be [ymin, xmin, ymax, xmax], normalized to integer coordinates from 0 to 1000.
- Never invent coordinates. Return null for box2d if the requested object is not confidently visible.
- The player and enemy boxes must describe different objects.
- Keep durationSeconds between 8 and 12. Prefer 9 for a live demo.
- Return JSON only using the provided schema.
`.trim();

  try {
    const requestPromise = client.interactions.create(
        {
          model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
          input: [
            { type: "text", text: instruction },
            { type: "image", data: imageData, mime_type: image.type },
          ],
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: gameSpecJsonSchema,
          },
        },
        {
          timeout: GEMINI_TIMEOUT_MS,
          maxRetries: 0,
          fetchOptions: { signal: controller.signal },
        },
      );

    const hardTimeout = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Gemini request timed out"));
      }, GEMINI_TIMEOUT_MS);
    });

    const interaction = await Promise.race([requestPromise, hardTimeout]);

    const { gameSpec, warnings } = sanitizeGameSpec(interaction.output_text ?? "");
    return Response.json({
      source: "gemini",
      gameSpec,
      warnings,
      steps: ["Scene analyzed", `${gameSpec.player.label} and ${gameSpec.enemy.label} detected`, "Game configuration validated"],
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    if (!timedOut) {
      const message = error instanceof Error ? error.message : "Unknown Gemini error";
      console.error("Gemini generation failed:", message.replaceAll(apiKey, "[redacted]").slice(0, 500));
    }
    return safeFallback(
      prompt,
      timedOut
        ? "Gemini request timed out; manual selection enabled"
        : "Gemini request failed; manual selection enabled",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
