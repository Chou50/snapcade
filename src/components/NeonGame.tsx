"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import type { GameSpec, GameTemplate } from "@/lib/game-spec";

type Phase = "ready" | "running" | "ended";
type Keys = { left: boolean; right: boolean; up: boolean; down: boolean };

type GlowFish = { x: number; y: number; r: number; vx: number; vy: number; color: string };
type MatchCell = { icon: string; cleared: boolean };
type Plot = { stage: 0 | 1 | 2 | 3; growth: number };
type RoadThing = { x: number; y: number; kind: "coin" | "drone" };
type Tower = { x: number; y: number; type: "tri" | "square"; cooldown: number };
type Invader = { progress: number; hp: number };
type Bubble = { x: number; y: number; r: number; popped: boolean };

type RuntimeState = {
  phase: Phase;
  template: GameTemplate;
  timeLeft: number;
  score: number;
  coins: number;
  lives: number;
  level: number;
  message: string;
  target: { x: number; y: number };
  player: { x: number; y: number; size: number };
  fishes: GlowFish[];
  cells: MatchCell[];
  selectedCell: number | null;
  pickedCard: number | null;
  plots: Plot[];
  roadThings: RoadThing[];
  carX: number;
  towers: Tower[];
  invaders: Invader[];
  selectedTower: "tri" | "square";
  bubbles: Bubble[];
  outfit: { hair: number; clothes: number; accessory: number };
  spawnAt: number;
};

type Snapshot = {
  phase: Phase;
  score: number;
  coins: number;
  lives: number;
  level: number;
  seconds: number;
  message: string;
};

const WIDTH = 720;
const HEIGHT = 510;
const ICONS = ["{}", "<>", "CPU", "DB", "CLOUD", "WIFI"];
const COLORS = ["#A855F7", "#22D3EE", "#34D399", "#F472B6", "#FACC15", "#FB7185"];

interface NeonGameProps {
  imageUrl: string;
  spec: GameSpec;
  onExit: () => void;
}

function secondsLabel(seconds: number) {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createFishes() {
  return Array.from({ length: 10 }, (_, index) => ({
    x: 80 + (index * 63) % 580,
    y: 110 + (index * 41) % 300,
    r: 10 + (index % 5) * 5,
    vx: index % 2 === 0 ? 24 : -18,
    vy: index % 3 === 0 ? 12 : -10,
    color: COLORS[index % COLORS.length],
  }));
}

function createCells() {
  const deck = [...ICONS, ...ICONS, ...ICONS, ...ICONS];
  return deck.map((icon, index) => ({ icon: deck[(index * 7) % deck.length], cleared: false }));
}

function createBubbles() {
  const bubbles: Bubble[] = [];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 10; col += 1) {
      bubbles.push({
        x: 60 + col * 66 + (row % 2) * 16,
        y: 90 + row * 58,
        r: 23,
        popped: false,
      });
    }
  }
  return bubbles;
}

