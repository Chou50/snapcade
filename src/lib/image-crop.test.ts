import assert from "node:assert/strict";
import test from "node:test";
import { boxToSourceCrop } from "./image-crop";

test("converts Gemini yxyx coordinates into source image pixels", () => {
  assert.deepEqual(boxToSourceCrop([100, 250, 600, 750], 1200, 800), {
    x: 300,
    y: 80,
    width: 600,
    height: 400,
  });
});
