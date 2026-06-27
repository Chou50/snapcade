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
