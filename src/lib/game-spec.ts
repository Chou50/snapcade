import { z } from "zod";

export type BoundingBox = [
  ymin: number,
  xmin: number,
  ymax: number,
  xmax: number,
];

export const GAME_TEMPLATES = [
  "fish-eat",
  "link-match",
  "oracle",
  "farming",
  "racing",
  "tower-defense",
  "dress-up",
  "bubble-pop",
  "dodge",
] as const;

export type GameTemplate = (typeof GAME_TEMPLATES)[number];

const GAME_TEMPLATE_SET = new Set<string>(GAME_TEMPLATES);

export const boundingBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .nullable();

export const gameEntitySchema = z.object({
  label: z.string().min(1).max(40),
  box2d: boundingBoxSchema,
  fallbackAsset: z.enum(["player", "enemy"]),
});

export const sceneSchema = z.object({
  summary: z.string().min(1).max(140),
  prompt: z.string().min(1).max(220),
  objects: z.array(z.string().min(1).max(24)).min(3).max(8),
});

export const gameSpecSchema = z.object({
  version: z.literal("1.0"),
  template: z.enum(GAME_TEMPLATES),
  title: z.string().min(1).max(60),
  objective: z.string().min(1).max(120),
  scene: sceneSchema,
  player: gameEntitySchema,
  enemy: gameEntitySchema,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  durationSeconds: z.number().int().min(30).max(300),
  theme: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    backgroundTint: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }),
});

export type GameSpec = z.infer<typeof gameSpecSchema>;

export type SanitizeResult = {
  gameSpec: GameSpec;
  warnings: string[];
};

type TemplateDefaults = Pick<GameSpec, "title" | "objective" | "durationSeconds"> & {
  playerLabel: string;
  enemyLabel: string;
  primaryColor: string;
  backgroundTint: string;
  sceneSummary: string;
  sceneObjects: string[];
};

const TEMPLATE_DEFAULTS: Record<GameTemplate, TemplateDefaults> = {
  "fish-eat": {
    title: "Neon Abyss Hunter",
    objective: "Eat smaller glow fish to evolve",
    durationSeconds: 90,
    playerLabel: "geometric neon fish",
    enemyLabel: "larger predator fish",
    primaryColor: "#A855F7",
    backgroundTint: "#050816",
    sceneSummary: "A photographed scene remixed into a neon underwater arena.",
    sceneObjects: ["desk fish", "lamp reef", "screen coral", "chair current", "mug pearl", "keyboard shell"],
  },
  "link-match": {
    title: "Code Match Connect",
    objective: "Connect matching IT icons to clear the grid",
    durationSeconds: 90,
    playerLabel: "cursor",
    enemyLabel: "clock",
    primaryColor: "#38BDF8",
    backgroundTint: "#03111F",
    sceneSummary: "A photographed workspace turned into a memory matching board.",
    sceneObjects: ["laptop", "monitor", "keyboard", "coffee mug", "notebook", "desk lamp"],
  },
  oracle: {
    title: "Mystic Oracle",
    objective: "Draw a neon tarot card and reveal a reading",
    durationSeconds: 300,
    playerLabel: "tarot seeker",
    enemyLabel: "fading cosmic energy",
    primaryColor: "#C084FC",
    backgroundTint: "#090617",
    sceneSummary: "A photographed scene interpreted as a neon fortune table.",
    sceneObjects: ["photo omen", "light pattern", "table mark", "shadow sign", "object clue", "color aura"],
  },
  farming: {
    title: "Neon Harvest",
    objective: "Water and harvest electronic crops for coins",
    durationSeconds: 120,
    playerLabel: "cyber farmer",
    enemyLabel: "empty plots",
    primaryColor: "#FACC15",
    backgroundTint: "#061519",
    sceneSummary: "A photographed room reimagined as a compact neon farm.",
    sceneObjects: ["desk plot", "lamp seed", "chair crop", "notebook bed", "cup planter", "cable vine"],
  },
  racing: {
    title: "Cyber Racer",
    objective: "Drift through the neon track and collect coins",
    durationSeconds: 90,
    playerLabel: "neon race car",
    enemyLabel: "traffic drones",
    primaryColor: "#22D3EE",
    backgroundTint: "#070A1A",
    sceneSummary: "A photographed scene converted into a glowing race track.",
    sceneObjects: ["desk straight", "cable curve", "chair gate", "screen tunnel", "mug cone", "lamp beacon"],
  },
  "tower-defense": {
    title: "Circuit Tower Defense",
    objective: "Build glowing towers to stop red neon enemies",
    durationSeconds: 120,
    playerLabel: "defense towers",
    enemyLabel: "red neon enemies",
    primaryColor: "#60A5FA",
    backgroundTint: "#06111D",
    sceneSummary: "A photographed scene mapped into a defendable circuit route.",
    sceneObjects: ["monitor tower", "keyboard wall", "mug base", "lamp turret", "desk lane", "chair gate"],
  },
  "dress-up": {
    title: "Neon Style Lab",
    objective: "Style the neon model before the countdown ends",
    durationSeconds: 90,
    playerLabel: "neon model",
    enemyLabel: "style timer",
    primaryColor: "#F472B6",
    backgroundTint: "#100516",
    sceneSummary: "A photographed scene translated into a neon styling palette.",
    sceneObjects: ["jacket", "screen glow", "desk trim", "lamp halo", "chair silhouette", "color accent"],
  },
  "bubble-pop": {
    title: "Bubble Pop Reset",
    objective: "Pop every plastic bubble and refresh the sheet",
    durationSeconds: 120,
    playerLabel: "finger tap",
    enemyLabel: "un-popped bubbles",
    primaryColor: "#7DD3FC",
    backgroundTint: "#07111E",
    sceneSummary: "A photographed scene transformed into tactile bubble targets.",
    sceneObjects: ["desk bubble", "screen bubble", "mug bubble", "chair bubble", "lamp bubble", "cable bubble"],
  },
  dodge: {
    title: "Coffee Break Crisis",
    objective: "Protect the laptop and survive",
    durationSeconds: 45,
    playerLabel: "laptop",
    enemyLabel: "coffee cup",
    primaryColor: "#7758FF",
    backgroundTint: "#11100F",
    sceneSummary: "A photographed scene where one object must dodge another.",
    sceneObjects: ["laptop", "coffee cup", "desk", "keyboard", "lamp", "notebook"],
  },
};