function initialState(spec: GameSpec): RuntimeState {
  return {
    phase: "ready",
    template: spec.template,
    timeLeft: spec.durationSeconds,
    score: 0,
    coins: spec.template === "tower-defense" ? 80 : 0,
    lives: 3,
    level: 1,
    message: "Press Start",
    target: { x: WIDTH / 2, y: HEIGHT / 2 },
    player: { x: WIDTH / 2, y: HEIGHT / 2, size: 28 },
    fishes: createFishes(),
    cells: createCells(),
    selectedCell: null,
    pickedCard: null,
    plots: Array.from({ length: 9 }, () => ({ stage: 0, growth: 0 })),
    roadThings: [
      { x: 250, y: 90, kind: "coin" },
      { x: 410, y: -40, kind: "drone" },
      { x: 330, y: -170, kind: "coin" },
    ],
    carX: WIDTH / 2,
    towers: [],
    invaders: [{ progress: 0, hp: 3 }],
    selectedTower: "tri",
    bubbles: createBubbles(),
    outfit: { hair: 0, clothes: 0, accessory: 0 },
    spawnAt: 0,
  };
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 18, color = "#FFFFFF", align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Outfit, Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = "rgba(4, 6, 18, 0.84)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, spec: GameSpec) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, spec.theme.backgroundTint);
  gradient.addColorStop(0.5, "#090016");
  gradient.addColorStop(1, "#03141f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.strokeStyle = "rgba(99, 102, 241, 0.16)";
  ctx.lineWidth = 1;
  for (let x = -60; x < WIDTH + 80; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 110, HEIGHT);
    ctx.stroke();
  }
  for (let y = 40; y < HEIGHT; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawText(ctx, secondsLabel(state.timeLeft), 26, 48, 34, "#F8FAFC");
  drawText(ctx, spec.title, WIDTH / 2, 48, 28, "#FFFFFF", "center");
  const right = state.template === "tower-defense" || state.template === "farming"
    ? `Coins ${state.coins}  Lv ${state.level}`
    : `Score ${state.score}`;
  drawText(ctx, right, WIDTH - 26, 43, 18, spec.theme.primaryColor, "right");
  if (state.template !== "bubble-pop") {
    drawText(ctx, `Lives ${"♥".repeat(state.lives)}`, WIDTH - 26, 70, 15, "#FB7185", "right");
  }
}

function drawFish(ctx: CanvasRenderingContext2D, fish: { x: number; y: number; r: number; color: string }, facing = 1) {
  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.scale(facing, 1);
  ctx.shadowColor = fish.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = fish.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, fish.r * 1.4, fish.r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-fish.r * 1.2, 0);
  ctx.lineTo(-fish.r * 2.1, -fish.r * 0.75);
  ctx.lineTo(-fish.r * 2.1, fish.r * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#050816";
  ctx.beginPath();
  ctx.arc(fish.r * 0.65, -fish.r * 0.25, Math.max(2, fish.r * 0.15), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFishEat(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  for (let y = 120; y < 480; y += 80) {
    ctx.strokeStyle = "rgba(34, 211, 238, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= WIDTH; x += 40) ctx.lineTo(x, y + Math.sin((x + y) / 50) * 12);
    ctx.stroke();
  }
  state.fishes.forEach((fish) => drawFish(ctx, fish, fish.vx >= 0 ? 1 : -1));
  drawFish(ctx, { ...state.player, r: state.player.size, color: spec.theme.primaryColor }, 1);
  drawHud(ctx, state, spec);
  drawText(ctx, `Size ${Math.round(state.player.size)}`, 32, HEIGHT - 28, 16, "#BAE6FD");
}

function drawLinkMatch(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  drawPanel(ctx, 74, 84, 572, 352, spec.theme.primaryColor);
  drawHud(ctx, state, spec);
  const size = 64;
  const startX = 144;
  const startY = 130;
  state.cells.forEach((cell, index) => {
    const col = index % 6;
    const row = Math.floor(index / 6);
    const x = startX + col * 76;
    const y = startY + row * 70;
    if (cell.cleared) return;
    ctx.save();
    roundRect(ctx, x, y, size, 52, 8);
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = state.selectedCell === index ? "#FACC15" : spec.theme.primaryColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.stroke();
    drawText(ctx, cell.icon, x + size / 2, y + 34, cell.icon.length > 3 ? 14 : 24, "#E0F2FE", "center");
    ctx.restore();
  });
}

function drawOracle(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  drawHud(ctx, state, spec);
  const cx = WIDTH / 2;
  const cy = 220;
  const orb = ctx.createRadialGradient(cx - 20, cy - 20, 10, cx, cy, 92);
  orb.addColorStop(0, "#FFFFFF");
  orb.addColorStop(0.22, "#C084FC");
  orb.addColorStop(0.6, "#5B21B6");
  orb.addColorStop(1, "rgba(34, 211, 238, 0.45)");
  ctx.save();
  ctx.shadowColor = "#C084FC";
  ctx.shadowBlur = 35;
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(cx, cy, 88, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    drawText(ctx, ["✧", "☾", "◇", "ᚱ"][i % 4], cx + Math.cos(angle) * 135, cy + Math.sin(angle) * 105, 18, COLORS[i % COLORS.length], "center");
  }
  ["THE FOOL", "THE MOON", "THE STAR"].forEach((name, index) => {
    const x = 215 + index * 105;
    const picked = state.pickedCard === index;
    drawPanel(ctx, x, 355, 78, 108, picked ? "#FACC15" : spec.theme.primaryColor);
    drawText(ctx, picked ? "✦" : "◇", x + 39, 410, 34, picked ? "#FACC15" : "#E9D5FF", "center");
    drawText(ctx, name, x + 39, 446, 10, "#FFFFFF", "center");
  });
  if (state.pickedCard !== null) drawText(ctx, state.message, WIDTH / 2, 330, 18, "#FDE68A", "center");
}

function drawFarming(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  drawHud(ctx, state, spec);
  drawText(ctx, "Neon Harvest Grid", WIDTH / 2, 95, 30, "#FFFFFF", "center");
  state.plots.forEach((plot, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 250 + col * 82;
    const y = 135 + row * 78;
    drawPanel(ctx, x, y, 62, 54, plot.stage === 3 ? "#FACC15" : "#34D399");
    const symbols = ["+", "seed", "sprout", "crop"];
    drawText(ctx, symbols[plot.stage], x + 31, y + 34, plot.stage === 0 ? 24 : 13, plot.stage === 3 ? "#FACC15" : "#86EFAC", "center");
  });
  drawPanel(ctx, 250, 404, 220, 58, "#FACC15");
  drawText(ctx, "Click plots: seed > water > harvest", WIDTH / 2, 439, 15, "#FEF3C7", "center");
}

function drawRacing(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  ctx.save();
  ctx.strokeStyle = "#22D3EE";
  ctx.lineWidth = 34;
  ctx.shadowColor = "#22D3EE";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(130, HEIGHT);
  ctx.bezierCurveTo(160, 360, 430, 380, 535, 250);
  ctx.bezierCurveTo(620, 145, 430, 70, 250, 150);
  ctx.stroke();
  ctx.strokeStyle = "#8B5CF6";
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.restore();
  state.roadThings.forEach((thing) => {
    drawText(ctx, thing.kind === "coin" ? "$" : "◆", thing.x, thing.y, thing.kind === "coin" ? 28 : 34, thing.kind === "coin" ? "#FACC15" : "#FB7185", "center");
  });
  ctx.save();
  ctx.translate(state.carX, 395);
  ctx.rotate(-0.18);
  ctx.shadowColor = "#22D3EE";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#22D3EE";
  roundRect(ctx, -26, -44, 52, 88, 14);
  ctx.fill();
  ctx.fillStyle = "#0F172A";
  roundRect(ctx, -16, -24, 32, 30, 8);
  ctx.fill();
  ctx.restore();
  drawHud(ctx, state, spec);
  drawText(ctx, "Arrow keys or drag to steer", WIDTH / 2, HEIGHT - 20, 14, "#BAE6FD", "center");
}

function pathPoint(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.33) return { x: 80 + p / 0.33 * 250, y: 230 };
  if (p < 0.66) return { x: 330, y: 230 + (p - 0.33) / 0.33 * 150 };
  return { x: 330 + (p - 0.66) / 0.34 * 310, y: 380 };
}

function drawTowerDefense(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  drawHud(ctx, state, spec);
  ctx.save();
  ctx.strokeStyle = "#38BDF8";
  ctx.lineWidth = 34;
  ctx.shadowColor = "#38BDF8";
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(80, 230);
  ctx.lineTo(330, 230);
  ctx.lineTo(330, 380);
  ctx.lineTo(640, 380);
  ctx.stroke();
  ctx.restore();
  state.towers.forEach((tower) => {
    drawText(ctx, tower.type === "tri" ? "△" : "□", tower.x, tower.y, 34, tower.type === "tri" ? "#A78BFA" : "#34D399", "center");
  });
  state.invaders.forEach((enemy) => {
    const point = pathPoint(enemy.progress);
    drawText(ctx, "●", point.x, point.y + 8, 38, "#FB7185", "center");
  });
  drawPanel(ctx, 220, 432, 280, 52, "#60A5FA");
  drawText(ctx, `Tower: ${state.selectedTower === "tri" ? "Triangle" : "Square"} | Click path sides to build`, WIDTH / 2, 464, 14, "#DBEAFE", "center");
}

function drawDressUp(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  drawHud(ctx, state, spec);
  drawPanel(ctx, 290, 110, 140, 285, spec.theme.primaryColor);
  drawText(ctx, ["Short", "Halo", "Cyber"][state.outfit.hair], 360, 148, 15, "#FBCFE8", "center");
  drawText(ctx, "◯", 360, 205, 58, "#F9A8D4", "center");
  drawText(ctx, ["Jacket", "Armor", "Kimono"][state.outfit.clothes], 360, 278, 18, "#FFFFFF", "center");
  drawText(ctx, ["Glasses", "Wings", "Necklace"][state.outfit.accessory], 360, 344, 14, "#FDE68A", "center");
  ["Hair", "Clothes", "Accessory"].forEach((label, index) => {
    drawPanel(ctx, 58, 130 + index * 92, 130, 62, "#F472B6");
    drawText(ctx, label, 123, 168 + index * 92, 16, "#FCE7F3", "center");
  });
  ["Next Hair", "Next Fit", "Next Item"].forEach((label, index) => {
    drawPanel(ctx, 532, 130 + index * 92, 130, 62, "#22D3EE");
    drawText(ctx, label, 597, 168 + index * 92, 16, "#E0F2FE", "center");
  });
}

function drawBubblePop(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  drawHud(ctx, state, spec);
  state.bubbles.forEach((bubble) => {
    ctx.save();
    ctx.shadowColor = bubble.popped ? "transparent" : "#7DD3FC";
    ctx.shadowBlur = 13;
    ctx.fillStyle = bubble.popped ? "rgba(148, 163, 184, 0.18)" : "rgba(125, 211, 252, 0.35)";
    ctx.strokeStyle = bubble.popped ? "rgba(255,255,255,0.12)" : "#BAE6FD";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.popped ? bubble.r * 0.62 : bubble.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (!bubble.popped) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(bubble.x - bubble.r * 0.28, bubble.y - bubble.r * 0.34, bubble.r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  drawPanel(ctx, 288, 440, 144, 44, "#7DD3FC");
  drawText(ctx, "Refresh", WIDTH / 2, 468, 16, "#E0F2FE", "center");
}

function drawDodge(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  drawBackground(ctx, spec);
  state.roadThings.forEach((thing) => drawText(ctx, "◆", thing.x, thing.y, 32, "#FB7185", "center"));
  drawText(ctx, "▰", state.player.x, 412, 44, spec.theme.primaryColor, "center");
  drawHud(ctx, state, spec);
}

function render(ctx: CanvasRenderingContext2D, state: RuntimeState, spec: GameSpec) {
  if (state.template === "fish-eat") drawFishEat(ctx, state, spec);
  if (state.template === "link-match") drawLinkMatch(ctx, state, spec);
  if (state.template === "oracle") drawOracle(ctx, state, spec);
  if (state.template === "farming") drawFarming(ctx, state, spec);
  if (state.template === "racing") drawRacing(ctx, state, spec);
  if (state.template === "tower-defense") drawTowerDefense(ctx, state, spec);
  if (state.template === "dress-up") drawDressUp(ctx, state, spec);
  if (state.template === "bubble-pop") drawBubblePop(ctx, state, spec);
  if (state.template === "dodge") drawDodge(ctx, state, spec);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function update(state: RuntimeState, keys: Keys, dt: number, spec: GameSpec) {
  if (state.phase !== "running") return;
  state.timeLeft = Math.max(0, state.timeLeft - dt);
  if (state.timeLeft <= 0) {
    state.phase = "ended";
    state.message = "Time up";
    return;
  }

  if (state.template === "fish-eat") {
    const dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    state.player.x += (dx * 170 + (state.target.x - state.player.x) * 1.4) * dt;
    state.player.y += (dy * 170 + (state.target.y - state.player.y) * 1.4) * dt;
    state.player.x = Math.max(36, Math.min(WIDTH - 36, state.player.x));
    state.player.y = Math.max(88, Math.min(HEIGHT - 46, state.player.y));
    state.fishes.forEach((fish, index) => {
      fish.x += fish.vx * dt;
      fish.y += fish.vy * dt;
      if (fish.x < 35 || fish.x > WIDTH - 35) fish.vx *= -1;
      if (fish.y < 95 || fish.y > HEIGHT - 50) fish.vy *= -1;
      if (distance(state.player, fish) < state.player.size + fish.r) {
        if (fish.r < state.player.size * 0.9) {
          state.score += 25;
          state.player.size = Math.min(54, state.player.size + 1.8);
          state.fishes[index] = { ...fish, x: 60 + Math.random() * 600, y: 110 + Math.random() * 300, r: 10 + Math.random() * 24 };
        } else {
          state.lives -= 1;
          fish.x = 80 + Math.random() * 560;
          if (state.lives <= 0) state.phase = "ended";
        }
      }
    });
  }

  if (state.template === "racing" || state.template === "dodge") {
    state.carX += ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 280 * dt;
    state.carX += (state.target.x - state.carX) * (state.template === "racing" ? 0.8 : 0.4) * dt;
    state.carX = Math.max(125, Math.min(WIDTH - 125, state.carX));
    state.player.x = state.carX;
    state.roadThings.forEach((thing) => {
      thing.y += (state.template === "racing" ? 170 : 210) * dt;
      if (thing.y > HEIGHT + 30) {
        thing.y = -80 - Math.random() * 160;
        thing.x = 170 + Math.random() * 380;
        thing.kind = Math.random() > 0.55 ? "coin" : "drone";
      }
      if (Math.abs(thing.x - state.carX) < 36 && Math.abs(thing.y - 395) < 45) {
        if (thing.kind === "coin") {
          state.score += 50;
          state.coins += 1;
        } else {
          state.lives -= 1;
          if (state.lives <= 0) state.phase = "ended";
        }
        thing.y = -120;
      }
    });
  }

  if (state.template === "farming") {
    state.plots.forEach((plot) => {
      if (plot.stage === 2) {
        plot.growth += dt;
        if (plot.growth > 2.2) plot.stage = 3;
      }
    });
  }

  if (state.template === "tower-defense") {
    state.spawnAt += dt;
    if (state.spawnAt > Math.max(1.2, 2.4 - spec.difficulty * 0.35)) {
      state.spawnAt = 0;
      state.invaders.push({ progress: 0, hp: 2 + spec.difficulty });
    }
    state.invaders.forEach((enemy) => {
      enemy.progress += dt * (0.045 + spec.difficulty * 0.01);
    });
    state.towers.forEach((tower) => {
      tower.cooldown -= dt;
      if (tower.cooldown <= 0) {
        const target = state.invaders.find((enemy) => distance(pathPoint(enemy.progress), tower) < 140);
        if (target) {
          target.hp -= tower.type === "tri" ? 1 : 2;
          tower.cooldown = tower.type === "tri" ? 0.55 : 0.9;
        }
      }
    });
    state.invaders = state.invaders.filter((enemy) => {
      if (enemy.hp <= 0) {
        state.score += 20;
        state.coins += 10;
        return false;
      }
      if (enemy.progress >= 1) {
        state.lives -= 1;
        if (state.lives <= 0) state.phase = "ended";
        return false;
      }
      return true;
    });
  }
}

function snapshot(state: RuntimeState): Snapshot {
  return {
    phase: state.phase,
    score: state.score,
    coins: state.coins,
    lives: state.lives,
    level: state.level,
    seconds: Math.ceil(state.timeLeft),
    message: state.message,
  };
}

function cellIndexFromPoint(x: number, y: number) {
  const size = 64;
  const startX = 144;
  const startY = 130;
  for (let index = 0; index < 24; index += 1) {
    const col = index % 6;
    const row = Math.floor(index / 6);
    const left = startX + col * 76;
    const top = startY + row * 70;
    if (x >= left && x <= left + size && y >= top && y <= top + 52) return index;
  }
  return null;
}

export function NeonGame({ spec, onExit }: NeonGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const stateRef = useRef<RuntimeState>(initialState(spec));
  const keysRef = useRef<Keys>({ left: false, right: false, up: false, down: false });
  const lastFrameRef = useRef<number>(0);
  const [view, setView] = useState<Snapshot>(snapshot(stateRef.current));

  function sync() {
    setView(snapshot(stateRef.current));
  }

  function draw() {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    render(context, stateRef.current, spec);
  }

  function reset(phase: Phase = "ready") {
    stateRef.current = initialState(spec);
    stateRef.current.phase = phase;
    stateRef.current.message = phase === "running" ? spec.objective : "Press Start";
    lastFrameRef.current = performance.now();
    sync();
    draw();
  }

  function frame(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrameRef.current) / 1000));
    lastFrameRef.current = now;
    update(stateRef.current, keysRef.current, dt, spec);
    if (stateRef.current.phase !== "running") {
      sync();
      draw();
      return;
    }
    sync();
    draw();
    animationRef.current = requestAnimationFrame(frame);
  }

  function startGame() {
    reset("running");
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(frame);
  }

  function handlePoint(event: PointerEvent<HTMLCanvasElement>, drag = false) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    const state = stateRef.current;
    state.target = { x, y };
    if (state.phase !== "running") return;

    if (state.template === "link-match" && !drag) {
      const index = cellIndexFromPoint(x, y);
      if (index !== null && !state.cells[index].cleared) {
        if (state.selectedCell === null) {
          state.selectedCell = index;
        } else if (state.selectedCell !== index && state.cells[state.selectedCell].icon === state.cells[index].icon) {
          state.cells[state.selectedCell].cleared = true;
          state.cells[index].cleared = true;
          state.selectedCell = null;
          state.score += 50;
          if (state.cells.every((cell) => cell.cleared)) state.phase = "ended";
        } else {
          state.selectedCell = index;
        }
      }
    }

    if (state.template === "oracle" && !drag) {
      [215, 320, 425].forEach((left, index) => {
        if (x >= left && x <= left + 78 && y >= 355 && y <= 463) {
          state.pickedCard = index;
          state.score = 100;
          state.message = ["Take the risky path", "Trust hidden signals", "Ship the bright idea"][index];
        }
      });
    }

    if (state.template === "farming" && !drag) {
      state.plots.forEach((plot, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const left = 250 + col * 82;
        const top = 135 + row * 78;
        if (x >= left && x <= left + 62 && y >= top && y <= top + 54) {
          if (plot.stage === 0) plot.stage = 1;
          else if (plot.stage === 1) plot.stage = 2;
          else if (plot.stage === 3) {
            plot.stage = 0;
            plot.growth = 0;
            state.coins += 20;
            state.score += 25;
            state.level = 1 + Math.floor(state.coins / 80);
          }
        }
      });
    }

    if (state.template === "tower-defense" && !drag) {
      if (y > 430) {
        state.selectedTower = state.selectedTower === "tri" ? "square" : "tri";
      } else if (state.coins >= 25) {
        state.towers.push({ x, y, type: state.selectedTower, cooldown: 0 });
        state.coins -= 25;
      }
    }

    if (state.template === "dress-up" && !drag) {
      if (x > 520 && x < 675) {
        if (y > 120 && y < 205) state.outfit.hair = (state.outfit.hair + 1) % 3;
        if (y > 212 && y < 300) state.outfit.clothes = (state.outfit.clothes + 1) % 3;
        if (y > 304 && y < 394) state.outfit.accessory = (state.outfit.accessory + 1) % 3;
        state.score = 100 + state.outfit.hair * 30 + state.outfit.clothes * 40 + state.outfit.accessory * 25;
      }
    }

    if (state.template === "bubble-pop" && !drag) {
      if (x >= 288 && x <= 432 && y >= 440 && y <= 484) {
        state.bubbles = createBubbles();
        state.score = 0;
      } else {
        const bubble = state.bubbles.find((item) => !item.popped && distance(item, { x, y }) <= item.r);
        if (bubble) {
          bubble.popped = true;
          state.score += 10;
          state.message = "pop";
          if (state.bubbles.every((item) => item.popped)) state.phase = "ended";
        }
      }
    }

    sync();
    draw();
  }

  useEffect(() => {
    reset("ready");
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    function setKey(event: KeyboardEvent, value: boolean) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "A", "d", "D", "w", "W", "s", "S", "f", "F"].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keysRef.current.left = value;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keysRef.current.right = value;
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") keysRef.current.up = value;
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") keysRef.current.down = value;
      if (event.key.toLowerCase() === "f" && value) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void canvasRef.current?.parentElement?.requestFullscreen();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      setKey(event, true);
    }

    function handleKeyUp(event: KeyboardEvent) {
      setKey(event, false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const hooks = window as typeof window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };
    hooks.render_game_to_text = () => JSON.stringify({
      coordinateSystem: "canvas origin top-left, x right, y down",
      template: stateRef.current.template,
      ...snapshot(stateRef.current),
      player: stateRef.current.player,
      visibleFishes: stateRef.current.fishes.slice(0, 5),
      unclearedCells: stateRef.current.cells.filter((cell) => !cell.cleared).length,
      towers: stateRef.current.towers.length,
      invaders: stateRef.current.invaders.length,
      poppedBubbles: stateRef.current.bubbles.filter((bubble) => bubble.popped).length,
    });
    hooks.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < steps; i += 1) update(stateRef.current, keysRef.current, 1 / 60, spec);
      sync();
      draw();
    };
    return () => {
      delete hooks.render_game_to_text;
      delete hooks.advanceTime;
    };
  }, [spec]);

  const endedTitle = view.lives <= 0 ? "System Down" : view.score > 0 || view.coins > 0 ? "Run Complete" : "Time Up";

  return (
    <div className="dodge-game neon-game">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={(event) => handlePoint(event)}
        onPointerMove={(event) => {
          if (event.buttons === 1) handlePoint(event, true);
        }}
        aria-label={`${spec.template} game stage`}
      />

      {view.phase !== "running" && (
        <div className={`game-overlay ${view.phase === "ready" ? "ready" : "won"}`}>
          <div className="game-overlay-card">
            <small className="overlay-eyebrow">{spec.template.toUpperCase()}</small>
            <h2 className="overlay-title">{view.phase === "ready" ? spec.title : endedTitle}</h2>
            <div className="overlay-subtitle">{spec.objective}</div>
            <p className="overlay-description">
              {view.phase === "ready"
                ? "Use arrow keys, drag, or click the neon controls. Press F for fullscreen."
                : `Score ${view.score}. Coins ${view.coins}.`}
            </p>
            <div className="overlay-buttons-row">
              <button type="button" className="overlay-btn-blue" onClick={startGame}>
                {view.phase === "ready" ? "Start Game" : "Replay"}
              </button>
              {view.phase !== "ready" && (
                <button type="button" className="overlay-btn-green" onClick={onExit}>
                  Generate New Game
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
