import { GoogleGenAI } from "@google/genai";
import { createGameSpecFromPrompt, GAME_TEMPLATES, sanitizeGameSpec } from "@/lib/game-spec";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GEMINI_VISION_TIMEOUT_MS = 12_000;
const MANAGED_AGENT_TIMEOUT_MS = 55_000;
const DEFAULT_GEMINI_VISION_MODEL = "gemini-3-flash-preview";
const GEMINI_VISION_MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const DEFAULT_GEMINI_AGENT = "antigravity-preview-05-2026";
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AgentTraceStep = {
  title: string;
  detail: string;
  status: "complete" | "error";
};

type SceneAnalysis = {
  summary: string;
  generatedPrompt: string;
  objects: string[];
  recommendedTemplate: (typeof GAME_TEMPLATES)[number];
  titleHint: string;
  objectiveHint: string;
  playerLabel: string;
  enemyLabel: string;
  implementationNotes: string[];
};

class RequestTimeoutError extends Error {}

const sceneAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description: "Concise English description of the uploaded photo, setting, mood, and visible objects.",
    },
    generatedPrompt: {
      type: "string",
      description: "English game prompt generated from the photo and optional user request.",
    },
    objects: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { type: "string" },
      description: "Concrete visible objects from the photo, suitable as gameplay tokens.",
    },
    recommendedTemplate: {
      type: "string",
      enum: [...GAME_TEMPLATES],
      description: "The game template that best fits the photo and optional request.",
    },
    titleHint: {
      type: "string",
      description: "English title suggestion grounded in the photo.",
    },
    objectiveHint: {
      type: "string",
      description: "English objective suggestion grounded in the photo.",
    },
    playerLabel: {
      type: "string",
      description: "Visible photo object or role that should represent the player.",
    },
    enemyLabel: {
      type: "string",
      description: "Visible photo object, hazard, or target that should represent opposition.",
    },
    implementationNotes: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
      description: "Short, reader-facing notes about how the game should reuse the photo.",
    },
  },
  required: [
    "summary",
    "generatedPrompt",
    "objects",
    "recommendedTemplate",
    "titleHint",
    "objectiveHint",
    "playerLabel",
    "enemyLabel",
    "implementationNotes",
  ],
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
  } catch {
    return {};
  }
}

function cleanText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function cleanLabel(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[^A-Za-z0-9 /&-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 24) : null;
}

function sanitizeLabelList(value: unknown, fallback: string[]) {
  const labels: string[] = [];
  const candidates = Array.isArray(value) ? value : [];
  for (const candidate of candidates) {
    const cleaned = cleanLabel(candidate);
    if (!cleaned) continue;
    if (!labels.some((label) => label.toLowerCase() === cleaned.toLowerCase())) labels.push(cleaned);
    if (labels.length >= 8) break;
  }
  for (const label of fallback) {
    if (labels.length >= 6) break;
    if (!labels.some((item) => item.toLowerCase() === label.toLowerCase())) labels.push(label);
  }
  return labels;
}

function sanitizeNoteList(value: unknown, fallback: string[]) {
  const notes: string[] = [];
  const candidates = Array.isArray(value) ? value : [];
  for (const candidate of candidates) {
    const cleaned = cleanText(candidate, "", 96);
    if (!cleaned) continue;
    if (!notes.some((note) => note.toLowerCase() === cleaned.toLowerCase())) notes.push(cleaned);
    if (notes.length >= 5) break;
  }
  for (const note of fallback) {
    if (notes.length >= 3) break;
    if (!notes.some((item) => item.toLowerCase() === note.toLowerCase())) notes.push(note);
  }
  return notes;
}

function sanitizeTemplate(value: unknown): SceneAnalysis["recommendedTemplate"] {
  return typeof value === "string" && (GAME_TEMPLATES as readonly string[]).includes(value)
    ? value as SceneAnalysis["recommendedTemplate"]
    : "link-match";
}

function sanitizeSceneAnalysis(value: unknown, userPrompt: string): SceneAnalysis {
  const raw = parseJsonRecord(value);
  const recommendedTemplate = sanitizeTemplate(raw.recommendedTemplate);
  const fallbackPrompt = userPrompt
    ? `Create an English mini-game prompt from the uploaded photo, adapting this user request: ${userPrompt}`
    : "Create an English mini-game prompt from the visible objects in this photo.";
  const objects = sanitizeLabelList(raw.objects, ["photo object", "main subject", "background item", "light source", "surface", "nearby object"]);
  const generatedPrompt = cleanText(raw.generatedPrompt, fallbackPrompt, 220);

  return {
    summary: cleanText(raw.summary, "Gemini identified the uploaded scene and visible objects.", 140),
    generatedPrompt,
    objects,
    recommendedTemplate,
    titleHint: cleanText(raw.titleHint, "Photo Object Remix", 60),
    objectiveHint: cleanText(raw.objectiveHint, generatedPrompt, 120),
    playerLabel: cleanText(raw.playerLabel, objects[0] ?? "photo object", 40),
    enemyLabel: cleanText(raw.enemyLabel, objects[1] ?? "scene hazard", 40),
    implementationNotes: sanitizeNoteList(raw.implementationNotes, [
      "Use the uploaded photo as the game backdrop",
      "Reuse visible photo objects as gameplay tokens",
    ]),
  };
}

