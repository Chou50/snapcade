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
export function DodgeGame({ imageUrl, spec }: { imageUrl: string; spec: GameSpec }) {
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
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, WIDTH, HEIGHT);
    } else {
      context.fillStyle = "#26231f";
      context.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, "rgba(12, 11, 10, .42)");
    gradient.addColorStop(1, "rgba(12, 11, 10, .78)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);

    context.strokeStyle = "rgba(255,255,255,.08)";
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
    context.shadowColor = "#d9ff43";
    context.shadowBlur = 22;
    context.fillStyle = "#d9ff43";
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
      context.fillStyle = "#11100f";
      context.fillRect(-20, -15, 40, 26);
      context.fillStyle = spec.theme.primaryColor;
      context.fillRect(-16, -11, 32, 18);
      context.fillStyle = "#11100f";
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

      <div className="game-hud">
        <span>HP {"●".repeat(hp)}{"○".repeat(3 - hp)}</span>
        <strong>{seconds}s</strong>
        <span>DODGE: {spec.enemy.label.toUpperCase()}</span>
      </div>

      {phase !== "running" && (
        <div className={`game-overlay ${phase}`}>
          <small>{phase === "ready" ? "SCENE LOCKED" : phase === "won" ? "CHALLENGE COMPLETE" : "SYSTEM CRASHED"}</small>
          <h2>{phase === "ready" ? spec.title : phase === "won" ? "You survived reality." : `${spec.enemy.label} won.`}</h2>
          <p>{phase === "ready" ? `Move with ← → or drag. Survive for ${spec.durationSeconds} seconds.` : phase === "won" ? "Your scene is officially playable." : `Replay it. This time, protect the ${spec.player.label}.`}</p>
          <button type="button" onClick={startGame}>{phase === "ready" ? "Start game" : "Play again"}<span>→</span></button>
        </div>
      )}
    </div>
  );
}
