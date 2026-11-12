"use client";

import { useEffect, useRef, useState } from "react";

// ---------- Einstellungen ----------
const W = 960; // Bildschirm-Breite
const H = 540; // Bildschirm-Höhe
const GRAVITY = 0.5;
const JUMP = -10;
const SUPER_JUMP = -16;
const SPEED = 3.2;
const PW = 26; // Breite einer Figur
const PH = 34; // Höhe einer Figur
const ITEM_EVERY = 300; // alle 5 Sekunden (60 Bilder pro Sekunde)
const LAVA_START = 60 * 40; // nach 40 Sekunden steigt die Lava
const BRIDGE_LEN = 200;
const BRIDGE_LIFE = 600; // 10 Sekunden
const PILLAR_GAP = 230; // Abstand zwischen den Säulen
const PILLAR_W = 70;
const PILLAR_TOPS = [310, 270, 290, 255, 300, 265, 285, 250];

type ItemKind = "bridge" | "push" | "jump" | "shield" | "bomb";

const ITEMS: Record<ItemKind, { emoji: string; name: string }> = {
  bridge: { emoji: "🌉", name: "Brücke" },
  push: { emoji: "🥊", name: "Schubs-Handschuh" },
  jump: { emoji: "🍄", name: "Sprung-Pilz" },
  shield: { emoji: "🛡️", name: "Schild" },
  bomb: { emoji: "💣", name: "Bombe" },
};
const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

type Hat = "cap" | "horns" | "antenna" | "crown" | "bow" | "headband" | "headphones" | "beanie";

const PLAYERS: { name: string; color: string; hat: Hat }[] = [
  { name: "Du", color: "#3b82f6", hat: "cap" },
  { name: "Blitz", color: "#ef4444", hat: "horns" },
  { name: "Kiwi", color: "#22c55e", hat: "antenna" },
  { name: "Sunny", color: "#facc15", hat: "crown" },
  { name: "Luna", color: "#a855f7", hat: "bow" },
  { name: "Turbo", color: "#14b8a6", hat: "headband" },
  { name: "Pixel", color: "#ec4899", hat: "headphones" },
  { name: "Frost", color: "#e2e8f0", hat: "beanie" },
];

type Plat = { x: number; y: number; w: number; h: number; kind: "pillar" | "bridge"; life: number; idx: number };

type Fighter = {
  id: number;
  name: string;
  color: string;
  hat: Hat;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  alive: boolean;
  item: ItemKind | null;
  shield: number;
  stun: number;
  punch: number;
  bot: boolean;
  place: number;
  walk: number;
  squash: number;
  ai: { cd: number; move: number };
};

type Bomb = { x: number; y: number; vx: number; vy: number; owner: number; t: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; glow?: boolean };
type FloatText = { text: string; x: number; y: number; life: number };
type Ring = { x: number; y: number; r: number; life: number };
type Bubble = { x: number; life: number; size: number };

type Ranking = { name: string; color: string; place: number; you: boolean }[];
type Result = { won: boolean; place: number; ranking: Ranking };

type Game = {
  worldW: number;
  plats: Plat[];
  fighters: Fighter[];
  bombs: Bomb[];
  particles: Particle[];
  texts: FloatText[];
  rings: Ring[];
  bubbles: Bubble[];
  frame: number;
  nextItem: number;
  lavaY: number;
  endIn: number;
  camX: number;
  shake: number;
  result: Result | null;
};

type Input = { left: boolean; right: boolean; jumpBuf: number; use: boolean };

// ---------- Hilfsfunktionen ----------
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function cameraTarget(g: Game, x: number) {
  if (g.worldW <= W) return (g.worldW - W) / 2;
  return clamp(x - W / 2, 0, g.worldW - W);
}

// Berge im Hintergrund (einmal erzeugen)
function makeRidge(seed: number, base: number, amp: number) {
  let s = seed;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const pts: number[] = [];
  let y = base;
  for (let i = 0; i < 80; i++) {
    y = clamp(y + (r() - 0.5) * amp, base - amp * 1.4, base + amp * 0.6);
    pts.push(y);
  }
  return pts;
}
const RIDGE_FAR = makeRidge(7, 300, 90);
const RIDGE_NEAR = makeRidge(42, 370, 70);
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 137.5) % W,
  y: (i * 71.3) % 260,
  s: (i % 3) + 1,
  p: i * 0.7,
}));

// ---------- Spiel aufbauen ----------
function newGame(players: number): Game {
  const order = Array.from({ length: players }, (_, i) => i).sort(() => Math.random() - 0.5);
  const worldW = players * PILLAR_GAP;
  const plats: Plat[] = order.map((_, i) => {
    const top = PILLAR_TOPS[i];
    return { x: PILLAR_GAP / 2 + i * PILLAR_GAP - PILLAR_W / 2, y: top, w: PILLAR_W, h: H - top, kind: "pillar", life: Infinity, idx: i };
  });
  const fighters: Fighter[] = PLAYERS.slice(0, players).map((p, i) => {
    const pillar = plats[order[i]];
    return {
      id: i,
      ...p,
      x: pillar.x + PILLAR_W / 2 - PW / 2,
      y: pillar.y - PH,
      vx: 0,
      vy: 0,
      facing: pillar.x < worldW / 2 ? 1 : -1,
      onGround: true,
      alive: true,
      item: null,
      shield: 0,
      stun: 0,
      punch: 0,
      bot: i !== 0,
      place: 0,
      walk: 0,
      squash: 0,
      ai: { cd: 30 + i * 8, move: 0 },
    };
  });
  const g: Game = {
    worldW,
    plats,
    fighters,
    bombs: [],
    particles: [],
    texts: [],
    rings: [],
    bubbles: [],
    frame: 0,
    nextItem: 120,
    lavaY: 490,
    endIn: -1,
    camX: 0,
    shake: 0,
    result: null,
  };
  g.camX = cameraTarget(g, fighters[0].x);
  return g;
}