export const DEFAULT_GAME_SPEC: GameSpec = makeDefaultSpec("fish-eat");

function makeDefaultSpec(template: GameTemplate): GameSpec {
  const defaults = TEMPLATE_DEFAULTS[template];
  return {
    version: "1.0",
    template,
    title: defaults.title,
    objective: defaults.objective,
    scene: {
      summary: defaults.sceneSummary,
      prompt: defaults.objective,
      objects: defaults.sceneObjects,
    },
    player: {
      label: defaults.playerLabel,
      box2d: null,
      fallbackAsset: "player",
    },
    enemy: {
      label: defaults.enemyLabel,
      box2d: null,
      fallbackAsset: "enemy",
    },
    difficulty: 2,
    durationSeconds: defaults.durationSeconds,
    theme: {
      primaryColor: defaults.primaryColor,
      backgroundTint: defaults.backgroundTint,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseInput(input: unknown, warnings: string[]): Record<string, unknown> {
  if (typeof input !== "string") return asRecord(input);

  const normalized = input
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return asRecord(JSON.parse(normalized));
  } catch {
    warnings.push("AI output was not valid JSON; safe defaults applied");
    return {};
  }
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function cleanSceneObject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[^A-Za-z0-9 /&-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 24);
}

function sanitizeSceneObjects(value: unknown, defaults: string[]): string[] {
  const candidates = Array.isArray(value) ? value : [];
  const objects: string[] = [];
  for (const candidate of candidates) {
    const cleaned = cleanSceneObject(candidate);
    if (!cleaned) continue;
    const duplicate = objects.some((item) => item.toLowerCase() === cleaned.toLowerCase());
    if (!duplicate) objects.push(cleaned);
    if (objects.length >= 8) break;
  }

  for (const fallback of defaults) {
    if (objects.length >= 6) break;
    const duplicate = objects.some((item) => item.toLowerCase() === fallback.toLowerCase());
    if (!duplicate) objects.push(fallback);
  }

  return objects.slice(0, 8);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function sanitizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
    ? value.toUpperCase()
    : fallback;
}

function sanitizeBox(value: unknown, path: string, warnings: string[]): BoundingBox | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== 4) {
    warnings.push(`${path} bounding box was malformed; fallback asset selected`);
    return null;
  }

  const coordinates = value.map((coordinate) => Number(coordinate));
  if (coordinates.some((coordinate) => !Number.isFinite(coordinate))) {
    warnings.push(`${path} bounding box contained invalid coordinates; fallback asset selected`);
    return null;
  }

  let [ymin, xmin, ymax, xmax] = coordinates.map((coordinate) =>
    Math.min(1000, Math.max(0, Math.round(coordinate))),
  );

  if (ymax <= ymin || xmax <= xmin) {
    warnings.push(`${path} bounding box had reversed edges; fallback asset selected`);
    return null;
  }

  const minimumSize = 60;
  if (ymax - ymin < minimumSize) {
    const center = (ymin + ymax) / 2;
    ymin = Math.max(0, Math.round(center - minimumSize / 2));
    ymax = Math.min(1000, ymin + minimumSize);
    ymin = Math.max(0, ymax - minimumSize);
  }
  if (xmax - xmin < minimumSize) {
    const center = (xmin + xmax) / 2;
    xmin = Math.max(0, Math.round(center - minimumSize / 2));
    xmax = Math.min(1000, xmin + minimumSize);
    xmin = Math.max(0, xmax - minimumSize);
  }

  return [ymin, xmin, ymax, xmax];
}

