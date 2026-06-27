"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { DodgeGame } from "@/components/DodgeGame";
import { SceneObjectPicker } from "@/components/SceneObjectPicker";
import { BoundingBox, DEFAULT_GAME_SPEC, GameSpec, sanitizeGameSpec } from "@/lib/game-spec";

const EXAMPLE_PROMPTS = [
  "I control the laptop. Make the coffee cup the enemy.",
  "Turn this desk into a 10-second survival game.",
  "Let me dodge everything except the blue object.",
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPTS[0]);
  const [dragging, setDragging] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [gameSpec, setGameSpec] = useState<GameSpec>(DEFAULT_GAME_SPEC);
  const [selectionTarget, setSelectionTarget] = useState<"player" | "enemy" | null>(null);
  const [selectedPlayerBox, setSelectedPlayerBox] = useState<BoundingBox | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSource, setGenerationSource] = useState<"gemini" | "fallback" | "demo" | null>(null);
  const [generationNotice, setGenerationNotice] = useState("");

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  async function loadFile(file?: File) {
    if (!file) return;

    // iPhone photos are HEIC. Chrome can't render HEIC in <img>/canvas and often
    // reports an empty MIME type, so detect by type OR extension and convert to JPEG.
    const lowerName = file.name.toLowerCase();
    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      lowerName.endsWith(".heic") ||
      lowerName.endsWith(".heif");

    let workingFile = file;
    if (isHeic) {
      setGenerationNotice("Converting HEIC photo…");
      try {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        workingFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
          type: "image/jpeg",
        });
      } catch {
        setGenerationNotice("Could not read this HEIC photo. Try a JPEG or PNG.");
        return;
      }
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(workingFile.type) ||
      workingFile.size > 10 * 1024 * 1024
    ) {
      setGenerationNotice("Choose a JPEG, PNG, or WebP image up to 10 MB.");
      return;
    }
    setImageUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(workingFile);
    });
    setFileName(file.name);
    setImageFile(workingFile);
    setGameReady(false);
    setSelectionTarget(null);
    setSelectedPlayerBox(null);
    setGenerationSource(null);
    setGenerationNotice("");
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
    setImageFile(null);
    setGameReady(false);
    setSelectionTarget(null);
    setSelectedPlayerBox(null);
    setGenerationSource("demo");
    setGenerationNotice("");
  }

  function createBaseSpec(includeDemoBoxes: boolean) {
    const { gameSpec: safeSpec } = sanitizeGameSpec({
      ...DEFAULT_GAME_SPEC,
      objective: prompt,
      player: {
        ...DEFAULT_GAME_SPEC.player,
        box2d: includeDemoBoxes ? [356, 296, 731, 713] : null,
      },
      enemy: {
        ...DEFAULT_GAME_SPEC.enemy,
        box2d: includeDemoBoxes ? [336, 142, 688, 321] : null,
      },
    });
    return safeSpec;
  }

  function startManualSelection() {
    if (!imageUrl) return;
    setGameSpec(createBaseSpec(false));
    setGameReady(false);
    setSelectedPlayerBox(null);
    setSelectionTarget("player");
  }

  function applyGeneratedSpec(safeSpec: GameSpec) {
    setGameSpec(safeSpec);
    if (safeSpec.player.box2d && safeSpec.enemy.box2d) {
      setSelectionTarget(null);
      setGameReady(true);
      return;
    }
    setSelectedPlayerBox(null);
    setSelectionTarget("player");
    setGameReady(false);
  }

  async function generateGame() {
    if (!imageUrl) return;
    if (imageUrl === "/demo-scene.svg") {
      setGenerationSource("demo");
      applyGeneratedSpec(createBaseSpec(true));
      return;
    }
    if (!imageFile) {
      startManualSelection();
      return;
    }

    setIsGenerating(true);
    setGameReady(false);
    setSelectionTarget(null);
    setGenerationNotice("");

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("prompt", prompt.trim());
      const response = await fetch("/api/generate", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Generation request failed");
      const result = await response.json() as {
        source?: "gemini" | "fallback";
        gameSpec?: unknown;
        warnings?: string[];
      };
      const { gameSpec: safeSpec, warnings } = sanitizeGameSpec(result.gameSpec);
      const combinedWarnings = [...(result.warnings ?? []), ...warnings];
      setGenerationSource(result.source ?? "fallback");
      setGenerationNotice(combinedWarnings[0] ?? "");
      applyGeneratedSpec(safeSpec);
    } catch {
      setGenerationSource("fallback");
      setGenerationNotice("Generation was unavailable; safe selection mode enabled.");
      setGameSpec(createBaseSpec(false));
      setSelectedPlayerBox(null);
      setSelectionTarget("player");
    } finally {
      setIsGenerating(false);
    }
  }

  function selectObject(box: BoundingBox) {
    if (selectionTarget === "player") {
      setSelectedPlayerBox(box);
      setSelectionTarget("enemy");
      return;
    }
    if (selectionTarget === "enemy") {
      const { gameSpec: safeSpec } = sanitizeGameSpec({
        ...gameSpec,
        player: { ...gameSpec.player, box2d: selectedPlayerBox },
        enemy: { ...gameSpec.enemy, box2d: box },
      });
      setGameSpec(safeSpec);
      setSelectionTarget(null);
      setGameReady(true);
    }
  }

  function useDefaultAssets() {
    setGameSpec(createBaseSpec(false));
    setSelectionTarget(null);
    setGameReady(true);
  }

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="Snapcade home">
          <span className="brand-mark" aria-hidden="true">SC</span>
          <span>Snapcade</span>
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
          <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" onChange={handleFileChange} />
          <div className="upload-meta">
            <span>{fileName ? `Selected: ${fileName}` : "No scene selected"}</span>
            <div>
              {imageUrl && <button type="button" onClick={startManualSelection}>Pick objects</button>}
              <button type="button" onClick={loadDemoScene}>Use demo scene</button>
            </div>
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
          <button className="generate-button" type="button" disabled={!imageUrl || !prompt.trim() || isGenerating} onClick={generateGame}>
            <span>{isGenerating ? "Analyzing your scene…" : "Generate my game"}</span><span aria-hidden="true">→</span>
          </button>
          {generationNotice && <p className="generation-notice">{generationNotice}</p>}
        </div>

        <div className="preview-panel">
          <div className="preview-bar">
            <div><i /><i /><i /></div>
            <span>LIVE PREVIEW</span>
            <b>{isGenerating ? "ANALYZING" : selectionTarget ? "SELECTING" : gameReady ? generationSource === "gemini" ? "AI PLAYABLE" : "PLAYABLE" : "READY"}</b>
          </div>
          {isGenerating ? (
            <div className="generation-progress">
              <div className="scan-line" />
              <span className="analysis-symbol">✦</span>
              <small>GEMINI VISION</small>
              <h2>Reading your reality…</h2>
              <div className="analysis-steps">
                <span className="active">Analyzing scene</span>
                <span>Locating objects</span>
                <span>Validating game</span>
              </div>
            </div>
          ) : selectionTarget && imageUrl ? (
            <SceneObjectPicker
              imageUrl={imageUrl}
              target={selectionTarget}
              playerBox={selectedPlayerBox}
              onSelect={selectObject}
              onUseDefaults={useDefaultAssets}
            />
          ) : gameReady && imageUrl ? (
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
