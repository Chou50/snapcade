import { GoogleGenAI } from "@google/genai";
import { createGameSpecFromPrompt, GAME_TEMPLATES, sanitizeGameSpec } from "@/lib/game-spec";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 15_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const boxSchema = {
  anyOf: [
    {
      type: "array",
      items: { type: "integer", minimum: 0, maximum: 1000 },
      minItems: 4,
      maxItems: 4,
    },
    { type: "null" },
  ],
};

const gameSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    version: { type: "string", enum: ["1.0"] },
    template: {
      type: "string",
      enum: [...GAME_TEMPLATES],
      description: "The playable mini-game template chosen from the user prompt.",
    },
    title: { type: "string", description: "A short, cyberpunk/neon game title." },
    objective: { type: "string", description: "One sentence describing how to play or win." },
    player: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string", description: "The player-controlled entity or role." },
        box2d: {
          ...boxSchema,
          description: "[ymin, xmin, ymax, xmax] normalized to 0-1000 for photo-object games; null for prompt-native games.",
        },
        fallbackAsset: { type: "string", enum: ["player"] },
      },
      required: ["label", "box2d", "fallbackAsset"],
    },
    enemy: {
      type: "object",
      additionalProperties: false,
      properties: {
        label: { type: "string", description: "The main hazard, timer, target, or enemy." },
        box2d: {
          ...boxSchema,
          description: "[ymin, xmin, ymax, xmax] normalized to 0-1000 for photo-object games; null for prompt-native games.",
        },
        fallbackAsset: { type: "string", enum: ["enemy"] },
      },
      required: ["label", "box2d", "fallbackAsset"],
    },
    difficulty: { type: "integer", minimum: 1, maximum: 3 },
    durationSeconds: { type: "integer", minimum: 30, maximum: 300 },
    theme: {
      type: "object",
      additionalProperties: false,
      properties: {
        primaryColor: { type: "string", description: "A six-digit hexadecimal neon accent color such as #A855F7." },
        backgroundTint: { type: "string", description: "A dark six-digit hexadecimal background tint." },
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
    ...createGameSpecFromPrompt(prompt),
    objective: prompt,
  });

  return Response.json({
    source: "fallback",
    gameSpec,
    warnings: [warning],
    steps: ["Prompt classified", `${gameSpec.template} template selected`, "Playable game prepared"],
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
    return safeFallback(prompt, "Gemini is not configured; local prompt template selected");
  }

  const imageData = Buffer.from(await image.arrayBuffer()).toString("base64");
  const client = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const instruction = `
Create a playable mini-game configuration from the user's request.

User request: ${prompt}

Allowed templates:
- fish-eat: big-fish-eats-small-fish evolution game.
- link-match: connect/match identical icons to remove them.
- oracle: crystal ball and tarot card fortune game.
- farming: sow, water, harvest neon crops.
- racing: top-down neon racing game.
- tower-defense: place towers beside a neon track to stop enemies.
- dress-up: outfit/model styling game.
- bubble-pop: full-screen bubble wrap pop game.
- dodge: photo-object dodge/survival game.

Rules:
- Choose the template that best matches the user's request. Do not default to dodge unless the user asks for dodging/survival.
- Prefer cyberpunk/neon visual language in title, colors, and objective when the user asks for it.
- For fish-eat/link-match/oracle/farming/racing/tower-defense/dress-up/bubble-pop, set player.box2d and enemy.box2d to null.
- For dodge only, you may choose visible photo objects and return normalized [ymin, xmin, ymax, xmax] boxes when confident; otherwise return null.
- durationSeconds should match the game style: 90 for timed arcade games, 120 for farming/tower-defense/bubble-pop, 300 for oracle.
- Return JSON only using the provided schema.
`.trim();

  try {
    const requestPromise = client.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
      contents: [
        { text: instruction },
        { inlineData: { data: imageData, mimeType: image.type } },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: gameSpecJsonSchema,
        temperature: 0.25,
        maxOutputTokens: 1200,
        abortSignal: controller.signal,
      },
    });

    const hardTimeout = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Gemini request timed out"));
      }, GEMINI_TIMEOUT_MS);
    });

    const response = await Promise.race([requestPromise, hardTimeout]);

    const { gameSpec, warnings } = sanitizeGameSpec(response.text ?? "");
    return Response.json({
      source: "gemini",
      gameSpec,
      warnings,
      steps: ["Prompt analyzed", `${gameSpec.template} template selected`, "Game configuration validated"],
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
        ? "Gemini request timed out; local prompt template selected"
        : "Gemini request failed; local prompt template selected",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
