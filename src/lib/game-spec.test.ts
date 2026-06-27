import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GAME_SPEC, gameSpecSchema, sanitizeGameSpec } from "./game-spec";

test("invalid JSON returns a valid default game", () => {
  const result = sanitizeGameSpec("definitely not json");
  assert.deepEqual(result.gameSpec, DEFAULT_GAME_SPEC);
  assert.equal(gameSpecSchema.safeParse(result.gameSpec).success, true);
  assert.equal(result.warnings.length, 1);
});

test("markdown JSON, numbers, colors and text are normalized", () => {
  const result = sanitizeGameSpec(`\`\`\`json
  {
    "title": "  Tiny\\nGame  ",
    "objective": "Survive",
    "difficulty": 99,
    "durationSeconds": "4",
    "player": {"label": "laptop", "box2d": [-20, 10, 50, 45]},
    "enemy": {"label": "cup", "box2d": [100, 200, 300, 400]},
    "theme": {"primaryColor": "#abcdef", "backgroundTint": "not-a-color"}
  }
  \`\`\``);

  assert.equal(result.gameSpec.title, "Tiny Game");
  assert.equal(result.gameSpec.difficulty, 3);
  assert.equal(result.gameSpec.durationSeconds, 8);
  assert.deepEqual(result.gameSpec.player.box2d, [0, 0, 60, 60]);
  assert.equal(result.gameSpec.theme.primaryColor, "#ABCDEF");
  assert.equal(result.gameSpec.theme.backgroundTint, DEFAULT_GAME_SPEC.theme.backgroundTint);
});

test("reversed and overlapping boxes cannot crash the runtime", () => {
  const reversed = sanitizeGameSpec({
    player: { box2d: [500, 500, 100, 100] },
    enemy: { box2d: [100, 100, 300, 300] },
  });
  assert.equal(reversed.gameSpec.player.box2d, null);

  const overlap = sanitizeGameSpec({
    player: { box2d: [100, 100, 400, 400] },
    enemy: { box2d: [105, 105, 395, 395] },
  });
  assert.equal(overlap.gameSpec.enemy.box2d, null);
  assert.match(overlap.warnings.join(" "), /overlapped/);
});

test("unexpected object shapes still produce a strict valid GameSpec", () => {
  const result = sanitizeGameSpec({
    template: "execute-arbitrary-code",
    title: { nested: true },
    player: "oops",
    enemy: [1, 2, 3],
    difficulty: Number.NaN,
  });
  assert.equal(result.gameSpec.template, "dodge");
  assert.equal(gameSpecSchema.safeParse(result.gameSpec).success, true);
});
