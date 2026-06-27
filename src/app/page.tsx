"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { DodgeGame } from "@/components/DodgeGame";
import { DEFAULT_GAME_SPEC, GameSpec, sanitizeGameSpec } from "@/lib/game-spec";

const EXAMPLE_PROMPTS = [
  "I control the laptop. Make the coffee cup the enemy.",
  "Turn this desk into a 10-second survival game.",
  "Let me dodge everything except the blue object.",
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]);
  const [dragging, setDragging] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [gameSpec, setGameSpec] = useState<GameSpec>(DEFAULT_GAME_SPEC);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function loadFile(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setFileName(file.name);
    setGameReady(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    loadFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  }

  function loadDemoScene() {
    setImageUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return "/demo-scene.svg";
    });
    setFileName("Tokyo build lab · demo scene");
    setGameReady(false);
  }

  function generateGame() {
    const { gameSpec: safeSpec } = sanitizeGameSpec({
      ...DEFAULT_GAME_SPEC,
      objective: prompt,
      player: {
        ...DEFAULT_GAME_SPEC.player,
        box2d: imageUrl === "/demo-scene.svg" ? [356, 296, 731, 713] : null,
      },
      enemy: {
        ...DEFAULT_GAME_SPEC.enemy,
        box2d: imageUrl === "/demo-scene.svg" ? [336, 142, 688, 321] : null,
      },
    });
    setGameSpec(safeSpec);
    setGameReady(true);
  }

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="Scene2Game home">
          <span className="brand-mark" aria-hidden="true">S2G</span>
          <span>Scene2Game</span>
        </a>
        <div className="status-pill"><span /> Gemini powered</div>
      </nav>

      <section id="top" className="hero shell">
        <div className="eyebrow">REALITY, REMIXED</div>
        <h1>Turn this moment<br />into a <em>playable game.</em></h1>
        <p>Upload what you see. Describe the challenge. Play it seconds later.</p>
      </section>

      <section className="studio shell" aria-label="Game creation studio">
        <div className="control-panel">
          <div className="step-heading">
            <span>01</span>
            <div><h2>Show us your world</h2><p>Take a photo or upload one.</p></div>
          </div>

          <button
            className={`dropzone ${dragging ? "is-dragging" : ""} ${imageUrl ? "has-image" : ""}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="Uploaded scene preview" />
                <span className="replace-image">Replace image</span>
              </>
            ) : (
              <>
                <span className="upload-icon" aria-hidden="true">↗</span>
                <strong>Drop a scene here</strong>
                <span>or click to choose an image</span>
                <small>PNG, JPG or WEBP · up to 10 MB</small>
              </>
            )}
          </button>
          <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
          <div className="upload-meta">
            <span>{fileName ? `Selected: ${fileName}` : "No scene selected"}</span>
            <button type="button" onClick={loadDemoScene}>Use demo scene</button>
          </div>

          <div className="divider" />

          <div className="step-heading">
            <span>02</span>
            <div><h2>Direct the action</h2><p>Tell us who you are and what to dodge.</p></div>
          </div>
          <label className="prompt-field">
            <span>YOUR GAME PROMPT</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={300} />
            <small>{prompt.length}/300</small>
          </label>
          <div className="prompt-examples">
            {EXAMPLE_PROMPTS.map((example, index) => (
              <button type="button" key={example} onClick={() => setPrompt(example)}>Try #{index + 1}</button>
            ))}
          </div>
          <button className="generate-button" type="button" disabled={!imageUrl || !prompt.trim()} onClick={generateGame}>
            <span>Generate my game</span><span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="preview-panel">
          <div className="preview-bar">
            <div><i /><i /><i /></div>
            <span>LIVE PREVIEW</span>
            <b>{gameReady ? "PLAYABLE" : "READY"}</b>
          </div>
          {gameReady && imageUrl ? (
            <DodgeGame imageUrl={imageUrl} spec={gameSpec} />
          ) : <div className="game-placeholder">
            <div className="grid-glow" />
            <div className="placeholder-orbit"><span>✦</span></div>
            <h2>Your world becomes<br />the playground.</h2>
            <p>Add a scene and prompt to generate<br />your first playable moment.</p>
            <div className="runtime-badge">9 SEC GAME · ZERO SETUP</div>
          </div>}
        </div>
      </section>

      <footer className="shell">
        <span>BUILT WITH GEMINI + GOOGLE CLOUD</span>
        <span>FROM REALITY TO PLAY</span>
      </footer>
    </main>
  );
}
