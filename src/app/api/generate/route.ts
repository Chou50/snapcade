import { GoogleGenAI } from "@google/genai";
import { createGameSpecFromPrompt, GAME_TEMPLATES, sanitizeGameSpec } from "@/lib/game-spec";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 15_000;
const DEFAULT_GEMINI_AGENT = "antigravity-preview-05-2026";
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
    scene: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
          description: "A concise English summary of the uploaded photo and why it fits the chosen game.",
        },
        prompt: {
          type: "string",
          description: "The English game prompt generated from the photo and any user request.",
        },
        objects: {
          type: "array",
          minItems: 3,
          maxItems: 8,
          items: { type: "string" },
          description: "Short labels for visible photo objects that the game runtime should reuse.",
        },
      },
      required: ["summary", "prompt", "objects"],
    },
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
    "scene",
    "player",
    "enemy",
    "difficulty",
    "durationSeconds",
    "theme",
  ],
} as const;

function buildAgentTrace(gameSpec: ReturnType<typeof sanitizeGameSpec>["gameSpec"], source: "managed-agent" | "fallback") {
  const objectList = gameSpec.scene.objects.join(", ");
  return [
    {
      title: source === "managed-agent" ? "Managed agent invoked" : "Local fallback invoked",
      detail: source === "managed-agent"
        ? "Antigravity analyzed the uploaded image and optional prompt in a remote managed environment."
        : "The managed agent was unavailable, so Snapcade used a deterministic local game template.",
      status: "complete",
    },
    {
      title: "Scene understood",
      detail: gameSpec.scene.summary,
      status: "complete",
    },
    {
      title: "Prompt generated",
      detail: gameSpec.scene.prompt,
      status: "complete",
    },
    {
      title: "Game grounded in photo",
      detail: `Runtime tokens: ${objectList}`,
      status: "complete",
    },
    {
      title: "GameSpec validated",
      detail: `${gameSpec.template} game, difficulty ${gameSpec.difficulty}, ${gameSpec.durationSeconds} seconds.`,
      status: "complete",
    },
  ];
}

function safeFallback(prompt: string, warning: string) {
  const { gameSpec } = sanitizeGameSpec({
    ...createGameSpecFromPrompt(prompt),
    objective: prompt || undefined,
  });
  const agentTrace = buildAgentTrace(gameSpec, "fallback");

  return Response.json({
    source: "fallback",
    gameSpec,
    suggestedPrompt: gameSpec.scene.prompt,
    warnings: [warning],
    steps: agentTrace.map((step) => step.title),
    agentTrace,
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

  if (!(image instanceof File)) {
    return Response.json({ error: "An image is required." }, { status: 400 });
  }
  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) {
    return Response.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 415 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image must be 10 MB or smaller." }, { status: 413 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return safeFallback(prompt, "Managed agent is not configured; local prompt template selected");
  }

  const imageData = Buffer.from(await image.arrayBuffer()).toString("base64");
  const client = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const instruction = `
Create a playable mini-game configuration from the uploaded photo.

Optional user request: ${prompt || "(none; generate the prompt from the photo)"}

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
- Generate all user-facing text in English.
- Treat the photo as the source of truth. If the user request is empty, create scene.prompt from the visible objects, setting, and mood of the photo.
- Choose the template that best matches the user's request when it is explicit; otherwise choose the template that fits the photo. Do not default to dodge unless dodging/survival is appropriate.
- Make the game visibly connected to the uploaded photo. scene.objects must be concrete, visible photo objects, not generic icons.
- Title, objective, player label, enemy label, scene.summary, and scene.prompt should mention or adapt the photo setting.
- For link-match, scene.objects should be matchable labels from the photo, such as monitor, keyboard, mug, notebook, chair, or lamp in an office scene.
- Prefer cyberpunk/neon visual language in title, colors, and objective.
- For fish-eat/link-match/oracle/farming/racing/tower-defense/dress-up/bubble-pop, set player.box2d and enemy.box2d to null.
- For dodge only, you may choose visible photo objects and return normalized [ymin, xmin, ymax, xmax] boxes when confident; otherwise return null.
- durationSeconds should match the game style: 90 for timed arcade games, 120 for farming/tower-defense/bubble-pop, 300 for oracle.
- Return JSON only using the provided schema.
`.trim();

  try {
    const requestPromise = client.interactions.create({
      agent: process.env.GEMINI_AGENT || DEFAULT_GEMINI_AGENT,
      environment: { type: "remote" },
      input: [
        { type: "text", text: instruction },
        { type: "image", data: imageData, mime_type: image.type },
      ],
      response_modalities: ["text"],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: gameSpecJsonSchema,
      },
      store: false,
    }, { signal: controller.signal });

    const hardTimeout = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("Managed agent request timed out"));
      }, GEMINI_TIMEOUT_MS);
    });

    const interaction = await Promise.race([requestPromise, hardTimeout]);

    const { gameSpec, warnings } = sanitizeGameSpec(interaction.output_text ?? "");
    const agentTrace = buildAgentTrace(gameSpec, "managed-agent");
    return Response.json({
      source: "managed-agent",
      gameSpec,
      suggestedPrompt: gameSpec.scene.prompt,
      warnings,
      steps: agentTrace.map((step) => step.title),
      agentTrace,
    });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    if (!timedOut) {
      const message = error instanceof Error ? error.message : "Unknown Gemini error";
      console.error("Managed agent generation failed:", message.replaceAll(apiKey, "[redacted]").slice(0, 500));
    }
    return safeFallback(
      prompt,
      timedOut
        ? "Managed agent request timed out; local prompt template selected"
        : "Managed agent request failed; local prompt template selected",
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
