import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_GAME_SPEC, gameSpecSchema, inferGameTemplate, sanitizeGameSpec } from "./game-spec";

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
  assert.equal(result.gameSpec.durationSeconds, 30);
  assert.deepEqual(result.gameSpec.player.box2d, [0, 0, 60, 60]);
  assert.equal(result.gameSpec.theme.primaryColor, "#ABCDEF");
  assert.equal(result.gameSpec.theme.backgroundTint, "#11100F");
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
  assert.equal(result.gameSpec.template, DEFAULT_GAME_SPEC.template);
  assert.equal(gameSpecSchema.safeParse(result.gameSpec).success, true);
});

test("Chinese prompts are classified into supported game templates", () => {
  assert.equal(inferGameTemplate("做一个赛博朋克霓虹风的大鱼吃小鱼游戏"), "fish-eat");
  assert.equal(inferGameTemplate("做一个发光IT图标连连看游戏"), "link-match");
  assert.equal(inferGameTemplate("中心是发光水晶球的占卜塔罗游戏"), "oracle");
  assert.equal(inferGameTemplate("霓虹网格农田里播种浇水收获电子作物"), "farming");
  assert.equal(inferGameTemplate("俯视角赛车游戏，深夜赛道漂移超车"), "racing");
  assert.equal(inferGameTemplate("赛博朋克风的塔防游戏，建造防御塔"), "tower-defense");
  assert.equal(inferGameTemplate("赛博朋克风的换装小游戏，模特衣服配饰发型"), "dress-up");
  assert.equal(inferGameTemplate("满屏塑料泡泡的解压小游戏"), "bubble-pop");
  assert.equal(inferGameTemplate("塔防游戏，中心是蓝色霓虹赛道，玩家建造防御塔"), "tower-defense");
});

test("prompt text can drive a sanitized non-dodge template", () => {
  const result = sanitizeGameSpec({
    objective: "做一个赛博朋克风的塔防游戏",
    durationSeconds: 999,
  });
  assert.equal(result.gameSpec.template, "tower-defense");
  assert.equal(result.gameSpec.durationSeconds, 300);
  assert.equal(gameSpecSchema.safeParse(result.gameSpec).success, true);
});
