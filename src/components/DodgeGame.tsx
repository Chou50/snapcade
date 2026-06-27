"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import type { GameSpec } from "@/lib/game-spec";
import { boxToSourceCrop } from "@/lib/image-crop";

type Phase = "ready" | "running" | "won" | "lost";

type Enemy = {
  x: number;
  y: number;
  size: number;
  speed: number;
  rotation: number;
  spin: number;
};

type GameState = {
  playerX: number;
  hp: number;
  startedAt: number;
  lastFrameAt: number;
  lastSpawnAt: number;
  invincibleUntil: number;
  enemies: Enemy[];
};

const WIDTH = 720;
const HEIGHT = 510;
const PLAYER_SIZE = 58;
const PLAYER_Y = HEIGHT - 82;

interface DodgeGameProps {
  imageUrl: string;
  spec: GameSpec;
  onExit: () => void;
}

export function DodgeGame({ imageUrl, spec, onExit }: DodgeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const keysRef = useRef({ left: false, right: false });
  const phaseRef = useRef<Phase>("ready");
  const gameRef = useRef<GameState | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hp, setHp] = useState(3);
  const [seconds, setSeconds] = useState(spec.durationSeconds);
  const difficulty = {
    1: { spawnInterval: 850, baseSpeed: 0.16 },
    2: { spawnInterval: 620, baseSpeed: 0.2 },
    3: { spawnInterval: 450, baseSpeed: 0.25 },
  }[spec.difficulty];

  useEffect(() => {
    const image = new Image();
    image.src = imageUrl;
    image.onload = () => {
      imageRef.current = image;
      drawReadyScreen();
    };
    return () => {
      imageRef.current = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D"].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = true;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = true;
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = false;
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  function drawScene(context: CanvasRenderingContext2D) {
    const image = imageRef.current;
    if (image) {
      const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
      const sourceWidth = WIDTH / scale;
      const sourceHeight = HEIGHT / scale;
      const sourceX = (image.width - sourceWidth) / 2;
      const sourceY = (image.height - sourceHeight) / 2;
      
      // Save state, draw blurred background and restore to avoid clipping issues
      context.save();
      context.filter = "blur(12px) brightness(0.6)";
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -20, -20, WIDTH + 40, HEIGHT + 40);
      context.restore();
    } else {
      context.fillStyle = "#0c0b11";
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // Subtle neon grid style
    context.strokeStyle = "rgba(255, 255, 255, .04)";
    context.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 48) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, HEIGHT);
      context.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 48) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(WIDTH, y);
      context.stroke();
    }
  }

  function drawReadyScreen() {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawScene(context);
  }

  function drawPlayer(context: CanvasRenderingContext2D, x: number, isInvincible: boolean) {
    if (isInvincible && Math.floor(Date.now() / 80) % 2 === 0) return;
    context.save();
    context.translate(x + PLAYER_SIZE / 2, PLAYER_Y + PLAYER_SIZE / 2);
    context.shadowColor = "#34d399";
    context.shadowBlur = 22;
    context.fillStyle = "#34d399";
    context.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    context.shadowBlur = 0;
    const image = imageRef.current;
    if (image && spec.player.box2d) {
      const crop = boxToSourceCrop(spec.player.box2d, image.width, image.height);
      context.beginPath();
      context.rect(-PLAYER_SIZE / 2 + 4, -PLAYER_SIZE / 2 + 4, PLAYER_SIZE - 8, PLAYER_SIZE - 8);
      context.clip();
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        -PLAYER_SIZE / 2 + 4,
        -PLAYER_SIZE / 2 + 4,
        PLAYER_SIZE - 8,
        PLAYER_SIZE - 8,
      );
    } else {
      context.fillStyle = "#0c0b11";
      context.fillRect(-20, -15, 40, 26);
      context.fillStyle = spec.theme.primaryColor;
      context.fillRect(-16, -11, 32, 18);
      context.fillStyle = "#0c0b11";
      context.fillRect(-26, 15, 52, 7);
    }
    context.restore();
  }

  function drawEnemy(context: CanvasRenderingContext2D, enemy: Enemy) {
    context.save();
    context.translate(enemy.x + enemy.size / 2, enemy.y + enemy.size / 2);
    context.rotate(enemy.rotation);
    context.shadowColor = spec.theme.primaryColor;
    context.shadowBlur = 16;
    context.fillStyle = "#f5f0e5";
    context.fillRect(-enemy.size / 2, -enemy.size / 2, enemy.size, enemy.size);
    context.shadowBlur = 0;
    const image = imageRef.current;
    if (image && spec.enemy.box2d) {
      const crop = boxToSourceCrop(spec.enemy.box2d, image.width, image.height);
      context.beginPath();
      context.rect(-enemy.size / 2 + 3, -enemy.size / 2 + 3, enemy.size - 6, enemy.size - 6);
      context.clip();
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        -enemy.size / 2 + 3,
        -enemy.size / 2 + 3,
        enemy.size - 6,
        enemy.size - 6,
      );
    } else {
      context.fillStyle = spec.theme.primaryColor;
      context.beginPath();
      context.ellipse(0, 4, enemy.size * .23, enemy.size * .29, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = spec.theme.primaryColor;
      context.lineWidth = 5;
      context.beginPath();
      context.arc(enemy.size * .23, 3, enemy.size * .16, -Math.PI / 2, Math.PI / 2);
      context.stroke();
    }
    context.restore();
  }

  function renderGame(game: GameState, now: number) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawScene(context);
    game.enemies.forEach((enemy) => drawEnemy(context, enemy));
    drawPlayer(context, game.playerX, now < game.invincibleUntil);
  }

  function endGame(result: "won" | "lost") {
    phaseRef.current = result;
    setPhase(result);
    gameRef.current = null;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
  }

  function tick(now: number) {
    const game = gameRef.current;
    if (!game || phaseRef.current !== "running") return;

    const delta = Math.min(now - game.lastFrameAt, 34);
    game.lastFrameAt = now;
    const elapsed = now - game.startedAt;
    const remaining = Math.max(0, spec.durationSeconds * 1000 - elapsed);
    setSeconds(Math.ceil(remaining / 1000));

    const direction = Number(keysRef.current.right) - Number(keysRef.current.left);
    game.playerX = Math.max(12, Math.min(WIDTH - PLAYER_SIZE - 12, game.playerX + direction * delta * .42));

    if (now - game.lastSpawnAt >= difficulty.spawnInterval) {
      const size = 46 + Math.random() * 16;
      game.enemies.push({
        x: 14 + Math.random() * (WIDTH - size - 28),
        y: -size,
        size,
        speed: difficulty.baseSpeed + Math.random() * .08,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - .5) * .004,
      });
      game.lastSpawnAt = now;
    }

    for (const enemy of game.enemies) {
      enemy.y += enemy.speed * delta;
      enemy.rotation += enemy.spin * delta;
      const intersects =
        enemy.x < game.playerX + PLAYER_SIZE &&
        enemy.x + enemy.size > game.playerX &&
        enemy.y < PLAYER_Y + PLAYER_SIZE &&
        enemy.y + enemy.size > PLAYER_Y;

      if (intersects && now >= game.invincibleUntil) {
        game.hp -= 1;
        game.invincibleUntil = now + 900;
        enemy.y = HEIGHT + 100;
        setHp(game.hp);
        if (game.hp <= 0) {
          renderGame(game, now);
          endGame("lost");
          return;
        }
      }
    }
    game.enemies = game.enemies.filter((enemy) => enemy.y < HEIGHT + enemy.size);
    renderGame(game, now);

    if (remaining <= 0) {
      endGame("won");
      return;
    }
    animationRef.current = requestAnimationFrame(tick);
  }

  function startGame() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    const now = performance.now();
    gameRef.current = {
      playerX: WIDTH / 2 - PLAYER_SIZE / 2,
      hp: 3,
      startedAt: now,
      lastFrameAt: now,
      lastSpawnAt: now - 300,
      invincibleUntil: 0,
      enemies: [],
    };
    setHp(3);
    setSeconds(spec.durationSeconds);
    setPhase("running");
    phaseRef.current = "running";
    animationRef.current = requestAnimationFrame(tick);
  }

  function moveByPointer(event: PointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current;
    if (!game || phaseRef.current !== "running") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    game.playerX = Math.max(12, Math.min(WIDTH - PLAYER_SIZE - 12, x - PLAYER_SIZE / 2));
  }

  return (
    <div className="dodge-game">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={moveByPointer}
        onPointerMove={(event) => {
          if (event.buttons === 1) moveByPointer(event);
        }}
        aria-label="Dodge game stage"
      />

      {/* Clean Premium HUD Overlay */}
      <div className="custom-game-hud">
        <div className="custom-hud-timer">
          {String(seconds).padStart(2, "0")}
        </div>
        <div className="custom-hud-lives">
          {[...Array(3)].map((_, i) => (
            <span
              key={i}
              className={`custom-heart-icon ${i >= hp ? "empty" : ""}`}
            >
              ♥
            </span>
          ))}
        </div>
      </div>

      {phase !== "running" && (
        <div className={`game-overlay ${phase}`}>
          <div className="game-overlay-card">
            <small className="overlay-eyebrow">
              {phase === "ready"
                ? "SCENE LOCKED"
                : phase === "won"
                ? "CHALLENGE COMPLETE"
                : "SYSTEM CRASHED"}
            </small>
            <h2 className="overlay-title">
              {phase === "ready"
                ? "Ready?"
                : phase === "won"
                ? "Victory!"
                : `${spec.enemy.label} won`}
            </h2>
            <div className="overlay-subtitle">
              {phase === "ready" ? spec.objective : spec.title}
            </div>
            <p className="overlay-description">
              {phase === "ready"
                ? `Move with ← → or drag. Survive for ${spec.durationSeconds} seconds.`
                : phase === "won"
                ? "Your custom dodge game has been successfully generated from the image."
                : `Replay it. This time, protect the ${spec.player.label}.`}
            </p>
            <div className="overlay-buttons-row">
              {phase === "ready" ? (
                <button type="button" className="overlay-btn-blue" style={{ width: "100%" }} onClick={startGame}>
                  Start Game
                </button>
              ) : (
                <>
                  <button type="button" className="overlay-btn-blue" onClick={startGame}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      style={{ width: "16px", height: "16px" }}
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Replay
                  </button>
                  <button type="button" className="overlay-btn-green" onClick={onExit}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ width: "14px", height: "14px" }}
                    >
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                    Generate New Game
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
