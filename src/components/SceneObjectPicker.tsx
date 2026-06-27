"use client";

import type { MouseEvent } from "react";
import type { BoundingBox } from "@/lib/game-spec";
import { pointToBoundingBox } from "@/lib/image-crop";

type PickerProps = {
  imageUrl: string;
  target: "player" | "enemy";
  playerBox: BoundingBox | null;
  onSelect: (box: BoundingBox) => void;
  onUseDefaults: () => void;
};

function overlayStyle([ymin, xmin, ymax, xmax]: BoundingBox) {
  return {
    left: `${xmin / 10}%`,
    top: `${ymin / 10}%`,
    width: `${(xmax - xmin) / 10}%`,
    height: `${(ymax - ymin) / 10}%`,
  };
}

export function SceneObjectPicker({ imageUrl, target, playerBox, onSelect, onUseDefaults }: PickerProps) {
  function selectPoint(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 1000;
    const normalizedY = ((event.clientY - bounds.top) / bounds.height) * 1000;
    onSelect(pointToBoundingBox(normalizedX, normalizedY, 300));
  }

  return (
    <div className="object-picker">
      <div className="picker-heading">
        <small>SAFE SELECTION MODE</small>
        <h2>{target === "player" ? "Who do you control?" : "What should you dodge?"}</h2>
        <p>Click the {target === "player" ? "player" : "enemy"} directly in your scene.</p>
      </div>

      <div className="picker-stage">
        <div className="browser-preview-frame">
          <div className="browser-preview-toolbar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>scene-preview.local</span>
          </div>
          <div className="browser-preview-viewport">
            <button
              className="picker-image-button"
              type="button"
              onClick={selectPoint}
              aria-label={`Select ${target} from scene`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Scene awaiting object selection" />
              {playerBox && <span className="selection-box player" style={overlayStyle(playerBox)} aria-label="Selected player" />}
              <span className="picker-crosshair" aria-hidden="true">+</span>
            </button>
          </div>
        </div>
      </div>

      <div className="picker-footer">
        <span><b>{target === "player" ? "1" : "2"}</b> / 2 objects</span>
        <button type="button" onClick={onUseDefaults}>Use safe defaults</button>
      </div>
    </div>
  );
}