function overlaps(f: Fighter, p: Plat) {
  return f.x < p.x + p.w && f.x + PW > p.x && f.y < p.y + p.h && f.y + PH > p.y;
}

// Gibt es Boden in der Nähe (auch etwas höher, das man hochspringen kann)?
function groundNear(g: Game, x: number, feet: number) {
  return g.plats.some((p) => x >= p.x && x <= p.x + p.w && p.y >= feet - 60 && p.y <= feet + 40);
}

function burst(g: Game, x: number, y: number, color: string, n: number, power = 4, glow = false) {
  for (let i = 0; i < n; i++) {
    const life = rand(25, 55);
    g.particles.push({ x, y, vx: rand(-power, power), vy: rand(-power * 1.3, power * 0.5), life, max: life, color, size: rand(2, 5), glow });
  }
}

function say(g: Game, f: Fighter, text: string) {
  g.texts.push({ text, x: f.x + PW / 2, y: f.y - 38, life: 60 });
}

function knock(f: Fighter, dir: number, power: number) {
  if (f.shield > 0) return false;
  f.vx = dir * power;
  f.vy = -6.5;
  f.onGround = false;
  f.stun = 28;
  return true;
}

// ---------- Gegenstände benutzen ----------
function activateItem(g: Game, f: Fighter): boolean {
  const cx = f.x + PW / 2;
  switch (f.item) {
    case "bridge": {
      if (!f.onGround) return false;
      const x = f.facing > 0 ? cx : cx - BRIDGE_LEN;
      g.plats.push({ x, y: f.y + PH, w: BRIDGE_LEN, h: 10, kind: "bridge", life: BRIDGE_LIFE, idx: 0 });
      burst(g, cx + f.facing * 60, f.y + PH, "#a16207", 14, 2);
      return true;
    }
    case "push": {
      let hit = false;
      f.punch = 14;
      for (const o of g.fighters) {
        if (!o.alive || o === f) continue;
        const dx = o.x + PW / 2 - cx;
        if (dx * f.facing > -10 && Math.abs(dx) < 75 && Math.abs(o.y - f.y) < 45) {
          if (knock(o, f.facing, 12)) hit = true;
          else say(g, o, "🛡️ Geblockt!");
        }
      }
      burst(g, cx + f.facing * 30, f.y + PH / 2, hit ? "#fde047" : "#ffffff", hit ? 20 : 6, 3, hit);
      if (hit) {
        say(g, f, "BUMM!");
        g.shake = Math.max(g.shake, 5);
      }
      return true;
    }
    case "jump": {
      if (!f.onGround) return false;
      f.vy = SUPER_JUMP;
      f.onGround = false;
      f.squash = -0.9;
      burst(g, cx, f.y + PH, "#4ade80", 16, 3, true);
      return true;
    }
    case "shield":
      f.shield = 300;
      g.rings.push({ x: cx, y: f.y + PH / 2, r: 10, life: 20 });
      return true;
    case "bomb":
      g.bombs.push({ x: cx, y: f.y + 8, vx: f.facing * 7, vy: -7, owner: f.id, t: 0 });
      return true;
  }
  return false;
}

function explode(g: Game, b: Bomb) {
  burst(g, b.x, b.y, "#f97316", 35, 6, true);
  burst(g, b.x, b.y, "#fde047", 20, 4, true);
  burst(g, b.x, b.y, "#57534e", 12, 3);
  g.rings.push({ x: b.x, y: b.y, r: 10, life: 25 });
  g.shake = 14;
  for (const f of g.fighters) {
    if (!f.alive) continue;
    const dx = f.x + PW / 2 - b.x;
    const dy = f.y + PH / 2 - b.y;
    if (Math.hypot(dx, dy) < 90) {
      if (!knock(f, dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx), 10)) say(g, f, "🛡️ Geblockt!");
    }
  }
  // Bomben zerstören Brücken
  g.plats = g.plats.filter((p) => p.kind === "pillar" || !(b.x > p.x - 60 && b.x < p.x + p.w + 60 && Math.abs(b.y - p.y) < 70));
}

