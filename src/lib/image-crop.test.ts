import assert from "node:assert/strict";
import test from "node:test";
import { boxToSourceCrop, pointToBoundingBox } from "./image-crop";

test("converts Gemini yxyx coordinates into source image pixels", () => {
  assert.deepEqual(boxToSourceCrop([100, 250, 600, 750], 1200, 800), {
    x: 300,
    y: 80,
    width: 600,
    height: 400,
  });
});

test("creates a stable click-selection box and keeps it in bounds", () => {
  assert.deepEqual(pointToBoundingBox(500, 500), [410, 410, 590, 590]);
  assert.deepEqual(pointToBoundingBox(10, 990), [820, 0, 1000, 180]);
});
