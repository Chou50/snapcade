"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { NeonGame } from "@/components/NeonGame";
import { SceneObjectPicker } from "@/components/SceneObjectPicker";
import { BoundingBox, createGameSpecFromPrompt, DEFAULT_GAME_SPEC, GameSpec, sanitizeGameSpec } from "@/lib/game-spec";

const EXAMPLE_PROMPTS = [
  "做一个赛博朋克霓虹风的大鱼吃小鱼游戏，玩家控制一条发光几何鱼，通过吞噬更小的彩色发光鱼进化变大，带倒计时和分数显示。",
  "做一个赛博朋克霓虹风的连连看游戏，网格里满是发光的IT图标，玩家连接两个相同图标即可消除，带倒计时和分数显示。",
  "做一个满屏塑料泡泡的解压小游戏，手指点哪哪里就会啪的一声破掉，捏完可以一键刷新。",
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"setup" | "play">("setup");
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

  // Stepper Loading State (0: idle/none, 1: analyzing, 2: detecting, 3: building, 4: ready)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const stepTimer1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimer2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const template = params.get("template");
    if (!template) return;

    const { gameSpec: safeSpec } = sanitizeGameSpec({
      template,
      objective: params.get("prompt") ?? template,
    });
    setImageUrl("/demo-scene.svg");
    setFileName("Template preview · demo scene");
    setImageFile(null);
    setGameSpec(safeSpec);
    setSelectionTarget(null);
    setSelectedPlayerBox(null);
    setGenerationSource("demo");
    setGenerationNotice("");
    setCurrentStep(4);
    setGameReady(true);
    setViewMode("play");
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (stepTimer1.current) clearTimeout(stepTimer1.current);
      if (stepTimer2.current) clearTimeout(stepTimer2.current);
    };
  }, [imageUrl]);

  async function loadFile(file?: File) {
    if (!file) return;

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
    setCurrentStep(0);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    loadFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
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
    setCurrentStep(0);
  }

  function createBaseSpec(includeDemoBoxes: boolean, forceDodge = false) {
    const baseSpec = forceDodge
      ? sanitizeGameSpec({ template: "dodge", objective: prompt }).gameSpec
      : createGameSpecFromPrompt(prompt);
    const { gameSpec: safeSpec } = sanitizeGameSpec({
      ...baseSpec,
      objective: prompt,
      player: {
        ...baseSpec.player,
        box2d: includeDemoBoxes ? [356, 296, 731, 713] : null,
      },
      enemy: {
        ...baseSpec.enemy,
        box2d: includeDemoBoxes ? [336, 142, 688, 321] : null,
      },
    });
    return safeSpec;
  }

  function startManualSelection() {
    if (!imageUrl) return;
    setGameSpec(createBaseSpec(false, true));
    setGameReady(false);
    setSelectedPlayerBox(null);
    setSelectionTarget("player");
  }

  function applyGeneratedSpec(safeSpec: GameSpec) {
    setGameSpec(safeSpec);
    if (safeSpec.template !== "dodge" || (safeSpec.player.box2d && safeSpec.enemy.box2d)) {
      setSelectionTarget(null);
      setGameReady(true);
      setCurrentStep(4);
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
    setCurrentStep(1);

    // Simulate stepping progression
    if (stepTimer1.current) clearTimeout(stepTimer1.current);
    if (stepTimer2.current) clearTimeout(stepTimer2.current);

    stepTimer1.current = setTimeout(() => {
      setCurrentStep(2);
    }, 1200);

    stepTimer2.current = setTimeout(() => {
      setCurrentStep(3);
    }, 2800);

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
      setGenerationNotice("Generation was unavailable; local prompt template selected.");
      setGameSpec(createBaseSpec(false));
      setSelectedPlayerBox(null);
      setSelectionTarget(null);
      setGameReady(true);
      setCurrentStep(4);
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
      setCurrentStep(4);
    }
  }

  function useDefaultAssets() {
    setGameSpec(createBaseSpec(false, true));
    setSelectionTarget(null);
    setGameReady(true);
    setCurrentStep(4);
  }

  // Returns progress height of the stepper bar
  const getProgressHeight = () => {
    if (currentStep <= 1) return "0%";
    if (currentStep === 2) return "33%";
    if (currentStep === 3) return "66%";
    return "100%";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Navigation Header */}
      <nav className="nav-header">
        <div className="shell" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a className="brand-container" href="#top" onClick={() => setViewMode("setup")}>
            {viewMode === "setup" ? (
              <span className="brand-text">Scene2Game</span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className="brand-text" style={{ fontSize: "24px" }}>S2G</span>
                <span className="logo-icon-container" style={{ transform: "translateY(2px)" }}>
                  <svg
                    className="logo-gear"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
                  </svg>
                </span>
              </div>
            )}
          </a>
          <div className="nav-actions">
            {viewMode === "setup" ? (
              <>
                <span className="nav-link-text">Google Hackathon Showcase</span>
                <button type="button" className="collection-btn">Collection</button>
                <button
                  type="button"
                  className="play-game-btn"
                  disabled={!gameReady}
                  onClick={() => setViewMode("play")}
                >
                  Play Game
                </button>
              </>
            ) : (
              <span className="nav-link-text">Google Hackathon Showcase</span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="avatar-img" src="/avatar.jpg" alt="User avatar" />
          </div>
        </div>
      </nav>

      {/* Main Area based on viewMode */}
      {viewMode === "setup" ? (
        <main className="shell" style={{ flex: 1, padding: "20px 0" }}>
          <div className="dashboard-grid">
            {/* Left Column: Image Upload & Editor */}
            <div className={`neon-card ${imageUrl ? "active-glow" : ""}`}>
              <div
                className={`upload-inner-border ${dragging ? "is-dragging" : ""}`}
                onDragEnter={() => setDragging(true)}
                onDragLeave={() => setDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
              >
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imageUrl} alt="Uploaded scene preview" />
                ) : (
                  <div className="upload-placeholder-content">
                    <span className="upload-icon-neon">↗</span>
                    <strong className="upload-title">Drop your scene photo here</strong>
                    <span className="upload-desc">or click to browse local files</span>
                  </div>
                )}
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                  onChange={handleFileChange}
                />
              </div>

              {fileName && <div className="upload-filename">Uploaded Photo: {fileName}</div>}

              {/* Prompt Textarea */}
              <div className="prompt-textarea-container">
                <span className="prompt-label">Your Game Prompt</span>
                <textarea
                  className="prompt-textarea"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={300}
                />
                <span className="prompt-char-count">{prompt.length}/300</span>
              </div>

              <div className="prompt-examples-row">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    type="button"
                    key={example}
                    className="prompt-example-pill"
                    onClick={() => setPrompt(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="action-buttons-group">
                <button
                  type="button"
                  className="primary-neon-btn"
                  disabled={!imageUrl || !prompt.trim() || isGenerating}
                  onClick={generateGame}
                >
                  <span>{isGenerating ? "Analyzing scene…" : "Generate Game"}</span>
                </button>
                {imageUrl && (
                  <button type="button" className="secondary-neon-btn" onClick={startManualSelection}>
                    Pick Objects
                  </button>
                )}
                <button type="button" className="secondary-neon-btn" onClick={loadDemoScene}>
                  Use Demo
                </button>
              </div>

              {generationNotice && (
                <p className="generation-notice" style={{ marginTop: "14px", color: "var(--gold-color)" }}>
                  {generationNotice}
                </p>
              )}
            </div>

            {/* Right Column: AI Stepper / Preview & Manual Selector */}
            <div className="neon-card preview-neon-card">
              {selectionTarget && imageUrl ? (
                <div className="preview-content">
                  <SceneObjectPicker
                    imageUrl={imageUrl}
                    target={selectionTarget}
                    playerBox={selectedPlayerBox}
                    onSelect={selectObject}
                    onUseDefaults={useDefaultAssets}
                  />
                </div>
              ) : (
                <div className="stepper-content">
                  <h3 className="stepper-card-title">AI Game Generation Status</h3>
                  <div className="stepper-container">
                    <div className="stepper-line-connector" />
                    <div
                      className="stepper-line-connector-progress"
                      style={{ height: getProgressHeight() }}
                    />

                    {/* Step 1: Analyzing Scene */}
                    <div
                      className={`stepper-step ${
                        currentStep > 1
                          ? "completed"
                          : currentStep === 1
                          ? "active"
                          : "pending"
                      }`}
                    >
                      <div className="stepper-icon-circle">
                        {currentStep > 1 ? "✓" : "1"}
                      </div>
                      <div className="stepper-text-content">
                        <span className="stepper-label">Analyzing Scene</span>
                      </div>
                    </div>

                    {/* Step 2: Detecting Objects */}
                    <div
                      className={`stepper-step ${
                        currentStep > 2
                          ? "completed"
                          : currentStep === 2
                          ? "active"
                          : "pending"
                      }`}
                    >
                      <div className="stepper-icon-circle">
                        {currentStep > 2 ? "✓" : "2"}
                      </div>
                      <div className="stepper-text-content">
                        <span className="stepper-label">Detecting Objects</span>
                      </div>
                    </div>

                    {/* Step 3: Building Game */}
                    <div
                      className={`stepper-step ${
                        currentStep > 3
                          ? "completed"
                          : currentStep === 3
                          ? "active"
                          : "pending"
                      }`}
                    >
                      <div className="stepper-icon-circle">
                        {currentStep > 3 ? "✓" : "3"}
                      </div>
                      <div className="stepper-text-content">
                        <span className="stepper-label">Building Game</span>
                      </div>
                    </div>

                    {/* Step 4: Ready */}
                    <div
                      className={`stepper-step ${
                        currentStep === 4 ? "active completed" : "pending"
                      }`}
                    >
                      <div className="stepper-icon-circle">
                        {currentStep === 4 ? "✓" : "4"}
                      </div>
                      <div className="stepper-text-content">
                        <span className="stepper-label">Ready</span>
                        {currentStep === 4 && (
                          <span className="stepper-desc">
                            Your custom {gameSpec.template} game has been generated from the prompt.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      ) : (
        /* Play View Mode */
        <div className="play-workspace">
          <div className="game-arena-wrapper">
            <div className="game-top-meta">
              <div className="game-meta-left">
                <span className="game-meta-title">Mini-Game: {gameSpec.title}</span>
                <span className="game-meta-stats">
                  Type: {gameSpec.template} | Difficulty: {gameSpec.difficulty} | Goal: {gameSpec.objective}
                </span>
              </div>
              <button
                type="button"
                className="escape-btn"
                onClick={() => setViewMode("setup")}
              >
                Escape to Main
              </button>
            </div>
            {imageUrl && <NeonGame imageUrl={imageUrl} spec={gameSpec} onExit={() => setViewMode("setup")} />}
          </div>
        </div>
      )}
    </div>
  );
}