function hasUsableSceneAnalysis(value: Record<string, unknown>) {
  return (
    typeof value.generatedPrompt === "string" &&
    value.generatedPrompt.trim().length > 0 &&
    Array.isArray(value.objects) &&
    value.objects.length >= 3
  );
}

async function withTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  message: string,
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestPromise = request(controller.signal);
    const hardTimeout = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new RequestTimeoutError(message));
      }, timeoutMs);
    });
    return await Promise.race([requestPromise, hardTimeout]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createSpecSeedFromAnalysis(analysis: SceneAnalysis) {
  return {
    template: analysis.recommendedTemplate,
    title: analysis.titleHint,
    objective: analysis.objectiveHint,
    scene: {
      summary: analysis.summary,
      prompt: analysis.generatedPrompt,
      objects: analysis.objects,
    },
    player: {
      label: analysis.playerLabel,
      box2d: null,
      fallbackAsset: "player",
    },
    enemy: {
      label: analysis.enemyLabel,
      box2d: null,
      fallbackAsset: "enemy",
    },
  };
}

function getVisionModelCandidates() {
  const candidates = [
    process.env.GEMINI_VISION_MODEL,
    DEFAULT_GEMINI_VISION_MODEL,
    ...GEMINI_VISION_MODEL_FALLBACKS,
    process.env.GEMINI_MODEL,
  ].filter((model): model is string => Boolean(model));

  return candidates.filter((model, index) => candidates.indexOf(model) === index);
}

async function analyzeSceneWithGeminiVision(
  client: GoogleGenAI,
  imageData: string,
  mimeType: string,
  visionInstruction: string,
  userPrompt: string,
) {
  let lastError: unknown;
  for (const model of getVisionModelCandidates()) {
    try {
      const visionResponse = await withTimeout(
        (signal) => client.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: visionInstruction },
                { inlineData: { data: imageData, mimeType } },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: sceneAnalysisJsonSchema,
            temperature: 0.2,
            maxOutputTokens: 1000,
            abortSignal: signal,
          },
        }),
        GEMINI_VISION_TIMEOUT_MS,
        "Gemini Vision request timed out",
      );
      const rawAnalysis = parseJsonRecord(visionResponse.text ?? "");
      if (!hasUsableSceneAnalysis(rawAnalysis)) {
        throw new Error(`Gemini Vision model ${model} returned an unusable scene analysis`);
      }
      return sanitizeSceneAnalysis(rawAnalysis, userPrompt);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini Vision failed for every configured model");
}

function buildAgentTrace(
  gameSpec: ReturnType<typeof sanitizeGameSpec>["gameSpec"],
  source: "managed-agent" | "fallback",
  analysis?: SceneAnalysis,
): AgentTraceStep[] {
  const objectList = gameSpec.scene.objects.join(", ");
  if (!analysis) {
    return [
      {
        title: "Local fallback invoked",
        detail: "Gemini Vision was unavailable, so Snapcade used a deterministic local game template.",
        status: "complete",
      },
      { title: "GameSpec validated", detail: `${gameSpec.template} game is ready.`, status: "complete" },
    ];
  }

  const trace: AgentTraceStep[] = [
    { title: "Gemini Vision analyzed image", detail: analysis.summary, status: "complete" },
    { title: "Gemini generated prompt", detail: analysis.generatedPrompt, status: "complete" },
  ];

  if (source === "managed-agent") {
    trace.push({
      title: "Managed agent implemented game",
      detail: `Antigravity received the Gemini prompt plus ${analysis.objects.length} photo tokens.`,
      status: "complete",
    });
  } else {
    trace.push({
      title: "Managed agent unavailable",
      detail: "The final implementation step failed, so the Gemini prompt was converted into a safe local GameSpec.",
      status: "error",
    });
  }

  trace.push(
    { title: "Game grounded in photo", detail: `Runtime tokens: ${objectList}`, status: "complete" },
    { title: "GameSpec validated", detail: `${gameSpec.template} game, difficulty ${gameSpec.difficulty}, ${gameSpec.durationSeconds} seconds.`, status: "complete" },
  );
  return trace;
}