// ---------- Computer-Gegner ----------
function thinkBot(g: Game, f: Fighter) {
  const ai = f.ai;
  const out = { move: ai.move, jump: false, use: false };
  if (!f.onGround) return out; // in der Luft: Richtung beibehalten
  if (--ai.cd > 0) return out;
  ai.cd = 6 + Math.floor(Math.random() * 8);

  const others = g.fighters.filter((o) => o.alive && o !== f);
  if (others.length === 0) {
    ai.move = 0;
    return { move: 0, jump: false, use: false };
  }
  const fc = f.x + PW / 2;
  let t = others[0];
  for (const o of others) if (Math.abs(o.x - f.x) < Math.abs(t.x - f.x)) t = o;
  const dx = t.x + PW / 2 - fc;
  const dy = t.y - f.y;
  const dir = dx > 0 ? 1 : -1;
  const ahead = groundNear(g, fc + dir * (PW / 2 + 10), f.y + PH);
  const close = Math.abs(dx) < 75 && Math.abs(dy) < 50;

  let move = Math.abs(dx) > 18 && ahead ? dir : 0;
  let jump = false;
  let use = false;

  const bombNear = g.bombs.some((b) => b.owner !== f.id && Math.hypot(b.x - fc, b.y - f.y) < 140);
  if (f.item === "shield" && (close || bombNear)) use = true;
  if (f.item === "push" && close) {
    f.facing = dir;
    use = true;
  }
  if (f.item === "bomb" && Math.abs(dx) > 80 && Math.abs(dx) < 320 && Math.random() < 0.6) {
    f.facing = dir;
    use = true;
  }
  if (f.item === "bridge" && !ahead) {
    f.facing = dir;
    use = true;
  }
  if (f.item === "jump" && !ahead) {
    f.facing = dir;
    use = true;
    move = dir;
  }
  // gegen eine Wand gelaufen? -> hochspringen
  if (move !== 0 && ai.move === move && Math.abs(f.vx) < 0.5) jump = true;
  if (close && dy < -30) jump = true;
  if (Math.random() < 0.1) move = 0; // kurz zögern

  ai.move = move;
  return { move, jump, use };
}

// ---------- Ein Spielschritt ----------
function step(g: Game, inp: Input) {
  g.frame++;

  // neue Gegenstände verteilen
  if (g.frame >= g.nextItem) {
    for (const f of g.fighters) {
      if (!f.alive) continue;
      f.item = ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)];
      say(g, f, `+ ${ITEMS[f.item].emoji}`);
      burst(g, f.x + PW / 2, f.y, "#fde68a", 8, 2, true);
    }
    g.nextItem = g.frame + ITEM_EVERY;
  }

  // Lava steigt
  if (g.frame > LAVA_START) g.lavaY = Math.max(g.lavaY - 0.15, 100);

  // Brücken zerfallen
  g.plats = g.plats.filter((p) => p.kind === "pillar" || --p.life > 0);

  for (const f of g.fighters) {
    if (!f.alive) continue;
    let move = 0;
    let jump = false;
    let use = false;
    if (!f.bot) {
      move = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      jump = inp.jumpBuf > 0;
      use = inp.use;
      inp.use = false;
    } else {
      ({ move, jump, use } = thinkBot(g, f));
    }
    if (f.stun > 0) {
      f.stun--;
      move = 0;
      jump = false;
    }
    if (move !== 0) f.facing = move > 0 ? 1 : -1;
    const accel = f.stun > 0 ? 0.02 : f.onGround ? 0.25 : 0.1;
    f.vx += (move * SPEED - f.vx) * accel;
    if (jump && f.onGround) {
      f.vy = JUMP;
      f.onGround = false;
      f.squash = -0.6;
      if (!f.bot) inp.jumpBuf = 0;
    }
    if (use && f.item && activateItem(g, f)) f.item = null;
    if (f.shield > 0) f.shield--;
    if (f.punch > 0) f.punch--;

    // Bewegung waagerecht
    f.vy = Math.min(f.vy + GRAVITY, 14);
    f.x += f.vx;
    for (const p of g.plats) {
      if (p.kind !== "pillar" || !overlaps(f, p)) continue;
      if (f.vx > 0) f.x = p.x - PW;
      else if (f.vx < 0) f.x = p.x + p.w;
      f.vx = 0;
    }
    // Bewegung senkrecht
    const prevBottom = f.y + PH;
    const wasGround = f.onGround;
    const impact = f.vy;
    f.y += f.vy;
    f.onGround = false;
    for (const p of g.plats) {
      if (!overlaps(f, p)) continue;
      if (f.vy >= 0 && prevBottom <= p.y + 1) {
        f.y = p.y - PH;
        f.vy = 0;
        f.onGround = true;
      } else if (p.kind === "pillar" && f.vy < 0) {
        f.y = p.y + p.h;
        f.vy = 0;
      }
    }
    if (f.onGround && !wasGround && impact > 3) {
      f.squash = Math.min(1, impact / 12);
      burst(g, f.x + PW / 2, f.y + PH, "#a8a29e", 5, 1.5);
    }
    f.squash *= 0.82;
    if (f.onGround) f.walk += Math.abs(f.vx) * 0.18;

    // in die Lava gefallen?
    if (f.y + PH * 0.6 > g.lavaY) {
      f.place = g.fighters.filter((o) => o.alive).length;
      f.alive = false;
      burst(g, f.x + PW / 2, g.lavaY, "#f97316", 40, 5, true);
      burst(g, f.x + PW / 2, g.lavaY, f.color, 18, 4);
      g.rings.push({ x: f.x + PW / 2, y: g.lavaY, r: 6, life: 22 });
      g.shake = Math.max(g.shake, 8);
      g.texts.push({ text: `${f.name} ist raus! 🔥`, x: f.x + PW / 2, y: g.lavaY - 50, life: 100 });
    }
  }
  if (inp.jumpBuf > 0) inp.jumpBuf--;

  // Bomben
  for (const b of g.bombs) {
    b.t++;
    b.vy += 0.4;
    b.x += b.vx;
    b.y += b.vy;
    if (b.t % 3 === 0) g.particles.push({ x: b.x + 5, y: b.y - 12, vx: rand(-0.5, 0.5), vy: rand(-1, 0), life: 12, max: 12, color: "#fde047", size: 3, glow: true });
    let boom = b.t > 120 || b.y > g.lavaY;
    if (!boom) boom = g.plats.some((p) => b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h);
    if (!boom)
      boom = g.fighters.some(
        (f) => f.alive && (f.id !== b.owner || b.t > 20) && b.x > f.x && b.x < f.x + PW && b.y > f.y && b.y < f.y + PH,
      );
    if (boom) {
      explode(g, b);
      b.t = -1;
    }
  }
  g.bombs = g.bombs.filter((b) => b.t >= 0);

  // Deko: Glut-Funken und Lava-Blasen
  if (Math.random() < 0.6) {
    const life = rand(80, 160);
    g.particles.push({ x: g.camX + rand(0, W), y: g.lavaY + 5, vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.5), life, max: life, color: Math.random() < 0.5 ? "#fb923c" : "#fde047", size: rand(1.5, 3.5), glow: true });
  }
  if (Math.random() < 0.05) g.bubbles.push({ x: g.camX + rand(0, W), life: 30, size: rand(5, 12) });
  for (const b of g.bubbles) b.life--;
  g.bubbles = g.bubbles.filter((b) => b.life > 0);

  for (const p of g.particles) {
    if (!p.glow || p.vy > -2) p.vy += p.glow ? 0.01 : 0.15;
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
  for (const t of g.texts) {
    t.y -= 0.6;
    t.life--;
  }
  g.texts = g.texts.filter((t) => t.life > 0);
  for (const r of g.rings) {
    r.r += 5;
    r.life--;
  }
  g.rings = g.rings.filter((r) => r.life > 0);
  g.shake *= 0.85;

  // Kamera folgt dir (oder wenn du raus bist, dem nächsten Spieler)
  const me = g.fighters[0];
  let follow = me;
  if (!me.alive) {
    const alive = g.fighters.filter((f) => f.alive);
    const mid = g.camX + W / 2;
    for (const f of alive) if (follow === me || Math.abs(f.x - mid) < Math.abs(follow.x - mid)) follow = f;
  }
  g.camX += (cameraTarget(g, follow.x) - g.camX) * 0.08;

  // Ende?
  const alive = g.fighters.filter((f) => f.alive);
  if (g.endIn < 0 && alive.length <= 1) g.endIn = 90;
  if (g.endIn > 0 && --g.endIn === 0) {
    if (alive.length === 1) alive[0].place = 1;
    const ranking = g.fighters
      .map((f) => ({ name: f.name, color: f.color, place: f.place, you: !f.bot }))
      .sort((a, b) => a.place - b.place);
    g.result = { won: me.alive, place: me.place, ranking };
  }
}

