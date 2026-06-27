import { z } from "zod";

export type BoundingBox = [
  ymin: number,
  xmin: number,
  ymax: number,
  xmax: number,
];

export const boundingBoxSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .nullable();

export const gameEntitySchema = z.object({
  label: z.string().min(1).max(40),
  box2d: boundingBoxSchema,
  fallbackAsset: z.enum(["player", "enemy"]),
});

export const gameSpecSchema = z.object({
  version: z.literal("1.0"),
  template: z.literal("dodge"),
  title: z.string().min(1).max(60),
  objective: z.string().min(1).max(100),
  player: gameEntitySchema,
  enemy: gameEntitySchema,
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  durationSeconds: z.number().int().min(8).max(12),
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

export const DEFAULT_GAME_SPEC: GameSpec = {
  version: "1.0",
  template: "dodge",
  title: "Coffee Break Crisis",
  objective: "Protect the laptop and survive",
  player: {
    label: "laptop",
    box2d: null,
    fallbackAsset: "player",
  },
  enemy: {
    label: "coffee cup",
    box2d: null,
    fallbackAsset: "enemy",
  },
  difficulty: 2,
  durationSeconds: 9,
  theme: {
    primaryColor: "#7758FF",
    backgroundTint: "#11100F",
  },
};

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

export function sanitizeGameSpec(input: unknown): SanitizeResult {
  const warnings: string[] = [];
  const raw = parseInput(input, warnings);
  const rawPlayer = asRecord(raw.player);
  const rawEnemy = asRecord(raw.enemy);
  const rawTheme = asRecord(raw.theme);

  const playerBox = sanitizeBox(rawPlayer.box2d, "Player", warnings);
  let enemyBox = sanitizeBox(rawEnemy.box2d, "Enemy", warnings);

  if (playerBox && enemyBox && intersectionOverUnion(playerBox, enemyBox) > 0.75) {
    enemyBox = null;
    warnings.push("Player and enemy boxes overlapped; enemy fallback asset selected");
  }

  const difficulty = clampInteger(raw.difficulty, DEFAULT_GAME_SPEC.difficulty, 1, 3) as 1 | 2 | 3;
  const durationSeconds = clampInteger(raw.durationSeconds, DEFAULT_GAME_SPEC.durationSeconds, 8, 12);

  const gameSpec: GameSpec = {
    version: "1.0",
    template: "dodge",
    title: cleanText(raw.title, DEFAULT_GAME_SPEC.title, 60),
    objective: cleanText(raw.objective, DEFAULT_GAME_SPEC.objective, 100),
    player: {
      label: cleanText(rawPlayer.label, DEFAULT_GAME_SPEC.player.label, 40),
      box2d: playerBox,
      fallbackAsset: "player",
    },
    enemy: {
      label: cleanText(rawEnemy.label, DEFAULT_GAME_SPEC.enemy.label, 40),
      box2d: enemyBox,
      fallbackAsset: "enemy",
    },
    difficulty,
    durationSeconds,
    theme: {
      primaryColor: sanitizeColor(rawTheme.primaryColor, DEFAULT_GAME_SPEC.theme.primaryColor),
      backgroundTint: sanitizeColor(rawTheme.backgroundTint, DEFAULT_GAME_SPEC.theme.backgroundTint),
    },
  };

  return { gameSpec: gameSpecSchema.parse(gameSpec), warnings };
}
