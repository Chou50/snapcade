import type { BoundingBox } from "./game-spec";

export type SourceCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function boxToSourceCrop(
  [ymin, xmin, ymax, xmax]: BoundingBox,
  imageWidth: number,
  imageHeight: number,
): SourceCrop {
  return {
    x: (xmin / 1000) * imageWidth,
    y: (ymin / 1000) * imageHeight,
    width: ((xmax - xmin) / 1000) * imageWidth,
    height: ((ymax - ymin) / 1000) * imageHeight,
  };
}

export function pointToBoundingBox(
  normalizedX: number,
  normalizedY: number,
  size = 180,
): BoundingBox {
  const safeSize = Math.min(500, Math.max(60, Math.round(size)));
  const half = safeSize / 2;
  const centerX = Math.min(1000, Math.max(0, normalizedX));
  const centerY = Math.min(1000, Math.max(0, normalizedY));

  let xmin = Math.round(centerX - half);
  let ymin = Math.round(centerY - half);
  xmin = Math.min(1000 - safeSize, Math.max(0, xmin));
  ymin = Math.min(1000 - safeSize, Math.max(0, ymin));

  return [ymin, xmin, ymin + safeSize, xmin + safeSize];
}
