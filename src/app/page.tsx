"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { NeonGame } from "@/components/NeonGame";
import { SceneObjectPicker } from "@/components/SceneObjectPicker";
import { BoundingBox, createGameSpecFromPrompt, DEFAULT_GAME_SPEC, GameSpec, sanitizeGameSpec } from "@/lib/game-spec";

type AgentTraceStep = {
  title: string;
  detail: string;
  status: "pending" | "active" | "complete" | "error";
};

const EXAMPLE_PROMPTS = [
  "Create a neon link-match game from the objects in this room.",
  "Turn this scene into a cyberpunk tower-defense game.",
  "Make a relaxing bubble-pop game based on the photographed objects.",
];

const IDLE_AGENT_TRACE: AgentTraceStep[] = [
  {
    title: "Waiting for photo",
    detail: "Upload a scene. The managed agent will infer the game prompt from the image.",
    status: "pending",
  },
  {
    title: "Scene understanding",
    detail: "The agent will identify visible objects, setting, and usable game tokens.",
    status: "pending",
  },
  {
    title: "Prompt generation",
    detail: "The English game prompt will be generated automatically from the photo.",
    status: "pending",
  },
  {
    title: "Game grounding",
    detail: "The selected template will reuse photo-derived objects inside the playable runtime.",
    status: "pending",
  },
  {
    title: "GameSpec validation",
    detail: "The final JSON is sanitized before the game is enabled.",
    status: "pending",
  },
];