function safeFallback(prompt: string, warning: string, analysis?: SceneAnalysis) {
  const fallbackInput = analysis ? createSpecSeedFromAnalysis(analysis) : createGameSpecFromPrompt(prompt);
  const { gameSpec } = sanitizeGameSpec({
    ...fallbackInput,
    objective: analysis ? analysis.objectiveHint : prompt || undefined,
  });
  const agentTrace = buildAgentTrace(gameSpec, "fallback", analysis);

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
    return safeFallback(prompt, "Gemini is not configured; local prompt template selected");
  }

  const imageData = Buffer.from(await image.arrayBuffer()).toString("base64");
  const client = new GoogleGenAI({ apiKey });
  let sceneAnalysis: SceneAnalysis | undefined;

  const visionInstruction = `
Analyze the uploaded photo first, then generate the English prompt that a game-building managed agent should implement.

Optional user request: ${prompt || "(none; infer the game direction from the photo)"}

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
- Treat the photo as the source of truth. Identify concrete visible objects, setting, mood, and affordances.
- If the user request is explicit, adapt it to the photo. Otherwise choose a game template that naturally fits the objects and scene.
- Do not invent generic tokens. For an office photo, use office objects like monitor, keyboard, mug, notebook, chair, cable, or lamp.
- The generatedPrompt must tell the managed agent how the chosen game should visibly reuse the photo.
- Keep generatedPrompt concise but specific enough to implement.
- Return JSON only using the provided schema.
`.trim();

  try {
    sceneAnalysis = await analyzeSceneWithGeminiVision(client, imageData, image.type, visionInstruction, prompt);

    const agentInstruction = `
Return JSON only for a Snapcade GameSpec.

Gemini Vision prompt: ${sceneAnalysis.generatedPrompt}
Scene summary: ${sceneAnalysis.summary}
Photo objects: ${sceneAnalysis.objects.join(", ")}
Recommended template: ${sceneAnalysis.recommendedTemplate}
Title hint: ${sceneAnalysis.titleHint}
Objective hint: ${sceneAnalysis.objectiveHint}
Player label: ${sceneAnalysis.playerLabel}
Enemy label: ${sceneAnalysis.enemyLabel}
Optional user request: ${prompt || "(none)"}

Required fields:
version "1.0"; template one of ${GAME_TEMPLATES.join(", ")}; title; objective; scene { summary, prompt, objects }; player { label, box2d, fallbackAsset "player" }; enemy { label, box2d, fallbackAsset "enemy" }; difficulty 1-3; durationSeconds 30-300; theme { primaryColor, backgroundTint }.

Rules:
- Keep all text in English.
- Preserve or improve the photo object list from Gemini Vision.
- Ground title, objective, scene.summary, and scene.prompt in the photo.
- Use null boxes unless template is dodge and boxes are confidently known.
- Use neon/cyberpunk colors as six-digit hex strings.
`.trim();

    const interaction = await withTimeout(
      (signal) => client.interactions.create({
        agent: process.env.GEMINI_AGENT || DEFAULT_GEMINI_AGENT,
        environment: { type: "remote" },
        input: [{ type: "text", text: agentInstruction }],
        response_modalities: ["text"],
      }, { signal }),
      MANAGED_AGENT_TIMEOUT_MS,
      "Managed agent request timed out",
    );

    const agentOutput = parseJsonRecord(interaction.output_text ?? "");
    const agentScene = asRecord(agentOutput.scene);
    const { gameSpec, warnings } = sanitizeGameSpec({
      ...createSpecSeedFromAnalysis(sceneAnalysis),
      ...agentOutput,
      scene: {
        summary: agentScene.summary ?? sceneAnalysis.summary,
        prompt: agentScene.prompt ?? sceneAnalysis.generatedPrompt,
        objects: agentScene.objects ?? sceneAnalysis.objects,
      },
    });
    const agentTrace = buildAgentTrace(gameSpec, "managed-agent", sceneAnalysis);
    return Response.json({
      source: "managed-agent",
      gameSpec,
      suggestedPrompt: sceneAnalysis.generatedPrompt,
      warnings,
      steps: agentTrace.map((step) => step.title),
      agentTrace,
    });
  } catch (error) {
    const timedOut = error instanceof RequestTimeoutError;
    if (!timedOut) {
      const message = error instanceof Error ? error.message : "Unknown Gemini error";
      console.error("Gemini generation pipeline failed:", message.replaceAll(apiKey, "[redacted]").slice(0, 500));
    }
    return safeFallback(
      prompt,
      sceneAnalysis
        ? timedOut
          ? "Managed agent timed out after Gemini Vision generated a prompt; local GameSpec selected"
          : "Managed agent failed after Gemini Vision generated a prompt; local GameSpec selected"
        : timedOut
          ? "Gemini Vision request timed out; local prompt template selected"
          : "Gemini Vision analysis failed; local prompt template selected",
      sceneAnalysis,
    );
  }
}