// ---------- Zeichnen ----------
function drawHat(ctx: CanvasRenderingContext2D, f: Fighter) {
  const top = -36;
  const d = f.facing;
  ctx.lineWidth = 2;
  switch (f.hat) {
    case "cap":
      ctx.fillStyle = "#1e3a8a";
      ctx.beginPath();
      ctx.arc(0, top + 6, 12, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(d > 0 ? 4 : -18, top + 4, 14, 4);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(0, top - 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "horns":
      ctx.fillStyle = "#fef3c7";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 6, top + 3);
        ctx.lineTo(s * 14, top - 9);
        ctx.lineTo(s * 11, top + 5);
        ctx.fill();
      }
      break;
    case "antenna":
      ctx.strokeStyle = "#166534";
      ctx.beginPath();
      ctx.moveTo(0, top + 2);
      ctx.quadraticCurveTo(d * 6, top - 8, d * 3, top - 14);
      ctx.stroke();
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(d * 3, top - 15, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "crown":
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(-10, top + 4);
      ctx.lineTo(-10, top - 6);
      ctx.lineTo(-5, top);
      ctx.lineTo(0, top - 9);
      ctx.lineTo(5, top);
      ctx.lineTo(10, top - 6);
      ctx.lineTo(10, top + 4);
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(-2, top - 1, 4, 4);
      break;
    case "bow":
      ctx.fillStyle = "#f472b6";
      ctx.beginPath();
      ctx.moveTo(-d * 4, top + 2);
      ctx.lineTo(-d * 14, top - 6);
      ctx.lineTo(-d * 14, top + 8);
      ctx.moveTo(-d * 4, top + 2);
      ctx.lineTo(d * 6, top - 6);
      ctx.lineTo(d * 6, top + 8);
      ctx.fill();
      ctx.fillStyle = "#be185d";
      ctx.beginPath();
      ctx.arc(-d * 4, top + 2, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "headband":
      ctx.fillStyle = "#f97316";
      ctx.fillRect(-13, top + 7, 26, 5);
      ctx.beginPath();
      ctx.moveTo(-d * 12, top + 8);
      ctx.lineTo(-d * 22, top + 4 + Math.sin(f.walk) * 2);
      ctx.lineTo(-d * 21, top + 12 + Math.sin(f.walk) * 2);
      ctx.fill();
      break;
    case "headphones":
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, top + 10, 14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(-16, top + 8, 6, 10);
      ctx.fillRect(10, top + 8, 6, 10);
      break;
    case "beanie":
      ctx.fillStyle = "#0ea5e9";
      ctx.beginPath();
      ctx.arc(0, top + 7, 13, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#e0f2fe";
      ctx.fillRect(-13, top + 4, 26, 4);
      ctx.beginPath();
      ctx.arc(0, top - 7, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, frame: number) {
  const cx = f.x + PW / 2;
  const bottom = f.y + PH;

  if (f.onGround) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, bottom, 15, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(cx, bottom);
  ctx.scale(1 + 0.22 * f.squash, 1 - 0.22 * f.squash);

  const dark = shade(f.color, -70);
  // Beine
  const swing = f.onGround && Math.abs(f.vx) > 0.4 ? Math.sin(f.walk) * 4 : f.onGround ? 0 : 2;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.roundRect(-10 + swing, -9, 8, 9, 3);
  ctx.roundRect(2 - swing, -9, 8, 9, 3);
  ctx.fill();

  // Körper
  const body = ctx.createLinearGradient(-13, -36, 13, -6);
  body.addColorStop(0, shade(f.color, 50));
  body.addColorStop(0.5, f.color);
  body.addColorStop(1, shade(f.color, -40));
  ctx.fillStyle = body;
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-13, -36, 26, 30, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, -13, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Augen
  const ex = f.facing * 3;
  const blink = (frame + f.id * 37) % 200 < 6;
  const dizzy = f.stun > 0;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(ex - 5, -25, 4, blink ? 0.8 : 5, 0, 0, Math.PI * 2);
  ctx.ellipse(ex + 5, -25, 4, blink ? 0.8 : 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!blink) {
    ctx.fillStyle = "#111";
    const wob = dizzy ? Math.sin(frame / 3) * 1.5 : 0;
    ctx.beginPath();
    ctx.arc(ex - 5 + f.facing * 1.5 + wob, -24, 2.2, 0, Math.PI * 2);
    ctx.arc(ex + 5 + f.facing * 1.5 - wob, -24, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bäckchen
  ctx.fillStyle = "rgba(244,114,182,0.45)";
  ctx.beginPath();
  ctx.arc(ex - 9, -17, 2.5, 0, Math.PI * 2);
  ctx.arc(ex + 9, -17, 2.5, 0, Math.PI * 2);
  ctx.fill();

  drawHat(ctx, f);
  ctx.restore();

  // Schubs-Handschuh
  if (f.punch > 0) {
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🥊", cx + f.facing * (18 + (14 - f.punch) * 2), f.y + 22);
  }
  if (f.stun > 0) {
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💫", cx + Math.sin(frame / 5) * 6, f.y - 6);
  }
  // Schild
  if (f.shield > 0 && (f.shield > 60 || Math.floor(f.shield / 6) % 2 === 0)) {
    const r = 30 + Math.sin(frame / 6) * 2;
    const sg = ctx.createRadialGradient(cx, f.y + PH / 2, r * 0.5, cx, f.y + PH / 2, r);
    sg.addColorStop(0, "rgba(103,232,249,0.05)");
    sg.addColorStop(1, "rgba(103,232,249,0.4)");
    ctx.fillStyle = sg;
    ctx.strokeStyle = "rgba(165,243,252,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, f.y + PH / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Namensschild
  const label = f.name + (f.item ? "  " + ITEMS[f.item].emoji : "");
  ctx.font = "bold 12px sans-serif";
  const tw = ctx.measureText(label).width + 14;
  const ly = f.y - 34;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2, ly, tw, 18, 9);
  ctx.fill();
  ctx.fillStyle = f.bot ? "#fff" : "#93c5fd";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, ly + 13);
  if (!f.bot) {
    const by = ly - 10 + Math.sin(frame / 8) * 2;
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.moveTo(cx - 6, by);
    ctx.lineTo(cx + 6, by);
    ctx.lineTo(cx, by + 7);
    ctx.fill();
  }
}

function drawPillar(ctx: CanvasRenderingContext2D, p: Plat) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  ctx.fillStyle = "#3f3936";
  ctx.fillRect(p.x, p.y, p.w, p.h);
  const bh = 15;
  const bw = 24;
  for (let row = 0, y = p.y + 10; y < H; row++, y += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = p.x - off, col = 0; x < p.x + p.w; x += bw, col++) {
      const h = ((p.idx + 1) * 73856093) ^ (row * 19349663) ^ (col * 83492791);
      const c = 92 + (Math.abs(h) % 24);
      ctx.fillStyle = `rgb(${c},${c - 8},${c - 16})`;
      ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  const sg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
  sg.addColorStop(0, "rgba(255,220,180,0.18)");
  sg.addColorStop(0.35, "rgba(0,0,0,0)");
  sg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = sg;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.restore();

  // Deckplatte
  const cap = ctx.createLinearGradient(0, p.y - 2, 0, p.y + 14);
  cap.addColorStop(0, "#d6d3d1");
  cap.addColorStop(1, "#78716c");
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.roundRect(p.x - 6, p.y - 2, p.w + 12, 14, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(p.x, p.y + 12, p.w, 4);
}

function drawBridge(ctx: CanvasRenderingContext2D, p: Plat) {
  if (p.life < 120 && Math.floor(p.life / 8) % 2 === 0) return; // blinken
  // Pfosten und Seile
  ctx.fillStyle = "#78350f";
  ctx.fillRect(p.x - 2, p.y - 18, 4, 18);
  ctx.fillRect(p.x + p.w - 2, p.y - 18, 4, 18);
  ctx.strokeStyle = "#d6b98c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 16);
  ctx.quadraticCurveTo(p.x + p.w / 2, p.y - 4, p.x + p.w, p.y - 16);
  ctx.stroke();
  // Bretter
  for (let x = p.x, i = 0; x < p.x + p.w; x += 12, i++) {
    ctx.fillStyle = i % 2 ? "#a0522d" : "#8b4513";
    ctx.fillRect(x, p.y, Math.min(11, p.x + p.w - x), p.h);
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fillRect(x, p.y, Math.min(11, p.x + p.w - x), 2);
  }
}

function drawRidge(ctx: CanvasRenderingContext2D, pts: number[], camX: number, factor: number, color: string) {
  ctx.save();
  ctx.translate(-camX * factor - 200, 0);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  pts.forEach((y, i) => ctx.lineTo(i * 40, y));
  ctx.lineTo((pts.length - 1) * 40, H);
  ctx.fill();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, g: Game) {
  const t = g.frame;

  // Himmel
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#0f0a2e");
  sky.addColorStop(0.45, "#3b1350");
  sky.addColorStop(0.75, "#9a3412");
  sky.addColorStop(1, "#f97316");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  for (const s of STARS) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t / 30 + s.p);
    ctx.fillStyle = "#fff";
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // Mond
  const mx = W * 0.8 - g.camX * 0.05;
  const mg = ctx.createRadialGradient(mx, 95, 20, mx, 95, 110);
  mg.addColorStop(0, "rgba(254,243,199,0.35)");
  mg.addColorStop(1, "rgba(254,243,199,0)");
  ctx.fillStyle = mg;
  ctx.fillRect(mx - 110, 0, 220, 220);
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.arc(mx, 95, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(180,150,100,0.35)";
  ctx.beginPath();
  ctx.arc(mx - 10, 85, 7, 0, Math.PI * 2);
  ctx.arc(mx + 12, 104, 5, 0, Math.PI * 2);
  ctx.fill();

  drawRidge(ctx, RIDGE_FAR, g.camX, 0.2, "#2a0f3a");
  drawRidge(ctx, RIDGE_NEAR, g.camX, 0.45, "#1a0a1f");

  // ---- Spielwelt (mit Kamera und Wackeln) ----
  ctx.save();
  const sx = (Math.random() - 0.5) * g.shake;
  const sy = (Math.random() - 0.5) * g.shake;
  ctx.translate(Math.round(-g.camX + sx), Math.round(sy));

  for (const p of g.plats) if (p.kind === "bridge") drawBridge(ctx, p);
  for (const p of g.plats) if (p.kind === "pillar") drawPillar(ctx, p);

  // Lava-Leuchten auf den Säulen
  const glow = ctx.createLinearGradient(0, g.lavaY - 170, 0, g.lavaY);
  glow.addColorStop(0, "rgba(255,110,20,0)");
  glow.addColorStop(1, "rgba(255,110,20,0.45)");
  ctx.fillStyle = glow;
  ctx.fillRect(g.camX - 20, g.lavaY - 170, W + 40, 170);

  for (const b of g.bombs) {
    const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, 9);
    bg.addColorStop(0, "#6b7280");
    bg.addColorStop(1, "#030712");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a8a29e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x + 2, b.y - 8);
    ctx.quadraticCurveTo(b.x + 6, b.y - 14, b.x + 5, b.y - 12);
    ctx.stroke();
  }

  for (const f of g.fighters) if (f.alive) drawFighter(ctx, f, t);

  for (const r of g.rings) {
    ctx.strokeStyle = `rgba(255,237,160,${r.life / 25})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lava (zwei Wellen)
  const left = g.camX - 40;
  ctx.fillStyle = "#b91c1c";
  ctx.beginPath();
  ctx.moveTo(left, H);
  for (let x = left; x <= left + W + 80; x += 16) ctx.lineTo(x, g.lavaY - 6 + Math.sin(x / 55 - t / 20) * 6);
  ctx.lineTo(left + W + 80, H);
  ctx.fill();
  const lava = ctx.createLinearGradient(0, g.lavaY, 0, H);
  lava.addColorStop(0, "#fdba74");
  lava.addColorStop(0.15, "#f97316");
  lava.addColorStop(0.5, "#dc2626");
  lava.addColorStop(1, "#7f1d1d");
  ctx.fillStyle = lava;
  ctx.beginPath();
  ctx.moveTo(left, H);
  for (let x = left; x <= left + W + 80; x += 16) ctx.lineTo(x, g.lavaY + Math.sin(x / 40 + t / 15) * 5);
  ctx.lineTo(left + W + 80, H);
  ctx.fill();
  for (const b of g.bubbles) {
    const k = 1 - b.life / 30;
    ctx.strokeStyle = `rgba(254,215,170,${1 - k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, g.lavaY + 2, b.size * (0.3 + k), Math.PI, 0);
    ctx.stroke();
  }

  // Partikel
  for (const p of g.particles) {
    ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
    if (p.glow) ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;

  // schwebende Texte
  ctx.textAlign = "center";
  ctx.font = "bold 16px sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  for (const tx of g.texts) {
    ctx.globalAlpha = Math.min(1, tx.life / 20);
    ctx.strokeText(tx.text, tx.x, tx.y);
    ctx.fillStyle = "#fff";
    ctx.fillText(tx.text, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  drawHud(ctx, g);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(10,5,25,0.6)";
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game) {
  const n = g.fighters.length;
  const aliveN = g.fighters.filter((f) => f.alive).length;

  // Wer ist noch dabei?
  const pw = 24 + n * 20;
  panel(ctx, 12, 10, Math.max(pw, 120), 50);
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(`👥 Noch ${aliveN} von ${n}`, 22, 28);
  g.fighters.forEach((f, i) => {
    const x = 28 + i * 20;
    ctx.globalAlpha = f.alive ? 1 : 0.3;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(x, 45, 7, 0, Math.PI * 2);
    ctx.fill();
    if (!f.bot) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!f.alive) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 5, 40);
      ctx.lineTo(x + 5, 50);
      ctx.moveTo(x + 5, 40);
      ctx.lineTo(x - 5, 50);
      ctx.stroke();
    }
  });

  // Countdown
  panel(ctx, W / 2 - 130, 10, 260, 34);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px sans-serif";
  const secs = Math.max(0, Math.ceil((g.nextItem - g.frame) / 60));
  ctx.fillText(`🎁 Neuer Gegenstand in ${secs}`, W / 2, 33);

  if (g.frame > LAVA_START && g.frame < LAVA_START + 180 && Math.floor(g.frame / 20) % 2 === 0) {
    ctx.font = "900 34px sans-serif";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText("🔥 DIE LAVA STEIGT! 🔥", W / 2, 95);
    ctx.fillStyle = "#fde047";
    ctx.fillText("🔥 DIE LAVA STEIGT! 🔥", W / 2, 95);
  }

  // Minikarte
  if (g.worldW > W) {
    const mw = 200;
    const mx = W - mw - 12;
    const k = mw / g.worldW;
    panel(ctx, mx - 6, 10, mw + 12, 40);
    for (const p of g.plats) {
      ctx.fillStyle = p.kind === "pillar" ? "#a8a29e" : "#b45309";
      ctx.fillRect(mx + p.x * k, 22 + (p.y - 250) * 0.08, Math.max(2, p.w * k), p.kind === "pillar" ? 16 : 2);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + Math.max(0, g.camX) * k, 14, W * k, 32);
    for (const f of g.fighters) {
      if (!f.alive) continue;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(mx + (f.x + PW / 2) * k, 22, f.bot ? 3 : 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // dein Gegenstand unten links
  const me = g.fighters[0];
  if (me.alive) {
    panel(ctx, 12, H - 64, 280, 52);
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    if (me.item) {
      ctx.font = "30px sans-serif";
      ctx.fillText(ITEMS[me.item].emoji, 24, H - 27);
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(ITEMS[me.item].name, 66, H - 40);
      ctx.font = "13px sans-serif";
      ctx.fillStyle = "#fde68a";
      ctx.fillText("Drücke E zum Benutzen", 66, H - 21);
    } else {
      ctx.font = "15px sans-serif";
      ctx.fillText("Kein Gegenstand … warte kurz!", 24, H - 33);
    }
  }
}

// ---------- React-Komponente ----------
export default function PillarGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(null as unknown as Game);
  const inputRef = useRef<Input>({ left: false, right: false, jumpBuf: 0, use: false });
  const playingRef = useRef(false);
  const spectRef = useRef(false);
  const [screen, setScreen] = useState<"menu" | "playing" | "over">("menu");
  const [result, setResult] = useState<Result | null>(null);
  const [spectating, setSpectating] = useState<number | null>(null);
  const [players, setPlayers] = useState(8);

  const start = () => {
    gameRef.current = newGame(players);
    inputRef.current = { left: false, right: false, jumpBuf: 0, use: false };
    playingRef.current = true;
    spectRef.current = false;
    setSpectating(null);
    setResult(null);
    setScreen("playing");
  };

  // Spielschleife
  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    if (!gameRef.current) gameRef.current = newGame(8);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += Math.min(100, now - last);
      last = now;
      const g = gameRef.current;
      while (acc >= 1000 / 60) {
        if (playingRef.current && !g.result) step(g, inputRef.current);
        acc -= 1000 / 60;
      }
      draw(ctx, g);
      if (playingRef.current && !spectRef.current && !g.fighters[0].alive) {
        spectRef.current = true;
        setSpectating(g.fighters[0].place);
      }
      if (playingRef.current && g.result) {
        playingRef.current = false;
        setResult(g.result);
        setSpectating(null);
        setScreen("over");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tastatur
  useEffect(() => {
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      const inp = inputRef.current;
      if (k === "arrowleft" || k === "a") inp.left = down;
      else if (k === "arrowright" || k === "d") inp.right = down;
      else if (k === "arrowup" || k === "w" || k === " ") {
        if (down && !e.repeat) inp.jumpBuf = 8;
      } else if (k === "e" || k === "f" || k === "enter") {
        if (down && !e.repeat) inp.use = true;
      } else return;
      if (playingRef.current) e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => set(e, true);
    const ku = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const touch = (action: "left" | "right" | "jump" | "use", down: boolean) => {
    const inp = inputRef.current;
    if (action === "left") inp.left = down;
    if (action === "right") inp.right = down;
    if (action === "jump" && down) inp.jumpBuf = 8;
    if (action === "use" && down) inp.use = true;
  };

  const btn = "select-none touch-none rounded-2xl bg-white/15 px-5 py-4 text-2xl font-bold text-white active:bg-white/30";
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="flex w-full max-w-[960px] flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl shadow-[0_0_60px_rgba(249,115,22,0.35)] ring-4 ring-orange-500/40">
        <canvas ref={canvasRef} width={W} height={H} className="block h-auto w-full" />

        {spectating !== null && screen === "playing" && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <div className="flex items-center gap-4 rounded-2xl bg-black/70 px-5 py-3 text-white backdrop-blur">
              <span className="font-bold">🔥 Du bist raus! Platz {spectating} · Du schaust zu …</span>
              <button onClick={start} className="rounded-full bg-orange-500 px-4 py-2 font-black hover:bg-orange-400">
                NOCHMAL 🔁
              </button>
            </div>
          </div>
        )}

        {screen !== "playing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center text-white backdrop-blur-[2px]">
            {screen === "menu" ? (
              <>
                <h1 className="bg-gradient-to-b from-yellow-200 to-orange-500 bg-clip-text text-5xl font-black tracking-tight text-transparent drop-shadow sm:text-7xl">
                  THE PILERS
                </h1>
                <p className="max-w-lg text-sm sm:text-lg">
                  Du stehst auf einer Säule über der Lava. Alle 5 Sekunden bekommst du einen Zufalls-Gegenstand. Schubs
                  alle anderen runter. Wer als Letzter übrig ist, gewinnt!
                </p>
                <div className="hidden flex-wrap justify-center gap-2 text-sm sm:flex">
                  {ITEM_KINDS.map((k) => (
                    <span key={k} className="rounded-lg bg-white/10 px-2 py-1">
                      {ITEMS[k].emoji} {ITEMS[k].name}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">Gegner:</span>
                  {[4, 6, 8].map((n) => (
                    <button
                      key={n}
                      onClick={() => setPlayers(n)}
                      className={`rounded-full px-4 py-1.5 font-bold transition ${
                        players === n ? "bg-orange-500 text-white" : "bg-white/15 hover:bg-white/25"
                      }`}
                    >
                      {n - 1}
                    </button>
                  ))}
                </div>
                <p className="text-xs opacity-80 sm:text-sm">
                  ⬅️ ➡️ / A D = laufen · ⬆️ / W / Leertaste = springen · E = Gegenstand benutzen
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl font-black sm:text-6xl">
                  {result?.won ? "🏆 DU HAST GEWONNEN!" : `Platz ${result?.place}`}
                </h1>
                <ol className="grid grid-cols-2 gap-x-6 gap-y-1 text-left text-sm sm:text-base">
                  {result?.ranking.map((r) => (
                    <li key={r.name} className={`flex items-center gap-2 ${r.you ? "font-black text-yellow-300" : ""}`}>
                      <span className="w-7 text-right">{medals[r.place - 1] ?? `${r.place}.`}</span>
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </li>
                  ))}
                </ol>
              </>
            )}
            <button
              onClick={start}
              className="mt-2 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 px-10 py-4 text-2xl font-black text-white shadow-lg transition hover:scale-105"
            >
              {screen === "menu" ? "SPIELEN ▶" : "NOCHMAL 🔁"}
            </button>
          </div>
        )}
      </div>

      {/* Knöpfe für Tablet / Handy */}
      <div className="flex w-full justify-between gap-2 sm:hidden">
        <div className="flex gap-2">
          {(["left", "right"] as const).map((a) => (
            <button
              key={a}
              className={btn}
              onPointerDown={() => touch(a, true)}
              onPointerUp={() => touch(a, false)}
              onPointerLeave={() => touch(a, false)}
            >
              {a === "left" ? "◀" : "▶"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button className={btn} onPointerDown={() => touch("jump", true)}>
            ⤒
          </button>
          <button className={btn} onPointerDown={() => touch("use", true)}>
            E
          </button>
        </div>
      </div>
    </div>
  );
}