const RUNNING_AGENT_TRACE: AgentTraceStep[] = [
  {
    title: "Photo submitted",
    detail: "Uploading the scene and optional prompt to the managed agent.",
    status: "complete",
  },
  {
    title: "Scene understanding",
    detail: "Extracting setting, visible objects, and visual mood from the image.",
    status: "active",
  },
  {
    title: "Prompt generation",
    detail: "Creating an English game prompt from the photo.",
    status: "pending",
  },
  {
    title: "Game grounding",
    detail: "Mapping photo objects into the selected game template.",
    status: "pending",
  },
  {
    title: "GameSpec validation",
    detail: "Waiting for structured JSON from the managed agent.",
    status: "pending",
  },
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"setup" | "play">("setup");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dragging, setDragging] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [gameSpec, setGameSpec] = useState<GameSpec>(DEFAULT_GAME_SPEC);
  const [selectionTarget, setSelectionTarget] = useState<"player" | "enemy" | null>(null);
  const [selectedPlayerBox, setSelectedPlayerBox] = useState<BoundingBox | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSource, setGenerationSource] = useState<"managed-agent" | "gemini" | "fallback" | "demo" | null>(null);
  const [generationNotice, setGenerationNotice] = useState("");
  const [agentTrace, setAgentTrace] = useState<AgentTraceStep[]>(IDLE_AGENT_TRACE);

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
    setAgentTrace([
      { title: "Demo scene loaded", detail: "Using the bundled demo image.", status: "complete" },
      { title: "Prompt generated", detail: safeSpec.scene.prompt, status: "complete" },
      { title: "Game grounded", detail: `Runtime tokens: ${safeSpec.scene.objects.join(", ")}`, status: "complete" },
      { title: "GameSpec validation", detail: `${safeSpec.template} game is ready.`, status: "complete" },
    ]);
    setGameReady(true);
    setViewMode("play");
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
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
    setAgentTrace(IDLE_AGENT_TRACE);
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
    setAgentTrace(IDLE_AGENT_TRACE);
  }

  function createBaseSpec(includeDemoBoxes: boolean, forceDodge = false) {
    const baseSpec = forceDodge
      ? sanitizeGameSpec({ template: "dodge", objective: prompt }).gameSpec
      : createGameSpecFromPrompt(prompt);
    const { gameSpec: safeSpec } = sanitizeGameSpec({
      ...baseSpec,
      objective: prompt,
      scene: {
        ...baseSpec.scene,
        prompt: prompt || baseSpec.scene.prompt,
      },
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
      const demoSpec = createBaseSpec(true);
      setPrompt(demoSpec.scene.prompt);
      setAgentTrace([
        { title: "Demo scene loaded", detail: "Using the bundled demo image.", status: "complete" },
        { title: "Prompt generated", detail: demoSpec.scene.prompt, status: "complete" },
        { title: "Game grounded", detail: `Runtime tokens: ${demoSpec.scene.objects.join(", ")}`, status: "complete" },
        { title: "GameSpec validation", detail: `${demoSpec.template} game is ready.`, status: "complete" },
      ]);
      applyGeneratedSpec(demoSpec);
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
    setAgentTrace(RUNNING_AGENT_TRACE);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("prompt", prompt.trim());
      const response = await fetch("/api/generate", { method: "POST", body: formData });
      if (!response.ok) throw new Error("Generation request failed");
      const result = await response.json() as {
        source?: "managed-agent" | "gemini" | "fallback";
        gameSpec?: unknown;
        warnings?: string[];
        suggestedPrompt?: string;
        agentTrace?: AgentTraceStep[];
      };
      const { gameSpec: safeSpec, warnings } = sanitizeGameSpec(result.gameSpec);
      const combinedWarnings = [...(result.warnings ?? []), ...warnings];
      setGenerationSource(result.source ?? "fallback");
      setGenerationNotice(combinedWarnings[0] ?? "");
      setPrompt(result.suggestedPrompt ?? safeSpec.scene.prompt);
      setAgentTrace(result.agentTrace?.length ? result.agentTrace : [
        { title: "Scene understood", detail: safeSpec.scene.summary, status: "complete" },
        { title: "Prompt generated", detail: safeSpec.scene.prompt, status: "complete" },
        { title: "Game grounded", detail: `Runtime tokens: ${safeSpec.scene.objects.join(", ")}`, status: "complete" },
        { title: "GameSpec validation", detail: `${safeSpec.template} game is ready.`, status: "complete" },
      ]);
      applyGeneratedSpec(safeSpec);
    } catch {
      const fallbackSpec = createBaseSpec(false);
      setGenerationSource("fallback");
      setGenerationNotice("Generation was unavailable; local prompt template selected.");
      setGameSpec(fallbackSpec);
      setPrompt(fallbackSpec.scene.prompt);
      setAgentTrace([
        { title: "Managed agent unavailable", detail: "The request failed before a structured response was received.", status: "error" },
        { title: "Local fallback selected", detail: fallbackSpec.scene.prompt, status: "complete" },
        { title: "GameSpec validation", detail: `${fallbackSpec.template} game is ready.`, status: "complete" },
      ]);
      setSelectedPlayerBox(null);
      setSelectionTarget(null);
      setGameReady(true);
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
    const safeSpec = createBaseSpec(false, true);
    setGameSpec(safeSpec);
    setPrompt(safeSpec.scene.prompt);
    setAgentTrace([
      { title: "Manual fallback selected", detail: "Using built-in game assets for the current photo.", status: "complete" },
      { title: "GameSpec validation", detail: `${safeSpec.template} game is ready.`, status: "complete" },
    ]);
    setSelectionTarget(null);
    setGameReady(true);
  }

  // Returns progress height of the stepper bar
  const getProgressHeight = () => {
    if (agentTrace.length <= 1) return "0%";
    const completedIndex = agentTrace.findLastIndex((step) => step.status === "complete" || step.status === "error");
    if (completedIndex <= 0) return "0%";
    return `${Math.round((completedIndex / (agentTrace.length - 1)) * 100)}%`;
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
                <span className="prompt-label">Agent Game Prompt</span>
                <textarea
                  className="prompt-textarea"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Leave this blank. The managed agent will generate an English game prompt from the photo."
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
                  disabled={!imageUrl || isGenerating}
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
                  <div className="stepper-header-row">
                    <h3 className="stepper-card-title">Agent Calculation Flow</h3>
                    {generationSource && (
                      <span className="agent-source-badge">{generationSource}</span>
                    )}
                  </div>
                  <div className="stepper-container">
                    <div className="stepper-line-connector" />
                    <div
                      className="stepper-line-connector-progress"
                      style={{ height: getProgressHeight() }}
                    />

                    {agentTrace.map((step, index) => (
                      <div
                        className={`stepper-step ${
                          step.status === "complete"
                            ? "completed"
                            : step.status === "active"
                            ? "active"
                            : step.status === "error"
                            ? "completed error"
                            : "pending"
                        }`}
                        key={`${step.title}-${index}`}
                      >
                        <div className="stepper-icon-circle">
                          {step.status === "complete" ? "✓" : step.status === "error" ? "!" : index + 1}
                        </div>
                        <div className="stepper-text-content">
                          <span className="stepper-label">{step.title}</span>
                          <span className="stepper-desc">{step.detail}</span>
                        </div>
                      </div>
                    ))}
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
                  Type: {gameSpec.template} | Difficulty: {gameSpec.difficulty} | Scene: {gameSpec.scene.summary}
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