function intersectionOverUnion(a: BoundingBox, b: BoundingBox): number {
  const intersectionHeight = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const intersectionWidth = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const intersection = intersectionHeight * intersectionWidth;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return intersection / Math.max(1, areaA + areaB - intersection);
}

function textIncludesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function inferGameTemplate(prompt: string): GameTemplate {
  const text = prompt.toLowerCase();

  if (textIncludesAny(text, ["泡泡", "bubble", "pop", "解压", "啪", "plastic"])) return "bubble-pop";
  if (textIncludesAny(text, ["连连看", "match", "connect", "连接", "消除", "图标", "icon", "code match"])) return "link-match";
  if (textIncludesAny(text, ["占卜", "oracle", "tarot", "塔罗", "水晶", "crystal", "抽牌", "解签"])) return "oracle";
  if (textIncludesAny(text, ["种田", "farm", "harvest", "播种", "浇水", "收获", "作物", "crop"])) return "farming";
  if (textIncludesAny(text, ["塔防", "tower", "defense", "防御塔", "波次", "炮塔"])) return "tower-defense";
  if (textIncludesAny(text, ["赛车", "race", "racer", "car", "漂移", "赛道", "跑车", "drift"])) return "racing";
  if (textIncludesAny(text, ["换装", "dress", "dress-up", "fashion", "outfit", "模特", "衣服", "配饰", "发型"])) return "dress-up";
  if (textIncludesAny(text, ["鱼", "fish", "大鱼吃小鱼", "吞噬", "海底", "进化"])) return "fish-eat";
  if (textIncludesAny(text, ["dodge", "躲", "躲避", "survival", "survive", "enemy", "falling"])) return "dodge";

  return DEFAULT_GAME_SPEC.template;
}

function sanitizeTemplate(raw: unknown, promptText: string): GameTemplate {
  if (typeof raw === "string" && GAME_TEMPLATE_SET.has(raw)) return raw as GameTemplate;
  return inferGameTemplate(promptText);
}

export function createGameSpecFromPrompt(prompt: string): GameSpec {
  const template = inferGameTemplate(prompt);
  const defaults = makeDefaultSpec(template);
  const cleanPrompt = cleanText(prompt, defaults.objective, 220);
  return {
    ...defaults,
    objective: cleanText(prompt, defaults.objective, 120),
    scene: {
      ...defaults.scene,
      prompt: cleanPrompt,
    },
  };
}

export function sanitizeGameSpec(input: unknown): SanitizeResult {
  const warnings: string[] = [];
  const raw = parseInput(input, warnings);
  const promptText = [
    raw.prompt,
    raw.objective,
    raw.title,
    raw.genre,
    raw.template,
    asRecord(raw.scene).prompt,
    asRecord(raw.scene).summary,
  ].filter((value): value is string => typeof value === "string").join(" ");
  const template = sanitizeTemplate(raw.template, promptText);
  const defaults = makeDefaultSpec(template);
  const rawPlayer = asRecord(raw.player);
  const rawEnemy = asRecord(raw.enemy);
  const rawTheme = asRecord(raw.theme);
  const rawScene = asRecord(raw.scene);

  const playerBox = sanitizeBox(rawPlayer.box2d, "Player", warnings);
  let enemyBox = sanitizeBox(rawEnemy.box2d, "Enemy", warnings);

  if (playerBox && enemyBox && intersectionOverUnion(playerBox, enemyBox) > 0.75) {
    enemyBox = null;
    warnings.push("Player and enemy boxes overlapped; enemy fallback asset selected");
  }

  const difficulty = clampInteger(raw.difficulty, defaults.difficulty, 1, 3) as 1 | 2 | 3;
  const durationSeconds = clampInteger(raw.durationSeconds, defaults.durationSeconds, 30, 300);

  const gameSpec: GameSpec = {
    version: "1.0",
    template,
    title: cleanText(raw.title, defaults.title, 60),
    objective: cleanText(raw.objective, defaults.objective, 120),
    scene: {
      summary: cleanText(rawScene.summary, defaults.scene.summary, 140),
      prompt: cleanText(rawScene.prompt, defaults.scene.prompt, 220),
      objects: sanitizeSceneObjects(rawScene.objects, defaults.scene.objects),
    },
    player: {
      label: cleanText(rawPlayer.label, defaults.player.label, 40),
      box2d: playerBox,
      fallbackAsset: "player",
    },
    enemy: {
      label: cleanText(rawEnemy.label, defaults.enemy.label, 40),
      box2d: enemyBox,
      fallbackAsset: "enemy",
    },
    difficulty,
    durationSeconds,
    theme: {
      primaryColor: sanitizeColor(rawTheme.primaryColor, defaults.theme.primaryColor),
      backgroundTint: sanitizeColor(rawTheme.backgroundTint, defaults.theme.backgroundTint),
    },
  };

  return { gameSpec: gameSpecSchema.parse(gameSpec), warnings };
}
