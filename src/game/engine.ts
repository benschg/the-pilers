import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/addons/objects/Sky.js";
import { Sfx } from "./sfx";
import { DEFAULT_RULES, type Rules } from "./items";
import { ITEMS, ITEM_KINDS, type HudState, type ItemKind, type Result, type Slot } from "./items";

// ---------- Einstellungen ----------
const GRAV = 20;
const SPEED = 6;
const JUMP_V = 7.2;
const EYE = 1.6;
const BODY_R = 0.45;
const PILLAR_R = 2.6;
const LAVA_SPEED = 0.25;
const BRIDGE_LEN = 12;
const BRIDGE_W = 1.8;
const BRIDGE_LIFE = 12;
const SLOTS = 5;

type WeaponKind = "rifle" | "sniper" | "shotgun" | "smg" | "minigun" | "rocket" | "bow" | "raygun";
type ProjType = "rocket" | "arrow" | "plasma";
type WeaponCfg = {
  dmg: number;
  head: number;
  cd: number; // Zeit zwischen Schüssen
  spread: number; // Ungenauigkeit für dich
  botSpread: number; // Ungenauigkeit für Gegner
  pellets: number; // Kugeln pro Schuss
  auto: boolean; // gedrückt halten = Dauerfeuer
  kb: number; // Rückstoß beim Getroffenen
  color: string;
  width: number;
  recoil: number;
  projectile?: ProjType;
};
const WEAPON: Record<WeaponKind, WeaponCfg> = {
  rifle: { dmg: 8, head: 14, cd: 0.11, spread: 0.016, botSpread: 0.055, pellets: 1, auto: true, kb: 0.9, color: "#fde68a", width: 0.8, recoil: 0.35 },
  sniper: { dmg: 75, head: 150, cd: 1.3, spread: 0.045, botSpread: 0.022, pellets: 1, auto: false, kb: 7, color: "#93c5fd", width: 1.6, recoil: 1 },
  shotgun: { dmg: 10, head: 14, cd: 0.95, spread: 0.085, botSpread: 0.11, pellets: 8, auto: false, kb: 1.3, color: "#fdba74", width: 0.6, recoil: 1 },
  smg: { dmg: 6, head: 10, cd: 0.07, spread: 0.035, botSpread: 0.07, pellets: 1, auto: true, kb: 0.5, color: "#fde68a", width: 0.6, recoil: 0.2 },
  minigun: { dmg: 7, head: 11, cd: 0.05, spread: 0.045, botSpread: 0.08, pellets: 1, auto: true, kb: 0.6, color: "#fcd34d", width: 0.7, recoil: 0.15 },
  rocket: { dmg: 55, head: 55, cd: 1.5, spread: 0, botSpread: 0.03, pellets: 1, auto: false, kb: 0, color: "#fb923c", width: 1, recoil: 1.2, projectile: "rocket" },
  bow: { dmg: 25, head: 40, cd: 0.35, spread: 0, botSpread: 0.03, pellets: 1, auto: false, kb: 3, color: "#ffffff", width: 1, recoil: 0.5, projectile: "arrow" },
  raygun: { dmg: 16, head: 24, cd: 0.22, spread: 0.01, botSpread: 0.05, pellets: 1, auto: true, kb: 1.5, color: "#38bdf8", width: 1, recoil: 0.4, projectile: "plasma" },
};
const isWeapon = (k: ItemKind): k is WeaponKind => k in WEAPON;

type HealCfg = { hp?: number; hpMax?: number; shield?: number; shieldMax?: number; slow?: boolean; overflow?: boolean };
const HEALS: Partial<Record<ItemKind, HealCfg>> = {
  apple: { hp: 15 },
  bandage: { hp: 20, hpMax: 75 },
  medkit: { hp: 50 },
  fish: { hp: 30, overflow: true },
  pizza: { hp: 60, slow: true },
  icecream: { hp: 25, shield: 25, slow: true },
  shieldpotion: { shield: 50 },
  minishield: { shield: 25, shieldMax: 50 },
};
const UP = new THREE.Vector3(0, 1, 0);

export type Difficulty = "easy" | "normal" | "hard";
export type GameMode = "classic" | "br";
export type Theme = "sky" | "real" | "night";

const BOT_NAMES = [
  "Nova", "Rocky", "Zippy", "Comet", "Mango", "Echo", "Bolt", "Coco", "Dash", "Fizz", "Gizmo", "Hopper", "Jinx", "Koala",
  "Lemon", "Mocha", "Ninja", "Ozzy", "Peppi", "Quirk", "Rusty", "Sparky", "Taco", "Viper", "Wally", "Yoyo", "Ziggy",
  "Bubbles", "Cosmo", "Dino", "Flash", "Goofy", "Hazel", "Iggy", "Jazz", "Kobi", "Loki", "Milo", "Nugget", "Otto",
];
const HAT_LIST: Hat[] = ["cap", "horns", "antenna", "crown", "bow", "headband", "headphones", "beanie"];

function rosterEntry(i: number): { name: string; color: string; hat: Hat } {
  if (i < 8) return ROSTER[i];
  const k = i - 8;
  const round = Math.floor(k / BOT_NAMES.length);
  const name = BOT_NAMES[k % BOT_NAMES.length] + (round > 0 ? String(round + 1) : "");
  const color = "#" + new THREE.Color().setHSL(Math.random(), 0.65, 0.55).getHexString();
  return { name, color, hat: HAT_LIST[i % HAT_LIST.length] };
}

// Felsen-Textur mit Höhen-Relief (für die realistische Welt)
function rockTextures() {
  const S = 256;
  const grid = (g: number) => {
    const a = new Float32Array((g + 1) * (g + 1)).map(() => Math.random());
    for (let i = 0; i <= g; i++) {
      a[i * (g + 1) + g] = a[i * (g + 1)];
      a[g * (g + 1) + i] = a[i];
    }
    return a;
  };
  const octs = [4, 8, 16, 32, 64].map((g) => ({ g, a: grid(g) }));
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      let amp = 0.5;
      for (const o of octs) {
        const fx = (x / S) * o.g;
        const fy = (y / S) * o.g;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const w = o.g + 1;
        const a = o.a[iy * w + ix];
        const b = o.a[iy * w + ix + 1];
        const c = o.a[(iy + 1) * w + ix];
        const d = o.a[(iy + 1) * w + ix + 1];
        v += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        amp *= 0.5;
      }
      v += 0.12 * Math.sin((y / S) * Math.PI * 2 * 6 + v * 4);
      hgt[y * S + x] = v;
    }
  const cc = document.createElement("canvas");
  const nc = document.createElement("canvas");
  cc.width = cc.height = nc.width = nc.height = S;
  const ci = cc.getContext("2d")!.createImageData(S, S);
  const ni = nc.getContext("2d")!.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const v = hgt[i];
      const k = 0.45 + 0.6 * v;
      ci.data[i * 4] = Math.min(255, k * 150 + 20);
      ci.data[i * 4 + 1] = Math.min(255, k * 138 + 18);
      ci.data[i * 4 + 2] = Math.min(255, k * 122 + 16);
      ci.data[i * 4 + 3] = 255;
      const dx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
      const dy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
      const nx = -dx * 6;
      const ny = -dy * 6;
      const l = Math.hypot(nx, ny, 1);
      ni.data[i * 4] = ((nx / l) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 3] = 255;
    }
  cc.getContext("2d")!.putImageData(ci, 0, 0);
  nc.getContext("2d")!.putImageData(ni, 0, 0);
  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(nc);
  for (const t of [map, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 5);
  }
  return { map, normal };
}

function makeChute(color: string) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7 }),
  );
  canopy.scale.set(1.3, 0.55, 1);
  canopy.position.y = 3.3;
  g.add(canopy);
  const lineMat = new THREE.MeshBasicMaterial({ color: "#e5e7eb" });
  for (const [x, z] of [[-1.6, 0.8], [1.6, 0.8], [-1.6, -0.8], [1.6, -0.8]]) {
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.6, 4), lineMat);
    line.position.set(x / 2, 2.2, z / 2);
    line.lookAt(new THREE.Vector3(0, 1, 0));
    line.rotateX(Math.PI / 2);
    g.add(line);
  }
  return g;
}
type DiffCfg = {
  spread: number; // wie ungenau die Gegner schießen
  assist: number; // wie groß die Trefferzone für dich ist
  dmgToYou: number; // wie viel Schaden du bekommst
  kbToYou: number; // wie weit du weggeschubst wirst
  think: [number, number]; // wie schnell Gegner reagieren (Sekunden)
  turn: number; // wie schnell Gegner zielen
  fireChance: number;
  sniperChance: number;
  youBias: number; // > 1: Gegner greifen lieber andere an als dich
  startMed: boolean;
  lavaStart: number;
  range: number;
};
const DIFF: Record<Difficulty, DiffCfg> = {
  easy: { spread: 2.4, assist: 1.35, dmgToYou: 0.5, kbToYou: 0.6, think: [0.45, 0.8], turn: 2.2, fireChance: 0.3, sniperChance: 0.015, youBias: 2.2, startMed: true, lavaStart: 60, range: 40 },
  normal: { spread: 1.5, assist: 1.15, dmgToYou: 0.8, kbToYou: 0.85, think: [0.3, 0.5], turn: 3.5, fireChance: 0.55, sniperChance: 0.04, youBias: 1.4, startMed: false, lavaStart: 50, range: 55 },
  hard: { spread: 1, assist: 1, dmgToYou: 1, kbToYou: 1, think: [0.15, 0.35], turn: 5, fireChance: 0.8, sniperChance: 1, youBias: 1, startMed: false, lavaStart: 45, range: 70 },
};

type Hat = "cap" | "horns" | "antenna" | "crown" | "bow" | "headband" | "headphones" | "beanie";

const ROSTER: { name: string; color: string; hat: Hat }[] = [
  { name: "Du", color: "#3b82f6", hat: "cap" },
  { name: "Blitz", color: "#ef4444", hat: "horns" },
  { name: "Kiwi", color: "#22c55e", hat: "antenna" },
  { name: "Sunny", color: "#facc15", hat: "crown" },
  { name: "Luna", color: "#a855f7", hat: "bow" },
  { name: "Turbo", color: "#14b8a6", hat: "headband" },
  { name: "Pixel", color: "#ec4899", hat: "headphones" },
  { name: "Frost", color: "#e2e8f0", hat: "beanie" },
];

type Pillar = { x: number; z: number; r: number; top: number; prop?: boolean };

type Bridge = {
  sx: number;
  sy: number;
  sz: number;
  dx: number;
  dz: number;
  px: number;
  pz: number;
  lenH: number;
  slope: number;
  life: number;
  mesh: THREE.Group;
};

type Bomb = { pos: THREE.Vector3; vel: THREE.Vector3; owner: Fighter; t: number; mesh: THREE.Group };
type Proj = {
  type: ProjType;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: Fighter;
  t: number;
  mesh: THREE.Group;
  grav: number;
  dmg: number;
  dead?: boolean;
};
type Tracer = { mesh: THREE.Mesh; life: number; max: number };
type Floater = { sprite: THREE.Sprite; life: number };

type Ai = {
  think: number;
  wishX: number;
  wishZ: number;
  aimYaw: number;
  aimPitch: number;
  fire: boolean;
  use: boolean;
  jump: boolean;
  forwardT: number;
  strafeX: number;
  strafeZ: number;
  strafeT: number;
  leapX: number;
  leapZ: number;
};

type Fighter = {
  id: number;
  name: string;
  color: string;
  bot: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  alive: boolean;
  hp: number;
  slots: (Slot | null)[];
  sel: number;
  cd: number;
  stun: number;
  place: number;
  lastHitBy: Fighter | null;
  lastHitT: number;
  walk: number;
  spin: number;
  charge: number;
  shield: number;
  regenHp: number;
  regenShield: number;
  kills: number;
  dance: number;
  team: number;
  glide: boolean;
  chute: THREE.Object3D | null;
  details: THREE.Object3D[];
  mesh: THREE.Group;
  feet: THREE.Mesh[];
  gun: THREE.Mesh;
  label: THREE.Sprite;
  labelCanvas: HTMLCanvasElement;
  labelTex: THREE.CanvasTexture;
  labelHp: number;
  ai: Ai;
};

// ---------- kleine Helfer ----------
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fwd = (yaw: number, pitch = 0) =>
  new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : Infinity;
}

function rayPillar(o: THREE.Vector3, d: THREE.Vector3, p: Pillar) {
  let best = Infinity;
  const ox = o.x - p.x;
  const oz = o.z - p.z;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-8) {
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - p.r * p.r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0 && o.y + d.y * t <= p.top) best = t;
    }
  }
  if (d.y < 0 && o.y > p.top) {
    const t = (p.top - o.y) / d.y;
    const hx = ox + d.x * t;
    const hz = oz + d.z * t;
    if (hx * hx + hz * hz <= p.r * p.r && t < best) best = t;
  }
  return best;
}

function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function brickTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#2f2826";
  x.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 32 : 0;
    for (let col = -1; col < 4; col++) {
      const v = 85 + Math.random() * 35;
      x.fillStyle = `rgb(${v},${v - 10},${v - 18})`;
      x.fillRect(col * 64 + off + 2, row * 32 + 2, 60, 28);
      for (let i = 0; i < 18; i++) {
        x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
        x.fillRect(col * 64 + off + 2 + Math.random() * 58, row * 32 + 2 + Math.random() * 26, 3, 3);
      }
    }
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 7);
  return t;
}

const SUN_DIR = new THREE.Vector3(-0.4, 0.75, -0.55).normalize();
const MOON_DIR = new THREE.Vector3(0.45, 0.42, -0.78).normalize();
const PILLAR_COLORS = ["#fb923c", "#a855f7", "#f1f5f9", "#f472b6", "#2dd4bf", "#facc15", "#60a5fa", "#4ade80", "#e2e8f0"];

function marbleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#f4f4f5";
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    x.strokeStyle = `rgba(130,130,150,${0.04 + Math.random() * 0.1})`;
    x.lineWidth = 1 + Math.random() * 5;
    x.beginPath();
    let px = Math.random() * 256;
    let py = -10;
    x.moveTo(px, py);
    while (py < 266) {
      px += (Math.random() - 0.5) * 16;
      py += 10 + Math.random() * 30;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 3);
  return t;
}

function makeIsland() {
  const g = new THREE.Group();
  const R = 2.5 + Math.random() * 2;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(R, R * 1.7, 7), new THREE.MeshStandardMaterial({ color: "#b07a5a", flatShading: true, roughness: 0.9 }));
  rock.rotation.x = Math.PI;
  rock.position.y = -R * 0.85;
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R, 0.6, 7), new THREE.MeshStandardMaterial({ color: "#6fd04a", flatShading: true, roughness: 0.8 }));
  g.add(rock, grass);
  const trees = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < trees; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * R * 0.55;
    const s = 0.7 + Math.random() * 0.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.17 * s, 1.3 * s, 6), new THREE.MeshStandardMaterial({ color: "#7c4a2d", roughness: 0.9 }));
    trunk.position.set(Math.sin(a) * r, 0.9 * s, Math.cos(a) * r);
    const crown = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85 * s, 0),
      new THREE.MeshStandardMaterial({ color: Math.random() < 0.3 ? "#f9a8d4" : "#3fb950", flatShading: true, roughness: 0.8 }),
    );
    crown.position.set(trunk.position.x, 2.0 * s, trunk.position.z);
    g.add(trunk, crown);
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

function makeCloud(m: THREE.Material) {
  const g = new THREE.Group();
  const n = 6 + Math.floor(Math.random() * 6);
  const geo = new THREE.IcosahedronGeometry(1, 3);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(geo, m);
    const r = 4 + Math.random() * 6;
    s.scale.set(r, r * 0.8, r);
    s.position.set((Math.random() - 0.5) * 26, Math.random() * 4, (Math.random() - 0.5) * 10);
    g.add(s);
  }
  return g;
}

const mat = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
const toy = (color: THREE.ColorRepresentation, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, ...extra });

// ---------- Figuren ----------
function buildHat(hat: Hat): THREE.Object3D {
  const g = new THREE.Group();
  const top = 1.62;
  switch (hat) {
    case "cap": {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#1e3a8a"));
      dome.position.y = top - 0.12;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.35), mat("#1e3a8a"));
      brim.position.set(0, top - 0.1, -0.45);
      g.add(dome, brim);
      break;
    }
    case "horns":
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 10), mat("#fef3c7"));
        h.position.set(s * 0.25, top + 0.1, 0);
        h.rotation.z = -s * 0.5;
        g.add(h);
      }
      break;
    case "antenna": {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45), mat("#166534"));
      stick.position.y = top + 0.2;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat("#fde047", { emissive: "#facc15", emissiveIntensity: 0.8 }));
      ball.position.y = top + 0.45;
      g.add(stick, ball);
      break;
    }
    case "crown": {
      const gold = mat("#f59e0b", { metalness: 0.8, roughness: 0.25 });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16, 1, true), gold);
      ring.position.y = top + 0.02;
      g.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), gold);
        spike.position.set(Math.sin(a) * 0.28, top + 0.18, Math.cos(a) * 0.28);
        g.add(spike);
      }
      break;
    }
    case "bow":
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), mat("#f472b6"));
        w.position.set(s * 0.17, top + 0.02, 0.1);
        w.rotation.z = (s * Math.PI) / 2;
        g.add(w);
      }
      break;
    case "headband": {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.05, 8, 24), mat("#f97316"));
      band.rotation.x = Math.PI / 2;
      band.position.y = 1.42;
      g.add(band);
      break;
    }
    case "headphones": {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 8, 20, Math.PI), mat("#1f2937"));
      arc.position.y = 1.3;
      const pads = [-1, 1].map((s) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14), mat("#111827"));
        p.rotation.z = Math.PI / 2;
        p.position.set(s * 0.45, 1.3, 0);
        return p;
      });
      g.add(arc, ...pads);
      break;
    }
    case "beanie": {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#0ea5e9"));
      dome.position.y = top - 0.14;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat("#e0f2fe"));
      pom.position.y = top + 0.32;
      g.add(dome, pom);
      break;
    }
  }
  return g;
}

function buildFighterMesh(color: string, hat: Hat) {
  const g = new THREE.Group();
  const bodyMat = toy(color);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.85, 6, 18), bodyMat);
  body.position.y = 0.85;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.45)));
  belly.scale.set(1, 1.1, 0.5);
  belly.position.set(0, 0.72, -0.25);
  g.add(body, belly);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), toy("#ffffff", { roughness: 0.1 }));
    eye.position.set(s * 0.15, 1.3, -0.34);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat("#111111", { roughness: 0.1 }));
    pupil.position.set(s * 0.15, 1.3, -0.45);
    g.add(eye, pupil);
  }
  const feet = [-1, 1].map((s) => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat(new THREE.Color(color).multiplyScalar(0.45)));
    f.scale.set(1, 0.6, 1.4);
    f.position.set(s * 0.2, 0.07, -0.05);
    g.add(f);
    return f;
  });
  const handMat = toy(new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.3));
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 10), bodyMat);
    arm.position.set(s * 0.36, 0.92, -0.2);
    arm.rotation.x = -1.25;
    arm.rotation.z = s * 0.25;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), handMat);
    hand.position.set(s * 0.3, 0.98, -0.42);
    g.add(arm, hand);
  }
  const pack = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.56, 0.26, 3, 0.08), toy("#f8fafc"));
  pack.position.set(0, 0.95, 0.42);
  g.add(pack);
  ["#f87171", "#facc15", "#4ade80", "#60a5fa"].forEach((c, i) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.02), toy(c));
    stripe.position.set(0, 1.12 - i * 0.1, 0.56);
    g.add(stripe);
  });
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.7), mat("#374151", { metalness: 0.5, roughness: 0.4 }));
  gun.position.set(0.42, 0.95, -0.35);
  g.add(gun, buildHat(hat));
  body.castShadow = true;
  pack.castShadow = true;
  const details = g.children.filter((c) => c !== body && c !== gun);
  return { group: g, feet, gun, details };
}

// Waffe/Gegenstand in deiner Hand (Ich-Perspektive)
function buildViewModel(kind: ItemKind | null): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.rotation.z = rz;
    g.add(mesh);
    return mesh;
  };
  const dark = mat("#1f2937", { metalness: 0.6, roughness: 0.35 });
  switch (kind) {
    case "rifle": {
      const teal = toy("#0d9488");
      add(new THREE.BoxGeometry(0.1, 0.13, 0.55), teal, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 10), dark, 0, 0.02, -0.45, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 14), mat("#f97316", { metalness: 0.3 }), 0, -0.08, -0.05, Math.PI / 2);
      add(new THREE.BoxGeometry(0.07, 0.15, 0.08), dark, 0, -0.12, 0.12, 0.3);
      add(new THREE.BoxGeometry(0.09, 0.12, 0.22), teal, 0, -0.02, 0.33);
      break;
    }
    case "sniper": {
      const camo = mat("#3f6212", { roughness: 0.5 });
      add(new THREE.BoxGeometry(0.09, 0.12, 0.7), camo, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.8, 10), dark, 0, 0.02, -0.7, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 14), dark, 0, 0.12, -0.05, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), mat("#60a5fa", { emissive: "#1d4ed8", emissiveIntensity: 0.6 }), 0, 0.12, -0.22, Math.PI / 2);
      add(new THREE.BoxGeometry(0.08, 0.17, 0.3), camo, 0, -0.04, 0.45);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.07), dark, 0, -0.12, 0.1, 0.3);
      break;
    }
    case "shotgun": {
      const wood = mat("#7c2d12", { roughness: 0.6 });
      add(new THREE.BoxGeometry(0.1, 0.12, 0.45), wood, 0, -0.02, 0.1);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12), dark, -0.035, 0.03, -0.35, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 12), dark, 0.035, 0.03, -0.35, Math.PI / 2);
      add(new THREE.BoxGeometry(0.11, 0.08, 0.18), wood, 0, -0.04, -0.3);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.07), dark, 0, -0.12, 0.12, 0.3);
      break;
    }
    case "smg": {
      const purple = toy("#6d28d9");
      add(new THREE.BoxGeometry(0.09, 0.13, 0.38), purple, 0, 0, 0);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10), dark, 0, 0.02, -0.28, Math.PI / 2);
      add(new THREE.BoxGeometry(0.05, 0.25, 0.06), dark, 0, -0.17, -0.05, 0.15);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.07), dark, 0, -0.12, 0.12, 0.3);
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 0.6) }), 0, 0.08, -0.1);
      break;
    }
    case "minigun": {
      const yellow = toy("#ca8a04");
      add(new THREE.BoxGeometry(0.2, 0.2, 0.4), yellow, 0, -0.05, 0.1);
      const spin = new THREE.Group();
      spin.name = "spin";
      spin.position.set(0, -0.03, -0.35);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 8), dark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0);
        spin.add(barrel);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 6, 16), yellow);
      ring.position.z = -0.25;
      spin.add(ring);
      g.add(spin);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.07), dark, 0, -0.18, 0.15, 0.3);
      break;
    }
    case "rocket": {
      const green = toy("#4d7c0f");
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 16), green, 0, 0.02, -0.15, Math.PI / 2);
      add(new THREE.ConeGeometry(0.09, 0.2, 14), mat("#dc2626"), 0, 0.02, -0.68, -Math.PI / 2);
      add(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16), dark, 0, 0.02, 0.3, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.14, 0.07), dark, 0, -0.14, 0, 0.3);
      add(new THREE.BoxGeometry(0.04, 0.08, 0.12), dark, 0, 0.14, -0.1);
      break;
    }
    case "bow": {
      const woodB = toy("#92400e");
      const bow = new THREE.Group();
      bow.rotation.y = Math.PI / 2;
      const limb = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.02, 8, 24, Math.PI * 0.9), woodB);
      limb.rotation.z = -Math.PI * 0.45;
      bow.add(limb);
      g.add(bow);
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 4), mat("#f5f5f4"), 0, 0, -0.06);
      add(new THREE.BoxGeometry(0.05, 0.12, 0.05), dark, 0, 0, -0.38);
      const arrow = new THREE.Group();
      arrow.name = "arrow";
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 6), mat("#d6b98c"));
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.41;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 8), mat("#9ca3af", { metalness: 0.8 }));
      tip.rotation.x = -Math.PI / 2;
      tip.position.z = -0.8;
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.06, 0.1), mat("#ef4444"));
      fletch.position.z = -0.12;
      arrow.add(shaft, tip, fletch);
      g.add(arrow);
      break;
    }
    case "raygun": {
      const body = toy("#0e7490");
      add(new THREE.SphereGeometry(0.11, 16, 12), body, 0, 0, 0.02);
      add(new THREE.CylinderGeometry(0.06, 0.045, 0.35, 14), body, 0, 0, -0.2, Math.PI / 2);
      const chrome = toy("#e5e7eb", { metalness: 0.8, roughness: 0.2 });
      for (const z of [-0.12, -0.22, -0.32]) add(new THREE.TorusGeometry(0.075, 0.015, 8, 18), chrome, 0, 0, z);
      add(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.5, 5) }), 0, 0, -0.4);
      add(new THREE.BoxGeometry(0.06, 0.16, 0.07), dark, 0, -0.14, 0.06, 0.3);
      add(new THREE.SphereGeometry(0.035, 10, 8), mat("#ef4444"), 0, 0.12, 0.02);
      break;
    }
    case "apple": {
      add(new THREE.SphereGeometry(0.12, 18, 14), toy("#dc2626"), 0, 0, -0.05);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), mat("#713f12"), 0, 0.14, -0.05);
      add(new THREE.SphereGeometry(0.035, 8, 6), mat("#16a34a"), 0.03, 0.15, -0.05);
      break;
    }
    case "bandage": {
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 18), mat("#f5f5f4", { roughness: 0.9 }), 0, 0, -0.05, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.081, 0.081, 0.03, 18), mat("#dc2626"), 0, 0, -0.05, 0, Math.PI / 2);
      break;
    }
    case "fish": {
      const fishMat = toy("#f97316");
      const body = add(new THREE.SphereGeometry(0.12, 16, 12), fishMat, 0, 0, -0.08);
      body.scale.set(0.6, 1, 1.6);
      add(new THREE.ConeGeometry(0.08, 0.14, 4), fishMat, 0, 0, 0.17, Math.PI / 2);
      add(new THREE.SphereGeometry(0.025, 8, 6), mat("#ffffff"), 0.06, 0.04, -0.2);
      break;
    }
    case "pizza": {
      add(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16, 1, false, -0.4, 0.8), mat("#fbbf24"), 0, 0, 0.05, 0.6);
      for (const [px, pz] of [[0, -0.1], [0.04, -0.17], [-0.04, -0.15]])
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.035, 10), mat("#b91c1c"), px, 0.01 + pz * -0.6, 0.05 + pz, 0.6);
      break;
    }
    case "icecream": {
      add(new THREE.ConeGeometry(0.07, 0.22, 14), mat("#d97706"), 0, -0.06, -0.05, Math.PI);
      add(new THREE.SphereGeometry(0.085, 14, 10), toy("#2dd4bf", { emissive: "#0f766e", emissiveIntensity: 0.4 }), 0, 0.07, -0.05);
      add(new THREE.SphereGeometry(0.06, 12, 8), toy("#f0abfc"), 0, 0.15, -0.05);
      break;
    }
    case "shieldpotion": {
      const glass = new THREE.MeshPhysicalMaterial({ color: "#bfdbfe", transmission: 0.6, roughness: 0.05, transparent: true, opacity: 0.6 });
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.22, 18), glass, 0, 0, -0.05);
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 3) }), 0, -0.02, -0.05);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), glass, 0, 0.15, -0.05);
      add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), mat("#1e3a8a"), 0, 0.2, -0.05);
      break;
    }
    case "minishield": {
      const glass = new THREE.MeshPhysicalMaterial({ color: "#bfdbfe", transmission: 0.6, roughness: 0.05, transparent: true, opacity: 0.6 });
      add(new THREE.SphereGeometry(0.08, 16, 12), glass, 0, 0, -0.05);
      add(new THREE.SphereGeometry(0.065, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 3) }), 0, -0.01, -0.05);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 10), mat("#e5e7eb"), 0, 0.1, -0.05);
      break;
    }
    case "medkit": {
      add(new THREE.BoxGeometry(0.34, 0.24, 0.12), mat("#f8fafc"), 0, 0.02, -0.05);
      const red = mat("#dc2626", { emissive: "#7f1d1d", emissiveIntensity: 0.4 });
      add(new THREE.BoxGeometry(0.2, 0.06, 0.02), red, 0, 0.02, -0.115);
      add(new THREE.BoxGeometry(0.06, 0.2, 0.02), red, 0, 0.02, -0.115);
      break;
    }
    case "bridge": {
      for (let i = 0; i < 4; i++)
        add(new THREE.BoxGeometry(0.42, 0.05, 0.12), mat(i % 2 ? "#a0522d" : "#8b4513"), 0, i * 0.055 - 0.05, -0.05, 0, 0.05 * (i - 1.5));
      break;
    }
    case "mushroom": {
      add(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 12), mat("#fef3c7"), 0, -0.04, -0.05);
      add(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat("#22c55e", { emissive: "#14532d", emissiveIntensity: 0.4 }), 0, 0.03, -0.05);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(new THREE.SphereGeometry(0.03, 8, 6), mat("#ffffff"), Math.sin(a) * 0.1, 0.12, -0.05 + Math.cos(a) * 0.1);
      }
      break;
    }
    case "bomb": {
      add(new THREE.SphereGeometry(0.13, 18, 14), mat("#111827", { metalness: 0.3, roughness: 0.3 }), 0, 0, -0.05);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), mat("#a8a29e"), 0.04, 0.14, -0.05, 0, -0.4);
      add(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: "#fde047" }), 0.07, 0.19, -0.05);
      break;
    }
  }
  return g;
}

function buildBridgeMesh(woods: THREE.Material[], rope: THREE.Material, post: THREE.Material) {
  const g = new THREE.Group();
  const n = 18;
  const step = BRIDGE_LEN / n;
  const plank = new THREE.BoxGeometry(BRIDGE_W, 0.14, step * 0.9);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(plank, woods[i % woods.length]);
    m.position.set(0, -0.07, -(i + 0.5) * step);
    m.rotation.y = rand(-0.03, 0.03);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const railGeo = new THREE.BoxGeometry(0.05, 0.05, BRIDGE_LEN);
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, rope);
    rail.position.set((s * BRIDGE_W) / 2, 0.85, -BRIDGE_LEN / 2);
    g.add(rail);
    for (const z of [0, -BRIDGE_LEN / 2, -BRIDGE_LEN]) {
      const p = new THREE.Mesh(postGeo, post);
      p.position.set((s * BRIDGE_W) / 2, 0.45, z);
      p.castShadow = true;
      g.add(p);
    }
  }
  return g;
}

// ---------- Partikel ----------
let dotTex: THREE.Texture | null = null;
function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  dotTex = canvasTex(c);
  return dotTex;
}
const MAXP = 2500;
class Particles {
  pos = new Float32Array(MAXP * 3);
  col = new Float32Array(MAXP * 3);
  vel = new Float32Array(MAXP * 3);
  base = new Float32Array(MAXP * 3);
  life = new Float32Array(MAXP);
  max = new Float32Array(MAXP);
  grav = new Float32Array(MAXP);
  count = 0;
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  private c = new THREE.Color();

  constructor() {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      this.geo,
      new THREE.PointsMaterial({
        size: 0.45,
        map: softDot(),
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: string, grav = 9) {
    if (this.count >= MAXP) return;
    const i = this.count++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.c.set(color);
    this.base.set([this.c.r, this.c.g, this.c.b], i * 3);
    this.life[i] = this.max[i] = life;
    this.grav[i] = grav;
  }

  burst(p: THREE.Vector3, color: string, n: number, speed = 4, life = 0.7, grav = 9) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * speed);
      this.spawn(p.x, p.y, p.z, v.x, v.y, v.z, life * rand(0.6, 1.2), color, grav);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.count;
        for (const arr of [this.pos, this.vel, this.base]) arr.copyWithin(i * 3, last * 3, last * 3 + 3);
        this.life[i] = this.life[last];
        this.max[i] = this.max[last];
        this.grav[i] = this.grav[last];
        i--;
        continue;
      }
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = this.life[i] / this.max[i];
      this.col[k] = this.base[k] * f;
      this.col[k + 1] = this.base[k + 1] * f;
      this.col[k + 2] = this.base[k + 2] * f;
    }
    this.geo.setDrawRange(0, this.count);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------- Die Engine ----------
export class Engine {
  private container: HTMLElement;
  private onHud: (h: HudState) => void;
  private onEnd: (r: Result) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  private arena = new THREE.Group();
  private lava: THREE.Mesh;
  private lavaTime = { value: 0 };
  private lavaU = { value: 2 };
  private dayU = { value: 0 };
  private glowU = { value: 1 };
  private fogColorU = { value: new THREE.Color("#2a0f22") };
  private fogDensU = { value: 0.0065 };
  private nightGroup = new THREE.Group();
  private dayGroup = new THREE.Group();
  private hemi!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private bloom!: UnrealBloomPass;
  private marble!: THREE.Texture;
  private day = false;
  private thirdPerson = false;
  private islands: { m: THREE.Object3D; y: number; p: number }[] = [];
  private birds: { g: THREE.Group; wings: THREE.Mesh[]; r: number; a: number; y: number; sp: number }[] = [];
  private preview = false;
  private mode: GameMode = "classic";
  private rules: Rules = { ...DEFAULT_RULES };
  private flat = false;
  private grid = new Map<number, Pillar[]>();
  private rivers: { pts: { x: number; z: number }[]; w: number }[] = [];
  private pads: { x: number; z: number }[] = [];
  private fires: THREE.Vector3[] = [];
  private teamSize = 1;
  private real = false;
  private oceanU = { value: 0 };
  private skyMesh!: THREE.Mesh;
  private realSky!: Sky;
  private rockSet: THREE.Material[] | null = null;
  private lightDir = MOON_DIR.clone();
  private storm = { x: 0, z: 0, r: 999, fx: 0, fz: 0, fr: 999, tx: 0, tz: 0, tr: 999, t0: 0, dur: 0, nextAt: 35 };
  private stormMesh!: THREE.Mesh;
  private mini!: HTMLCanvasElement;
  private miniTimer = 0;
  private sfx = new Sfx();
  private banner = { text: "", t: -9 };
  private streak = { n: 0, t: -9 };
  private chest: { mesh: THREE.Group; balloon: THREE.Object3D; pos: THREE.Vector3; landed: boolean; top: number; life: number } | null = null;
  private nextChest = 15;
  private skyTime = { value: 0 };
  private rocks: { m: THREE.Mesh; s: number; y: number }[] = [];
  private composer!: EffectComposer;
  private high = true;
  private diff: DiffCfg = DIFF.easy;
  private lavaLight: THREE.PointLight;
  private flash: THREE.PointLight;
  private particles = new Particles();
  private brick: THREE.Texture;
  private woods = [mat("#8b4513"), mat("#a0522d"), mat("#7c3f12")];
  private ropeMat = mat("#d6b98c");
  private postMat = mat("#5b2e0d");
  private tracerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true);
  private viewModels: Record<string, THREE.Group> = {};
  private vmRoot = new THREE.Group();

  private pillars: Pillar[] = [];
  private bridges: Bridge[] = [];
  private bombs: Bomb[] = [];
  private projectiles: Proj[] = [];
  private dtNow = 0;
  private tracers: Tracer[] = [];
  private floaters: Floater[] = [];
  private fighters: Fighter[] = [];
  private feed: { text: string; t: number }[] = [];

  private raf = 0;
  private lastFrame = performance.now();
  private time = 0;
  private playing = false;
  private locked = false;
  private nextItem = 0;
  private lavaY = 2;
  private endTimer = -1;
  private ringR = 14;
  private orbit = 0;
  private hudTimer = 1;
  private hitTime = 9;
  private headshot = false;
  private hurt = 0;
  private shake = 0;
  private recoil = 0;
  private bob = 0;
  private zoom = false;

  private keys = new Set<string>();
  private fireHeld = false;
  private firePressed = false;
  private jumpPressed = false;

  constructor(container: HTMLElement, onHud: (h: HudState) => void, onEnd: (r: Result) => void) {
    this.container = container;
    this.onHud = onHud;
    this.onEnd = onEnd;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = "block";
    container.appendChild(this.renderer.domElement);

    this.brick = brickTexture();
    this.marble = marbleTexture();
    const night = this.nightGroup;
    const day = this.dayGroup;
    this.scene.add(night, day);

    // Himmel
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(950, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTime: this.skyTime, uDay: this.dayU },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform float uDay; varying vec3 vP;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y); }
          float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
          void main(){
          vec3 dir = normalize(vP);
          float h = dir.y;
          vec3 top = vec3(0.03,0.02,0.10);
          vec3 mid = vec3(0.22,0.06,0.22);
          vec3 low = vec3(0.85,0.30,0.08);
          vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.5, h)) : mix(mid, low, smoothstep(0.0, -0.25, h));
          c = mix(c, low, smoothstep(0.12, 0.0, abs(h)) * 0.6);
          vec2 q = dir.xz / (abs(h) + 0.35);
          float neb = fbm(q * 1.6 + vec2(uTime*0.004, 0.0));
          c += vec3(0.45,0.10,0.50) * smoothstep(0.5, 0.85, neb) * smoothstep(0.02, 0.45, h) * 0.9;
          float neb2 = fbm(q * 2.7 + 7.0 - vec2(0.0, uTime*0.003));
          c += vec3(0.10,0.25,0.55) * smoothstep(0.55, 0.9, neb2) * smoothstep(0.1, 0.6, h) * 0.6;
          c += vec3(1.3,0.35,0.05) * exp(-abs(h)*16.0) * 0.7;
          vec3 dTop = vec3(0.03,0.28,0.92);
          vec3 dHor = vec3(0.55,0.80,1.0);
          vec3 dd = h > 0.0 ? mix(dHor, dTop, smoothstep(0.0, 0.6, h)) : vec3(0.85,0.93,1.0);
          float cl = fbm(q * 1.1 + vec2(uTime*0.006, 0.0));
          dd = mix(dd, vec3(1.0), smoothstep(0.56, 0.8, cl) * smoothstep(0.05, 0.4, h) * 0.7);
          float sunD = max(dot(dir, normalize(vec3(-0.4,0.75,-0.55))), 0.0);
          dd += vec3(1.0,0.9,0.7) * pow(sunD, 8.0) * 0.25;
          c = mix(c, dd, uDay);
          gl_FragColor = vec4(c, 1.0);
        }`,
      }),
    );
    this.scene.add(sky);
    this.skyMesh = sky;
    this.realSky = new Sky();
    this.realSky.scale.setScalar(900);
    const su = this.realSky.material.uniforms;
    su.turbidity.value = 4;
    su.rayleigh.value = 1.2;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.85;
    su.sunPosition.value.copy(SUN_DIR);
    this.realSky.visible = false;
    this.scene.add(this.realSky);
    this.stormMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 220, 64, 1, true),
      new THREE.MeshBasicMaterial({ color: "#a855f7", transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.stormMesh.visible = false;
    this.scene.add(this.stormMesh);
    this.mini = document.createElement("canvas");
    this.mini.width = this.mini.height = 180;
    Object.assign(this.mini.style, {
      position: "absolute",
      left: "16px",
      top: "72px",
      width: "180px",
      height: "180px",
      display: "none",
      pointerEvents: "none",
    });
    container.appendChild(this.mini);

    // Sterne
    const starPos: number[] = [];
    for (let i = 0; i < 1200; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.08, 1), rand(-1, 1)).normalize().multiplyScalar(800);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    night.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, fog: false, map: softDot(), transparent: true, depthWrite: false })));

    // Mond
    const moonDir = MOON_DIR;
    const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.65, 1.3), fog: false }));
    moon.position.copy(moonDir).multiplyScalar(700);
    night.add(moon);
    const glowC = document.createElement("canvas");
    glowC.width = glowC.height = 128;
    const gx = glowC.getContext("2d")!;
    const gg = gx.createRadialGradient(64, 64, 10, 64, 64, 64);
    gg.addColorStop(0, "rgba(254,243,199,0.6)");
    gg.addColorStop(1, "rgba(254,243,199,0)");
    gx.fillStyle = gg;
    gx.fillRect(0, 0, 128, 128);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(glowC), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    moonGlow.scale.set(220, 220, 1);
    moonGlow.position.copy(moon.position);
    night.add(moonGlow);

    // Berge (Vulkane) rundherum
    const rockMat = mat("#1c1017", { flatShading: true, roughness: 0.9 });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rand(-0.05, 0.05);
      const r = rand(150, 260);
      const h = rand(35, 110);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rand(25, 55), h, 7), rockMat);
      m.position.set(Math.sin(a) * r, h / 2 - 8, Math.cos(a) * r);
      m.rotation.y = rand(0, 3);
      night.add(m);
      if (Math.random() < 0.35) {
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(rand(3, 6), 12, 8),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.1, 0.15), fog: false }),
        );
        glow.position.set(m.position.x, h - 9, m.position.z);
        glow.scale.y = 0.4;
        night.add(glow);
      }
    }

    // Sonne und Wolken (Himmels-Thema)
    const sun = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2), fog: false }));
    sun.position.copy(SUN_DIR).multiplyScalar(700);
    day.add(sun);
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.55 });
    for (let i = 0; i < 46; i++) {
      const cl = makeCloud(cloudMat);
      const a = rand(0, Math.PI * 2);
      const r = rand(75, 320);
      cl.position.set(Math.sin(a) * r, rand(-6, 70), Math.cos(a) * r);
      cl.rotation.y = rand(0, Math.PI);
      cl.scale.setScalar(rand(0.8, 2.2));
      day.add(cl);
    }
    const rainbow = ["#ff4d4d", "#ff9f40", "#ffe14d", "#5ee35e", "#4db8ff", "#6c63ff", "#c264ff"];
    rainbow.forEach((c, i) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(260 - i * 7, 3.5, 6, 90, Math.PI),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, fog: false, depthWrite: false }),
      );
      arc.position.set(160, -40, -540);
      arc.rotation.y = -0.3;
      day.add(arc);
    });
    const birdMat = new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.8 });
    const wingGeo = new THREE.BoxGeometry(0.9, 0.05, 0.35);
    wingGeo.translate(0.45, 0, 0);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), birdMat);
      body.scale.set(1, 0.8, 1.8);
      const w1 = new THREE.Mesh(wingGeo, birdMat);
      const w2 = new THREE.Mesh(wingGeo, birdMat);
      w2.scale.x = -1;
      g.add(body, w1, w2);
      g.scale.setScalar(rand(1, 1.8));
      day.add(g);
      this.birds.push({ g, wings: [w1, w2], r: rand(45, 110), a: rand(0, Math.PI * 2), y: rand(22, 45), sp: rand(0.08, 0.16) * (Math.random() < 0.5 ? 1 : -1) });
    }

    // Lava
    this.lava = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400, 160, 160),
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.lavaTime, uFog: this.fogColorU, uFogDensity: this.fogDensU, uDay: this.dayU, uOcean: this.oceanU },
        vertexShader: `uniform float uTime; uniform float uOcean; varying vec3 vW;
          void main(){
            vec4 w = modelMatrix * vec4(position, 1.0);
            w.y += (sin(w.x*0.3 + uTime*1.2) + sin(w.z*0.25 + uTime*0.9)) * (0.12 + uOcean*0.3);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: `uniform float uTime; uniform vec3 uFog; uniform float uFogDensity; uniform float uDay; uniform float uOcean; varying vec3 vW;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y); }
          float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
          void main(){
            vec2 p = vW.xz * 0.08;
            vec2 flow = vec2(uTime*0.03, uTime*0.02);
            float n = fbm(p + fbm(p*0.5 + flow)*1.6 - flow);
            float crust = smoothstep(0.44, 0.56, n);
            vec3 hot = mix(vec3(1.2,0.25,0.04), vec3(2.0,0.85,0.15), smoothstep(0.25, 0.45, n));
            vec3 col = mix(hot, vec3(0.10,0.02,0.01), crust);
            float cracks = 1.0 - smoothstep(0.0, 0.03, abs(n - 0.58));
            col += vec3(1.1,0.25,0.03) * cracks * crust;
            col *= 0.85 + 0.15*sin(uTime*2.0 + n*12.0);
            vec2 cp = vW.xz * 0.03 + vec2(uTime*0.012, uTime*0.005);
            float cn = fbm(cp + fbm(cp*0.7 - uTime*0.004)*0.9);
            vec3 cloud = mix(vec3(0.45,0.65,0.95), vec3(1.05,1.05,1.1), smoothstep(0.3, 0.68, cn));
            col = mix(col, cloud, uDay);
            if (uOcean > 0.5) {
              vec2 op = vW.xz * 0.12;
              vec2 fl = vec2(uTime*0.05, uTime*0.03);
              float h0 = fbm(op + fl);
              float hx = fbm(op + vec2(0.04,0.0) + fl) - h0;
              float hz = fbm(op + vec2(0.0,0.04) + fl) - h0;
              vec3 nrm = normalize(vec3(-hx*9.0, 1.0, -hz*9.0));
              vec3 V = normalize(cameraPosition - vW);
              float fres = pow(1.0 - max(dot(nrm, V), 0.0), 4.0);
              vec3 Ld = normalize(vec3(-0.4,0.75,-0.55));
              float spec = pow(max(dot(nrm, normalize(Ld + V)), 0.0), 180.0) * 5.0;
              vec3 ocean = mix(vec3(0.01,0.07,0.13), vec3(0.5,0.66,0.8), 0.12 + 0.88*fres) + vec3(1.0,0.95,0.85)*spec;
              ocean += vec3(0.7) * smoothstep(0.66, 0.78, fbm(op*2.5 - fl*1.7)) * 0.25;
              col = ocean;
            }
            float d = length(vW - cameraPosition);
            float fogF = 1.0 - exp(-pow(uFogDensity*d, 2.0));
            gl_FragColor = vec4(mix(col, uFog, fogF), 1.0);
          }`,
      }),
    );
    this.lava.rotation.x = -Math.PI / 2;
    this.scene.add(this.lava);

    // Licht
    this.scene.fog = new THREE.FogExp2("#2a0f22", 0.0065);
    this.hemi = new THREE.HemisphereLight("#8b7cff", "#ff5a00", 0.9);
    this.scene.add(this.hemi);
    const moonLight = new THREE.DirectionalLight("#c7d2fe", 1.6);
    moonLight.position.copy(moonDir).multiplyScalar(120);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    const sc = moonLight.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 10;
    sc.far = 300;
    moonLight.shadow.bias = -0.0005;
    moonLight.shadow.normalBias = 0.04;
    this.scene.add(moonLight, moonLight.target);
    this.sunLight = moonLight;
    this.lavaLight = new THREE.PointLight("#ff6a1a", 1.3, 0, 0);
    this.scene.add(this.lavaLight);
    this.flash = new THREE.PointLight("#ffb366", 0, 30, 1);
    this.scene.add(this.flash);

    this.scene.add(this.arena, this.particles.points);

    // Hand-Gegenstände
    for (const k of [...ITEM_KINDS, "none"]) {
      const vm = buildViewModel(k === "none" ? null : (k as ItemKind));
      vm.visible = false;
      this.viewModels[k] = vm;
      this.vmRoot.add(vm);
    }
    this.vmRoot.scale.setScalar(0.55);
    this.camera.add(this.vmRoot);
    this.scene.add(this.camera);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.buildArena(8);
    this.resize();

    window.addEventListener("resize", this.resize);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------- öffentliche Funktionen ----------
  start(
    players: number,
    difficulty: Difficulty = "easy",
    mode: GameMode = "classic",
    teamSize = 1,
    opts: { flat?: boolean; rules?: Partial<Rules> } = {},
  ) {
    this.diff = DIFF[difficulty];
    this.mode = mode;
    this.teamSize = teamSize;
    this.flat = !!opts.flat;
    this.rules = { ...DEFAULT_RULES, ...(opts.rules ?? {}) };
    this.lava.visible = !this.flat;
    this.buildArena(players);
    for (const f of this.fighters) {
      f.slots = [0, 1, 2, 3, 4].map((i) => {
        const k = this.rules.start[i];
        return k ? { kind: k, uses: ITEMS[k].uses } : null;
      });
    }
    this.storm = { x: 0, z: 0, r: this.ringR + 14, fx: 0, fz: 0, fr: 0, tx: 0, tz: 0, tr: 0, t0: 0, dur: 0, nextAt: 40 };
    this.stormMesh.visible = mode === "br";
    if (mode === "br") this.showBanner("🪂 Lenke mit W A S D zu einer Säule!");
    const freeSlot = this.fighters[0].slots.findIndex((s) => s === null);
    if (this.diff.startMed && !this.rules.noHeal && freeSlot >= 0) this.fighters[0].slots[freeSlot] = { kind: "medkit", uses: 1 };
    this.nextChest = this.rules.chestEvery ? 5 : 15;
    if (this.rules.fog) {
      const fog = this.scene.fog as THREE.FogExp2;
      fog.density = this.rules.fog;
      this.fogDensU.value = this.rules.fog;
    }
    this.playing = true;
    this.time = 0;
    this.nextItem = 2;
    this.lavaY = this.flat ? -50 : 2;
    this.endTimer = -1;
    this.feed = [];
    this.hurt = 0;
    this.zoom = false;
  }

  setTheme(theme: Theme | boolean) {
    if (typeof theme === "boolean") theme = theme ? "sky" : "night";
    const day = theme !== "night";
    const real = theme === "real";
    this.real = real;
    this.day = day;
    this.oceanU.value = real ? 1 : 0;
    this.skyMesh.visible = !real;
    this.realSky.visible = real;
    this.lightDir.copy(day ? SUN_DIR : MOON_DIR);
    this.dayU.value = day ? 1 : 0;
    this.glowU.value = day ? 0 : 1;
    this.nightGroup.visible = !day;
    this.dayGroup.visible = day && !real;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(day ? "#a8d2ff" : "#2a0f22");
    fog.density = day ? 0.0017 : 0.0065;
    this.fogColorU.value.copy(fog.color);
    this.fogDensU.value = fog.density;
    this.hemi.color.set(day ? "#cfe8ff" : "#8b7cff");
    this.hemi.groundColor.set(day ? "#e6f5c8" : "#ff5a00");
    this.hemi.intensity = day ? 1.0 : 0.9;
    this.sunLight.color.set(day ? "#fff7e0" : "#c7d2fe");
    this.sunLight.intensity = day ? 3.4 : 1.6;
    this.sunLight.position.copy(day ? SUN_DIR : MOON_DIR).multiplyScalar(120);
    this.lavaLight.intensity = day ? 0 : 1.3;
    this.bloom.strength = day ? 0.15 : 0.8;
    this.bloom.threshold = day ? 1.2 : 0.9;
    this.renderer.toneMappingExposure = day ? 1.0 : 1.1;
    this.renderer.toneMapping = day ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    if (real) {
      fog.color.set("#b9cde0");
      fog.density = 0.0016;
      this.fogColorU.value.copy(fog.color);
      this.fogDensU.value = fog.density;
      this.hemi.color.set("#c4d8ee");
      this.hemi.groundColor.set("#4b5a3c");
      this.hemi.intensity = 0.8;
      this.sunLight.color.set("#fff0d6");
      this.sunLight.intensity = 6.5;
      this.bloom.strength = 0.08;
      this.bloom.threshold = 2;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.5;
    }
    if (!this.playing) this.buildArena(this.fighters.length || 8);
  }

  // Vorschau-Modus für Screenshots: Spiel läuft auch ohne Mausfang
  setPreview(on: boolean) {
    this.preview = on;
  }

  setThirdPerson(on: boolean) {
    this.thirdPerson = on;
  }

  setQuality(high: boolean) {
    this.high = high;
    this.renderer.shadowMap.enabled = high;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.needsUpdate = true;
      }
    });
  }

  lock() {
    this.sfx.ensure();
    const el = this.renderer.domElement;
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* Browser erlaubt es gerade nicht */
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.mini.remove();
  }

  // ---------- Eingaben ----------
  private resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      this.composer.setSize(w, h);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (!this.locked) {
      this.fireHeld = false;
      this.zoom = false;
      this.keys.clear();
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    const me = this.fighters[0];
    if (!me?.alive) return;
    const s = this.zoom ? 0.0007 : 0.0022;
    me.yaw -= e.movementX * s;
    me.pitch = clamp(me.pitch - e.movementY * s, -1.5, 1.5);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) {
      this.fireHeld = true;
      this.firePressed = true;
    } else if (e.button === 2) {
      const s = this.fighters[0]?.slots[this.fighters[0].sel];
      if (s?.kind === "sniper") this.zoom = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.zoom = false;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    const me = this.fighters[0];
    if (!me) return;
    me.sel = (me.sel + (e.deltaY > 0 ? 1 : -1) + SLOTS) % SLOTS;
    this.zoom = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return;
    this.keys.add(e.code);
    if (e.code === "Space") {
      if (!e.repeat) this.jumpPressed = true;
      e.preventDefault();
    }
    if (e.code === "KeyV" && !e.repeat) this.thirdPerson = !this.thirdPerson;
    if (e.code === "KeyM" && !e.repeat) this.sfx.muted = !this.sfx.muted;
    if (e.code === "KeyB" && !e.repeat && this.fighters[0]?.alive) this.fighters[0].dance = 2;
    const m = e.code.match(/^Digit([1-5])$/);
    if (m && this.fighters[0]) {
      this.fighters[0].sel = Number(m[1]) - 1;
      this.zoom = false;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  // ---------- Arena bauen ----------
  private rockMats() {
    if (!this.rockSet) {
      const { map, normal } = rockTextures();
      this.rockSet = ["#c9bcad", "#b3a79a", "#bfb3a0"].map(
        (c) => new THREE.MeshStandardMaterial({ map, normalMap: normal, color: c, roughness: 0.95 }),
      );
    }
    return this.rockSet;
  }

  private buildArena(players: number) {
    for (const f of this.fighters) {
      this.scene.remove(f.label);
      f.labelTex.dispose();
    }
    for (const b of this.bombs) this.scene.remove(b.mesh);
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const fl of this.floaters) this.scene.remove(fl.sprite);
    this.arena.clear();
    this.bridges = [];
    this.bombs = [];
    this.projectiles = [];
    this.removeChest();
    this.nextChest = 15;
    this.streak = { n: 0, t: -9 };
    this.tracers = [];
    this.floaters = [];
    this.pillars = [];

    const n = players;
    const br = this.mode === "br" && n > 8;
    const flat = this.flat;
    this.rivers = [];
    this.pads = [];
    this.fires = [];
    let R: number;
    if (flat) {
      R = this.buildFlat();
    } else if (br) {
      // Große Karte: Säulen im Wabenmuster, manche Lücken kann man springen
      const sp = 9;
      const k = 10;
      for (let q = -k; q <= k; q++)
        for (let r = -k; r <= k; r++) {
          if (Math.abs(-q - r) > k) continue;
          if ((q !== 0 || r !== 0) && Math.random() < 0.12) continue;
          this.pillars.push({
            x: sp * (q + r / 2) + rand(-1.2, 1.2),
            z: sp * ((r * Math.sqrt(3)) / 2) + rand(-1.2, 1.2),
            r: rand(2.3, 3.6),
            top: rand(14, 22),
          });
        }
      R = sp * k;
    } else {
      R = 11 / (2 * Math.sin(Math.PI / n));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.pillars.push({ x: Math.sin(a) * R, z: Math.cos(a) * R, r: PILLAR_R, top: rand(16, 20) });
      }
      if (n >= 6) this.pillars.push({ x: 0, z: 0, r: 3.0, top: 14.5 });
    }
    this.ringR = R;

    const day = this.day;
    const real = this.real;
    const stone = new THREE.MeshStandardMaterial({ map: this.brick, bumpMap: this.brick, bumpScale: 3, roughness: 0.85 });
    const lavaU = this.lavaU;
    const glowU = this.glowU;
    stone.onBeforeCompile = (sh) => {
      sh.uniforms.uLavaY = lavaU;
      sh.uniforms.uGlow = glowU;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vWY;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vWY;\nuniform float uLavaY;\nuniform float uGlow;")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlow * vec3(0.8, 0.22, 0.04) * exp(-max(vWY - uLavaY, 0.0) * 0.45);",
        );
    };
    const seg = br ? 20 : 32;
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, seg);
    const capGeo = new THREE.CylinderGeometry(1, 0.96, 0.5, seg);
    const rimGeo = new THREE.TorusGeometry(1, 0.045, 6, seg + 8);
    const palette = PILLAR_COLORS.map((c) => new THREE.MeshStandardMaterial({ map: this.marble, color: c, roughness: 0.35 }));
    const rock = real ? this.rockMats() : null;
    const capMat = mat("#a8a29e", { roughness: 0.8 });
    const dayCap = real ? new THREE.MeshStandardMaterial({ color: "#5a7434", roughness: 1 }) : toy("#a3e635");
    const dayRim = toy("#fde047");
    const grassGeo = new THREE.ConeGeometry(0.035, 0.28, 3);
    grassGeo.translate(0, 0.14, 0);
    const grassMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
    const flowerGeo = new THREE.IcosahedronGeometry(0.05, 1);
    const flowerMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5, emissive: "#222222" });
    const FLOWERS = real ? ["#ffffff", "#fde047", "#f5f5f4"] : ["#f472b6", "#facc15", "#ffffff", "#c084fc", "#fb7185"];
    const crystal = new THREE.MeshStandardMaterial({ color: "#fb923c", emissive: "#f97316", emissiveIntensity: 3.5 });
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const ps = new THREE.Vector3();
    const c = new THREE.Color();
    this.pillars.forEach((p, pi) => {
      if (p.prop) return;
      const h = p.top + 10 - 0.35;
      const pillarMat = rock ? rock[pi % rock.length] : day ? palette[pi % palette.length] : stone;
      const col = new THREE.Mesh(colGeo, pillarMat);
      col.scale.set(p.r, h, p.r);
      col.position.set(p.x, p.top - 0.35 - h / 2, p.z);
      col.castShadow = col.receiveShadow = true;
      const cap = new THREE.Mesh(capGeo, day ? dayCap : capMat);
      cap.scale.set(p.r + 0.25, 1, p.r + 0.25);
      cap.position.set(p.x, p.top - 0.25, p.z);
      cap.castShadow = cap.receiveShadow = true;
      this.arena.add(col, cap);
      if (day) {
        if (!real) {
          const rim = new THREE.Mesh(rimGeo, dayRim);
          rim.scale.setScalar(p.r + 0.25);
          rim.rotation.x = Math.PI / 2;
          rim.position.set(p.x, p.top - 0.02, p.z);
          this.arena.add(rim);
        }
        const nG = Math.round(p.r * p.r * (br ? 22 : 70));
        const grass = new THREE.InstancedMesh(grassGeo, grassMat, nG);
        for (let k = 0; k < nG; k++) {
          const a = rand(0, Math.PI * 2);
          const rr = Math.sqrt(Math.random()) * (p.r + 0.1);
          ps.set(p.x + Math.sin(a) * rr, p.top, p.z + Math.cos(a) * rr);
          e.set(rand(-0.3, 0.3), rand(0, Math.PI), rand(-0.3, 0.3));
          q.setFromEuler(e);
          const s = rand(0.6, 1.3);
          sc.set(s, s * rand(0.7, 1.3), s);
          m4.compose(ps, q, sc);
          grass.setMatrixAt(k, m4);
          if (real) grass.setColorAt(k, c.setHSL(rand(0.2, 0.28), rand(0.35, 0.55), rand(0.2, 0.36)));
          else grass.setColorAt(k, c.setHSL(rand(0.22, 0.32), rand(0.55, 0.8), rand(0.35, 0.55)));
        }
        grass.receiveShadow = true;
        const nF = Math.round(p.r * (real ? 2 : 5));
        const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, nF);
        for (let k = 0; k < nF; k++) {
          const a = rand(0, Math.PI * 2);
          const rr = Math.sqrt(Math.random()) * p.r;
          ps.set(p.x + Math.sin(a) * rr, p.top + rand(0.2, 0.3), p.z + Math.cos(a) * rr);
          m4.compose(ps, q.identity(), sc.setScalar(rand(0.8, 1.3)));
          flowers.setMatrixAt(k, m4);
          flowers.setColorAt(k, c.set(FLOWERS[k % FLOWERS.length]));
        }
        grass.computeBoundingSphere();
        flowers.computeBoundingSphere();
        this.arena.add(grass, flowers);
      } else {
        for (let k = 0; k < 3; k++) {
          const a = rand(0, Math.PI * 2);
          const cr = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.2, 0.35)), crystal);
          cr.position.set(p.x + Math.sin(a) * p.r, rand(4, p.top - 3), p.z + Math.cos(a) * p.r);
          cr.rotation.set(rand(0, 3), rand(0, 3), 0);
          this.arena.add(cr);
        }
      }
    });

    this.rocks = [];
    const rockMat = mat(this.day ? "#e7e5e4" : "#3b2a2a", { flatShading: true, roughness: 0.9 });
    for (let i = 0; i < (this.day || flat ? 0 : 26); i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(R + 10, R + 45);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.6, 2.4)), rockMat);
      const y = rand(8, 34);
      m.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      m.castShadow = true;
      this.arena.add(m);
      this.rocks.push({ m, s: rand(0.1, 0.5), y });
    }
    this.islands = [];
    for (let i = 0; i < (this.day && !flat ? 14 : 0); i++) {
      const isl = makeIsland();
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15);
      const r = rand(R + 20, R + 70);
      const y = rand(6, 30);
      isl.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      isl.rotation.y = rand(0, Math.PI * 2);
      isl.scale.setScalar(rand(0.8, 1.7));
      this.arena.add(isl);
      this.islands.push({ m: isl, y, p: rand(0, 6) });
    }

    this.buildGrid();

    // Spieler verteilen: Teams stehen zusammen
    const ts = Math.max(1, this.teamSize);
    const spawnIdx = this.pillars.map((_, i) => i).sort(() => Math.random() - 0.5);
    const off = Math.floor(Math.random() * n);
    const flatSpawns = flat ? Array.from({ length: Math.ceil(n / ts) }, () => this.freeSpot(R * 0.85)) : [];
    this.fighters = Array.from({ length: n }, (_, i) => {
      const r = rosterEntry(i);
      const team = Math.floor(i / ts);
      const p = flat ? flatSpawns[team] : br ? this.pillars[spawnIdx[team % spawnIdx.length]] : this.pillars[(i + off) % n];
      const { group, feet, gun, details } = buildFighterMesh(r.color, r.hat);
      const chute = br ? makeChute(r.color) : null;
      if (chute) group.add(chute);
      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 256;
      labelCanvas.height = 72;
      const labelTex = canvasTex(labelCanvas);
      const mate = team === 0 && i !== 0;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthWrite: false, depthTest: !mate }));
      if (mate) label.renderOrder = 998;
      label.scale.set(1.9, 0.53, 1);
      const pos = br
        ? new THREE.Vector3(p.x + rand(-1.5, 1.5), p.top + (i === 0 ? 50 : rand(38, 60)), p.z + rand(-1.5, 1.5))
        : new THREE.Vector3(p.x + (flat ? rand(-2, 2) : 0), p.top, p.z + (flat ? rand(-2, 2) : 0));
      const f: Fighter = {
        id: i,
        name: r.name,
        color: r.color,
        bot: i !== 0,
        pos,
        vel: new THREE.Vector3(),
        yaw: br ? rand(0, Math.PI * 2) : Math.atan2(p.x, p.z),
        pitch: br ? -0.5 : -0.1,
        onGround: !br,
        alive: true,
        hp: 100,
        slots: [{ kind: "rifle", uses: ITEMS.rifle.uses }, null, null, null, null],
        sel: 0,
        cd: 0,
        stun: 0,
        place: 0,
        lastHitBy: null,
        lastHitT: -99,
        walk: 0,
        spin: 0,
        charge: 0,
        shield: 0,
        regenHp: 0,
        regenShield: 0,
        kills: 0,
        dance: 0,
        team,
        glide: br,
        chute,
        details,
        mesh: group,
        feet,
        gun,
        label,
        labelCanvas,
        labelTex,
        labelHp: -1,
        ai: {
          think: rand(0.5, 1.5),
          wishX: 0,
          wishZ: 0,
          aimYaw: 0,
          aimPitch: 0,
          fire: false,
          use: false,
          jump: false,
          forwardT: 0,
          strafeX: p.x,
          strafeZ: p.z,
          strafeT: 0,
          leapX: 0,
          leapZ: 0,
        },
      };
      f.ai.aimYaw = f.yaw;
      group.position.copy(f.pos);
      group.rotation.y = f.yaw;
      label.position.set(f.pos.x, f.pos.y + 2.35, f.pos.z);
      this.arena.add(group);
      if (f.bot) {
        this.scene.add(label);
        this.drawLabel(f);
      }
      return f;
    });
  }

  private cellKey(ix: number, iz: number) {
    return (ix + 2000) * 8192 + (iz + 2000);
  }

  // Alle Hindernisse in kleine Felder sortieren (6 x 6 Meter)
  private buildGrid() {
    this.grid.clear();
    for (const p of this.pillars) {
      const r = p.r + 1;
      for (let ix = Math.floor((p.x - r) / 6); ix <= Math.floor((p.x + r) / 6); ix++)
        for (let iz = Math.floor((p.z - r) / 6); iz <= Math.floor((p.z + r) / 6); iz++) {
          const k = this.cellKey(ix, iz);
          const list = this.grid.get(k);
          if (list) list.push(p);
          else this.grid.set(k, [p]);
        }
    }
  }

  // Hindernisse in der Nähe eines Punktes
  private near(x: number, z: number): Pillar[] {
    return this.grid.get(this.cellKey(Math.floor(x / 6), Math.floor(z / 6))) ?? [];
  }

  private floorY() {
    return this.flat ? 0 : this.lavaY;
  }

  private lavaActive() {
    return this.mode === "classic" && !this.flat && this.rules.lava && this.time > (this.rules.lavaStart ?? this.diff.lavaStart);
  }

  private inRiver(x: number, z: number) {
    for (const rv of this.rivers) {
      const pts = rv.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
        if (Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)) < rv.w / 2) return true;
      }
    }
    return false;
  }

  // Freier Platz auf der flachen Karte (nicht im Fluss, nicht in einem Baum)
  private freeSpot(maxR: number, near?: THREE.Vector3): Pillar {
    for (let tries = 0; tries < 40; tries++) {
      let x: number;
      let z: number;
      if (near) {
        x = near.x + rand(-25, 25);
        z = near.z + rand(-25, 25);
        if (Math.hypot(x, z) > maxR) continue;
      } else {
        const a = rand(0, Math.PI * 2);
        const r = Math.sqrt(Math.random()) * maxR;
        x = Math.sin(a) * r;
        z = Math.cos(a) * r;
      }
      if (this.inRiver(x, z)) continue;
      if (this.pillars.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1.5)) continue;
      return { x, z, r: 1, top: 0 };
    }
    return { x: rand(-5, 5), z: rand(-5, 5), r: 1, top: 0 };
  }

  private ribbon(pts: { x: number; z: number }[], w: number, y: number, m: THREE.Material) {
    const pos: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      pos.push(p.x - tz * (w / 2), y, p.z + tx * (w / 2), p.x + tz * (w / 2), y, p.z - tx * (w / 2));
      if (i > 0) {
        const k = i * 2;
        idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    this.arena.add(mesh);
    return mesh;
  }

  private buildFlat() {
    const R = 130;
    const day = this.day;
    const real = this.real;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const ps = new THREE.Vector3();
    const col = new THREE.Color();

    // Boden
    const size = 2 * R + 220;
    const geo = new THREE.PlaneGeometry(size, size, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const cols: number[] = [];
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i);
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.06) + Math.sin(x * 0.13 + z * 0.09) * 0.5 + Math.random() * 0.25;
      if (!day) col.setHSL(0.03, 0.25, 0.07 + n * 0.025);
      else if (real) col.setHSL(0.22 + n * 0.02, 0.38, 0.2 + n * 0.035);
      else col.setHSL(0.26 + n * 0.025, 0.6, 0.42 + n * 0.05);
      cols.push(col.r, col.g, col.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    this.arena.add(ground);

    // Flüsse
    const bank = new THREE.MeshStandardMaterial({ color: day ? (real ? "#8a7a5c" : "#e2cf94") : "#3a2a24", roughness: 1 });
    const water = day
      ? new THREE.MeshStandardMaterial({
          color: real ? "#24546d" : "#38a0e0",
          roughness: 0.06,
          metalness: 0.3,
          transparent: true,
          opacity: 0.88,
          emissive: real ? "#06202c" : "#0b4a70",
          emissiveIntensity: 0.4,
        })
      : new THREE.MeshStandardMaterial({ color: "#7f1d1d", emissive: "#ff5a00", emissiveIntensity: 1.8, roughness: 0.6 });
    for (let k = 0; k < 3; k++) {
      const a = [rand(0.1, 0.5), rand(1.6, 2.1), rand(0.8, 1.2)][k];
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const off = k === 2 ? rand(-60, 60) : rand(-30, 30);
      const ph = rand(0, 6);
      const pts: { x: number; z: number }[] = [];
      for (let t = -R - 100; t <= R + 100; t += 3) {
        const w = Math.sin(t * 0.045 + ph) * 13 + Math.sin(t * 0.12 + ph * 2) * 4;
        pts.push({ x: dx * t - dz * (off + w), z: dz * t + dx * (off + w) });
      }
      this.rivers.push({ pts, w: 6 });
      this.ribbon(pts, 9, 0.02, bank);
      this.ribbon(pts, 6, 0.07, water);
      // Holzbrücken über den Fluss (Deko)
      for (const bi of [0.22, 0.38, 0.5, 0.62, 0.78].map((v) => Math.floor(pts.length * v))) {
        const p = pts[bi];
        const nx = pts[bi + 1].x - p.x;
        const nz = pts[bi + 1].z - p.z;
        const br = new THREE.Group();
        for (let j = -5; j <= 5; j++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 2.2), this.woods[(j + 5) % 3]);
          plank.position.set(j * 0.55, 0.22, 0);
          plank.castShadow = plank.receiveShadow = true;
          br.add(plank);
        }
        br.position.set(p.x, 0, p.z);
        br.rotation.y = -Math.atan2(nz, nx) + Math.PI / 2;
        this.arena.add(br);
      }
    }

    // Bäume (Wälder)
    const trees: { x: number; z: number; s: number; pine: boolean }[] = [];
    const tryTree = (x: number, z: number) => {
      if (Math.hypot(x, z) > R + 30 || this.inRiver(x, z)) return;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 2.2)) return;
      trees.push({ x, z, s: rand(0.8, 1.5), pine: Math.random() < 0.55 });
    };
    for (let c = 0; c < 34; c++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(10, R + 10);
      const cx = Math.sin(a) * r;
      const cz = Math.cos(a) * r;
      const count = Math.floor(rand(25, 45));
      for (let i = 0; i < count; i++) tryTree(cx + (Math.random() - 0.5) * 30, cz + (Math.random() - 0.5) * 30);
    }
    for (let i = 0; i < 300; i++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * (R + 25);
      tryTree(Math.sin(a) * r, Math.cos(a) * r);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 7);
    trunkGeo.translate(0, 0.5, 0);
    const pineGeo = new THREE.ConeGeometry(1, 1, 8);
    pineGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: day ? "#6b4428" : "#2a1a14", roughness: 0.9 }), trees.length);
    const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: true }), trees.length * 2);
    const leafs = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: true }), trees.length);
    let np = 0;
    let nl = 0;
    trees.forEach((t, i) => {
      m4.compose(ps.set(t.x, 0, t.z), q.identity(), sc.set(t.s, 2.6 * t.s, t.s));
      trunks.setMatrixAt(i, m4);
      this.pillars.push({ x: t.x, z: t.z, r: 0.35 * t.s, top: 2.6 * t.s, prop: true });
      if (t.pine) {
        for (let k = 0; k < 2; k++) {
          const w = (k === 0 ? 1.9 : 1.35) * t.s;
          m4.compose(ps.set(t.x, (1.4 + k * 1.6) * t.s, t.z), q.setFromEuler(e.set(0, rand(0, 3), 0)), sc.set(w, 3.2 * t.s, w));
          pines.setMatrixAt(np, m4);
          if (!day) col.setHSL(0.02, 0.3, 0.12);
          else if (real) col.setHSL(rand(0.3, 0.36), 0.45, rand(0.14, 0.22));
          else col.setHSL(rand(0.33, 0.4), 0.55, rand(0.25, 0.33));
          pines.setColorAt(np++, col);
        }
      } else {
        const s = 1.9 * t.s;
        m4.compose(ps.set(t.x, 3.3 * t.s, t.z), q.setFromEuler(e.set(rand(0, 3), rand(0, 3), 0)), sc.set(s, s * 0.9, s));
        leafs.setMatrixAt(nl, m4);
        if (!day) col.setHSL(0.0, 0.5, 0.15);
        else if (real) col.setHSL(rand(0.2, 0.28), 0.45, rand(0.2, 0.3));
        else if (Math.random() < 0.12) col.set("#f9a8d4");
        else col.setHSL(rand(0.24, 0.32), 0.6, rand(0.32, 0.42));
        leafs.setColorAt(nl++, col);
      }
    });
    pines.count = np;
    leafs.count = nl;
    for (const im of [trunks, pines, leafs]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.arena.add(im);
    }

    // Felsen
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: day ? "#9ca3af" : "#44403c", roughness: 0.95, flatShading: true }), 260);
    for (let i = 0; i < 260; i++) {
      const p = this.freeSpot(R + 25);
      const s = rand(0.5, 2.2);
      m4.compose(ps.set(p.x, s * 0.3, p.z), q.setFromEuler(e.set(rand(0, 3), rand(0, 3), rand(0, 3))), sc.set(s * rand(0.8, 1.3), s * 0.8, s));
      rocks.setMatrixAt(i, m4);
      if (s > 0.7) this.pillars.push({ x: p.x, z: p.z, r: s * 0.85, top: s * 1.0, prop: true });
    }
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.computeBoundingSphere();
    this.arena.add(rocks);

    // Büsche, Blumen und hohes Gras
    const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9, flatShading: true }), 800);
    for (let i = 0; i < 800; i++) {
      const p = this.freeSpot(R + 30);
      const s = rand(0.5, 1.2);
      m4.compose(ps.set(p.x, s * 0.4, p.z), q.identity(), sc.set(s, s * 0.7, s));
      bushes.setMatrixAt(i, m4);
      bushes.setColorAt(i, day ? col.setHSL(rand(0.25, 0.35), real ? 0.4 : 0.55, rand(0.2, 0.32)) : col.setHSL(0.02, 0.3, 0.1));
    }
    const flowerN = day ? 2400 : 0;
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 }), Math.max(1, flowerN));
    const FL = real ? ["#ffffff", "#fde047", "#c4b5fd"] : ["#f472b6", "#facc15", "#ffffff", "#c084fc", "#fb7185", "#60a5fa"];
    for (let i = 0; i < flowerN; i++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * (R + 30);
      m4.compose(ps.set(Math.sin(a) * r, 0.2, Math.cos(a) * r), q.identity(), sc.setScalar(rand(0.8, 1.4)));
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, col.set(FL[i % FL.length]));
    }
    flowers.count = flowerN;
    const grassGeo = new THREE.ConeGeometry(0.05, 0.6, 3);
    grassGeo.translate(0, 0.3, 0);
    const grassN = 18000;
    const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 }), grassN);
    for (let i = 0; i < grassN; i++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * (R + 30);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      m4.compose(ps.set(x, 0, z), q.setFromEuler(e.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3))), sc.setScalar(rand(0.6, 1.4)));
      grass.setMatrixAt(i, m4);
      if (!day) grass.setColorAt(i, col.setHSL(0.05, 0.3, rand(0.08, 0.14)));
      else if (real) grass.setColorAt(i, col.setHSL(rand(0.18, 0.27), 0.45, rand(0.18, 0.32)));
      else grass.setColorAt(i, col.setHSL(rand(0.22, 0.32), 0.65, rand(0.35, 0.5)));
    }
    for (const im of [bushes, flowers, grass]) {
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.arena.add(im);
    }

    // Hütten
    const wallMat = new THREE.MeshStandardMaterial({ color: day ? "#a47148" : "#3f2a1d", roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: real ? "#6b4f3a" : day ? "#dc2626" : "#1f1414", roughness: 0.8, flatShading: true });
    for (let i = 0; i < 28; i++) {
      const p = this.freeSpot(R);
      const g = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.7, 2.8, 12), wallMat);
      wall.position.y = 1.4;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 12), roofMat);
      roof.position.y = 3.9;
      const door = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 0.2), new THREE.MeshStandardMaterial({ color: "#3f2a1d" }));
      door.position.set(0, 0.9, -2.62);
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.1), new THREE.MeshStandardMaterial({ color: "#fde68a", emissive: "#f59e0b", emissiveIntensity: day ? 0.2 : 1.5 }));
      win.position.set(1.6, 1.7, -2.05);
      win.rotation.y = -0.6;
      g.add(wall, roof, door, win);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = rand(0, Math.PI * 2);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
      });
      this.arena.add(g);
      this.pillars.push({ x: p.x, z: p.z, r: 2.7, top: 4.8, prop: true });
    }

    // Aussichtstürme mit Sprungpad
    const towerWood = new THREE.MeshStandardMaterial({ color: day ? "#8b5a33" : "#2a1a14", roughness: 0.9 });
    const padMat = new THREE.MeshStandardMaterial({ color: "#0e7490", emissive: "#22d3ee", emissiveIntensity: 1.6 });
    const makePad = (x: number, z: number) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.18, 20), padMat);
      pad.position.set(x, 0.09, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 24), toy("#fde047"));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.2, z);
      this.arena.add(pad, ring);
      this.pads.push({ x, z });
    };
    for (let i = 0; i < 16; i++) {
      const p = this.freeSpot(R - 5);
      const g = new THREE.Group();
      for (const [lx, lz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7, 0.35), towerWood);
        leg.position.set(lx, 3.5, lz);
        g.add(leg);
      }
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 16), towerWood);
      plat.position.y = 7.05;
      const rail = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 6, 24), towerWood);
      rail.rotation.x = Math.PI / 2;
      rail.position.y = 7.9;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1), toy(["#ef4444", "#3b82f6", "#facc15", "#22c55e"][i % 4]));
      flag.position.set(0, 9.4, 0.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), towerWood);
      pole.position.y = 8.4;
      g.add(plat, rail, pole, flag);
      g.position.set(p.x, 0, p.z);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
      });
      this.arena.add(g);
      this.pillars.push({ x: p.x, z: p.z, r: 2.3, top: 7.2, prop: true });
      makePad(p.x + 3.6, p.z);
    }
    for (let i = 0; i < 20; i++) {
      const p = this.freeSpot(R);
      makePad(p.x, p.z);
    }

    // Kisten
    const crateGeo = new RoundedBoxGeometry(1.2, 1.2, 1.2, 2, 0.06);
    const crateMat = new THREE.MeshStandardMaterial({ color: day ? "#b7884f" : "#3f2a1d", roughness: 0.85 });
    for (let i = 0; i < 140; i++) {
      const p = this.freeSpot(R);
      const stack = Math.random() < 0.3 ? 2 : 1;
      for (let k = 0; k < stack; k++) {
        const cr = new THREE.Mesh(crateGeo, crateMat);
        cr.position.set(p.x + (k ? 0.1 : 0), 0.6 + k * 1.2, p.z);
        cr.rotation.y = rand(0, 1.5);
        cr.castShadow = cr.receiveShadow = true;
        this.arena.add(cr);
      }
      this.pillars.push({ x: p.x, z: p.z, r: 0.75, top: 1.2 * stack, prop: true });
    }

    // Lagerfeuer
    const stoneMat = new THREE.MeshStandardMaterial({ color: "#78716c", roughness: 1, flatShading: true });
    const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.3) });
    for (let i = 0; i < 20; i++) {
      const p = this.freeSpot(R);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
        st.position.set(p.x + Math.sin(a) * 0.8, 0.12, p.z + Math.cos(a) * 0.8);
        this.arena.add(st);
      }
      for (let k = 0; k < 3; k++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), this.woods[k]);
        log.rotation.set(Math.PI / 2, (k / 3) * Math.PI, 0);
        log.position.set(p.x, 0.15, p.z);
        this.arena.add(log);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), fireMat);
      flame.position.set(p.x, 0.55, p.z);
      this.arena.add(flame);
      this.fires.push(new THREE.Vector3(p.x, 0.2, p.z));
    }

    // Riesenpilze (nur im Himmel-Thema)
    if (day && !real) {
      for (let i = 0; i < 40; i++) {
        const p = this.freeSpot(R + 10);
        const s = rand(0.8, 1.4);
        const g = new THREE.Group();
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 2.4 * s, 10), toy("#fef3c7"));
        stem.position.y = 1.2 * s;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(1.4 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toy(Math.random() < 0.5 ? "#ef4444" : "#a855f7"));
        cap.position.y = 2.3 * s;
        g.add(stem, cap);
        for (let k = 0; k < 6; k++) {
          const a = rand(0, Math.PI * 2);
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16 * s, 8, 6), toy("#ffffff"));
          dot.position.set(Math.sin(a) * 0.9 * s, 2.3 * s + 0.9 * s, Math.cos(a) * 0.9 * s);
          g.add(dot);
        }
        g.position.set(p.x, 0, p.z);
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = true;
        });
        this.arena.add(g);
        this.pillars.push({ x: p.x, z: p.z, r: 0.45 * s, top: 2.3 * s, prop: true });
      }
    }

    // Berge am Rand
    const mtMat = new THREE.MeshStandardMaterial({ color: day ? (real ? "#5f6b52" : "#6fae5a") : "#1c1017", roughness: 1, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + rand(-0.05, 0.05);
      const r = rand(R + 70, R + 110);
      const h = rand(25, 70);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rand(20, 40), h, 7), mtMat);
      m.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r);
      m.rotation.y = rand(0, 3);
      this.arena.add(m);
    }
    return R;
  }

  private aliveTeams() {
    return new Set(this.aliveFighters().map((f) => f.team)).size;
  }

  // ---------- Sturm (Battle Royale) ----------
  private updateStorm(dt: number) {
    if (this.mode !== "br") return;
    const s = this.storm;
    if (s.dur === 0 && this.time >= s.nextAt && s.r > 0.5) {
      s.fx = s.x;
      s.fz = s.z;
      s.fr = s.r;
      s.tr = s.r > 10 ? s.r * 0.6 : 0;
      const a = rand(0, Math.PI * 2);
      const d = rand(0, Math.max(0, s.r - s.tr) * 0.8);
      s.tx = s.x + Math.sin(a) * d;
      s.tz = s.z + Math.cos(a) * d;
      s.t0 = this.time;
      s.dur = s.r > 10 ? 22 : 30;
      this.say("🌪️ Der Sturm zieht sich zusammen!");
    }
    if (s.dur > 0) {
      const k = clamp((this.time - s.t0) / s.dur, 0, 1);
      s.x = s.fx + (s.tx - s.fx) * k;
      s.z = s.fz + (s.tz - s.fz) * k;
      s.r = s.fr + (s.tr - s.fr) * k;
      if (k >= 1) {
        s.dur = 0;
        s.nextAt = this.time + 18;
      }
    }
    this.stormMesh.position.set(s.x, 60, s.z);
    this.stormMesh.scale.set(Math.max(0.1, s.r), 1, Math.max(0.1, s.r));
    const dps = 3 + (this.ringR + 14 - s.r) * 0.12;
    for (const f of this.fighters) {
      if (!f.alive || f.glide) continue;
      if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) > s.r) {
        f.hp -= dps * dt;
        if (!f.bot) this.hurt = Math.max(this.hurt, 0.35);
        if (f.bot && Math.random() < 0.05) this.drawLabel(f);
        if (f.hp <= 0) {
          this.eliminate(f, f.lastHitBy && this.time - f.lastHitT < 6 ? f.lastHitBy : null);
          this.say(`🌪️ ${f.name} wurde vom Sturm erwischt`);
        }
      }
    }
  }

  // ---------- Minikarte (Battle Royale) ----------
  private drawMini() {
    const show = (this.mode === "br" || this.flat) && this.playing;
    this.mini.style.display = show ? "block" : "none";
    if (!show) return;
    const c = this.mini.getContext("2d")!;
    const S = 180;
    const k = (S / 2 - 10) / (this.ringR + 14);
    const X = (x: number) => S / 2 + x * k;
    c.clearRect(0, 0, S, S);
    c.fillStyle = "rgba(15,23,42,0.6)";
    c.beginPath();
    c.roundRect(0, 0, S, S, 16);
    c.fill();
    for (const rv of this.rivers) {
      c.strokeStyle = this.day ? "rgba(96,165,250,0.9)" : "rgba(249,115,22,0.9)";
      c.lineWidth = Math.max(2, rv.w * k);
      c.beginPath();
      rv.pts.forEach((pt, i) => (i ? c.lineTo(X(pt.x), X(pt.z)) : c.moveTo(X(pt.x), X(pt.z))));
      c.stroke();
    }
    c.fillStyle = this.flat ? "rgba(34,197,94,0.55)" : "rgba(255,255,255,0.45)";
    for (const p of this.pillars) {
      c.beginPath();
      c.arc(X(p.x), X(p.z), Math.max(1.5, p.r * k), 0, Math.PI * 2);
      c.fill();
    }
    const s = this.storm;
    c.fillStyle = "rgba(147,51,234,0.35)";
    c.beginPath();
    c.rect(0, 0, S, S);
    c.arc(X(s.x), X(s.z), Math.max(0, s.r * k), 0, Math.PI * 2, true);
    c.fill("evenodd");
    c.strokeStyle = "#e9d5ff";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(X(s.x), X(s.z), Math.max(0, s.r * k), 0, Math.PI * 2);
    c.stroke();
    if (s.dur > 0) {
      c.setLineDash([4, 4]);
      c.strokeStyle = "#ffffff";
      c.beginPath();
      c.arc(X(s.tx), X(s.tz), Math.max(0, s.tr * k), 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    const me = this.fighters[0];
    for (const f of this.fighters) {
      if (!f.alive || f === me || f.team !== me.team) continue;
      c.fillStyle = "#4ade80";
      c.beginPath();
      c.arc(X(f.pos.x), X(f.pos.z), 4, 0, Math.PI * 2);
      c.fill();
    }
    if (me.alive) {
      const px = X(me.pos.x);
      const pz = X(me.pos.z);
      const dx = -Math.sin(me.yaw);
      const dz = -Math.cos(me.yaw);
      c.fillStyle = "#facc15";
      c.strokeStyle = "#000";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(px + dx * 8, pz + dz * 8);
      c.lineTo(px - dx * 5 + dz * 5, pz - dz * 5 - dx * 5);
      c.lineTo(px - dx * 5 - dz * 5, pz - dz * 5 + dx * 5);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  private drawLabel(f: Fighter) {
    const hp = Math.max(0, Math.round(f.hp));
    const sh = Math.max(0, Math.round(f.shield));
    if (hp * 1000 + sh === f.labelHp) return;
    f.labelHp = hp * 1000 + sh;
    const c = f.labelCanvas;
    const x = c.getContext("2d")!;
    x.clearRect(0, 0, c.width, c.height);
    x.font = "bold 30px sans-serif";
    x.textAlign = "center";
    x.lineWidth = 6;
    x.strokeStyle = "rgba(0,0,0,0.8)";
    x.strokeText(f.team === 0 ? "🤝 " + f.name : f.name, 128, 26);
    x.fillStyle = f.team === 0 ? "#86efac" : "#ffffff";
    x.fillText(f.team === 0 ? "🤝 " + f.name : f.name, 128, 26);
    x.fillStyle = "rgba(0,0,0,0.7)";
    x.beginPath();
    x.roundRect(28, 42, 200, 20, 8);
    x.fill();
    x.fillStyle = hp > 50 ? "#22c55e" : hp > 25 ? "#facc15" : "#ef4444";
    x.beginPath();
    x.roundRect(31, 45, 194 * (hp / 100), 14, 6);
    x.fill();
    if (sh > 0) {
      x.fillStyle = "rgba(0,0,0,0.7)";
      x.beginPath();
      x.roundRect(28, 34, 200, 10, 5);
      x.fill();
      x.fillStyle = "#60a5fa";
      x.beginPath();
      x.roundRect(30, 36, 196 * (sh / 100), 6, 3);
      x.fill();
    }
    f.labelTex.needsUpdate = true;
  }

  // ---------- Spielregeln ----------
  private aliveFighters() {
    return this.fighters.filter((f) => f.alive);
  }

  private eye(f: Fighter) {
    return new THREE.Vector3(f.pos.x, f.pos.y + EYE, f.pos.z);
  }

  private say(text: string) {
    this.feed.unshift({ text, t: this.time });
    if (this.feed.length > 5) this.feed.pop();
  }

  private giveItems() {
    const pool = (this.rules.items ?? ITEM_KINDS).filter((k) => !(this.rules.noHeal && HEALS[k]));
    if (!pool.length) return;
    const total = pool.reduce((s, k) => s + ITEMS[k].weight, 0);
    for (const f of this.aliveFighters()) {
      const free = f.slots.findIndex((s) => s === null);
      if (free < 0) continue;
      let r = Math.random() * total;
      let kind: ItemKind = pool[0];
      for (const k of pool) {
        r -= ITEMS[k].weight;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      f.slots[free] = { kind, uses: ITEMS[kind].uses };
      if (!f.bot) this.sfx.pickup();
      if (f.bot) this.particles.burst(new THREE.Vector3(f.pos.x, f.pos.y + 2, f.pos.z), "#fde68a", 10, 2, 0.6, 2);
    }
  }

  private damage(v: Fighter, amount: number, from: Fighter | null, nx: number, nz: number, kb: number, at: THREE.Vector3, head = false) {
    if (!v.alive) return;
    if (from && from !== v && from.team === v.team) return;
    amount *= this.rules.dmg;
    kb *= this.rules.kb;
    if (!v.bot) amount *= this.rules.youDmg;
    if (!v.bot) {
      amount = Math.max(1, Math.round(amount * this.diff.dmgToYou));
      kb *= this.diff.kbToYou;
    }
    const absorbed = Math.min(v.shield, amount);
    v.shield -= absorbed;
    v.hp -= amount - absorbed;
    if (this.rules.vampire && from && from !== v) from.hp = Math.min(100, from.hp + amount * 0.5);
    if (from && !from.bot && from !== v) this.sfx.hit(head);
    if (!v.bot) this.sfx.hurt();
    if (absorbed > 0) this.particles.burst(at, "#60a5fa", 10, 3, 0.4);
    if (from) {
      v.lastHitBy = from;
      v.lastHitT = this.time;
    }
    v.vel.x += nx * kb;
    v.vel.z += nz * kb;
    if (kb > 2) v.vel.y = Math.max(v.vel.y, kb * 0.35);
    v.stun = Math.max(v.stun, 0.15 + kb * 0.04);
    this.particles.burst(at, head ? "#fde047" : v.color, head ? 18 : 8, 3, 0.4);
    if (from && !from.bot) {
      this.hitTime = 0;
      this.headshot = head;
      this.floater(at, Math.round(amount), head);
    }
    if (!v.bot) {
      this.hurt = 1;
      this.shake = Math.max(this.shake, 0.12 + kb * 0.02);
    }
    if (v.hp <= 0) this.eliminate(v, from);
    else if (v.bot) this.drawLabel(v);
  }

  private eliminate(f: Fighter, by: Fighter | null, lava = false) {
    f.alive = false;
    if (!this.fighters.some((o) => o.alive && o.team === f.team)) {
      const place = this.aliveTeams() + 1;
      for (const o of this.fighters) if (o.team === f.team) o.place = place;
    }
    f.hp = 0;
    f.mesh.visible = false;
    f.label.visible = false;
    const c = new THREE.Vector3(f.pos.x, f.pos.y + 0.9, f.pos.z);
    this.particles.burst(c, f.color, 50, 6, 1.1, 6);
    this.confetti(c);
    if (by && by !== f) {
      by.kills++;
      if (by.bot && Math.random() < 0.5) by.dance = 1.6;
      if (!by.bot) {
        this.sfx.elim();
        this.streak.n = this.time - this.streak.t < 6 ? this.streak.n + 1 : 1;
        this.streak.t = this.time;
        const words = ["", "💥 ERWISCHT!", "🔥 DOPPEL-TREFFER!", "🌟 TRIPLE!", "🚀 UNAUFHALTBAR!"];
        this.showBanner(words[Math.min(this.streak.n, 4)]);
      }
    }
    this.particles.burst(c, "#ffffff", 25, 4, 0.8, 2);
    if (lava) this.particles.burst(new THREE.Vector3(f.pos.x, this.lavaY, f.pos.z), this.day ? "#ffffff" : "#f97316", 40, 6, 1, 8);
    const hz = this.real ? "Meer 🌊" : this.day ? "Wolken ☁️" : "Lava 🔥";
    const fell = this.real ? "ist ins Meer gefallen 🌊" : this.day ? "ist in die Wolken gefallen ☁️" : "ist in die Lava gefallen 🔥";
    if (by && by !== f) this.say(lava ? `${by.name} 👊 ${f.name} (${hz})` : `${by.name} 🎯 ${f.name}`);
    else this.say(lava ? `${f.name} ${fell}` : `💥 ${f.name} ist raus`);
    if (!f.bot) {
      this.zoom = false;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  private floater(at: THREE.Vector3, n: number, head: boolean) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const x = c.getContext("2d")!;
    x.font = "900 44px sans-serif";
    x.textAlign = "center";
    x.lineWidth = 7;
    x.strokeStyle = "rgba(0,0,0,0.8)";
    x.strokeText(String(n), 64, 48);
    x.fillStyle = head ? "#fde047" : "#ffffff";
    x.fillText(String(n), 64, 48);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), depthTest: false, transparent: true }));
    s.renderOrder = 999;
    s.position.copy(at).add(new THREE.Vector3(rand(-0.3, 0.3), 0.4, rand(-0.3, 0.3)));
    s.scale.set(1.1, 0.55, 1);
    this.scene.add(s);
    this.floaters.push({ sprite: s, life: 0.9 });
  }

  private tracer(from: THREE.Vector3, to: THREE.Vector3, color: string, width: number) {
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const m = new THREE.Mesh(
      this.tracerGeo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.scale.set(width, len, width);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.scene.add(m);
    this.tracers.push({ mesh: m, life: 0.12, max: 0.12 });
  }

  private muzzle(f: Fighter) {
    if (!f.bot && !this.thirdPerson) return this.camera.localToWorld(new THREE.Vector3(0.3, -0.27, -1.2));
    const d = fwd(f.yaw, f.pitch);
    const right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    return new THREE.Vector3(f.pos.x, f.pos.y + 0.95, f.pos.z).addScaledVector(d, 0.75).addScaledVector(right, 0.42);
  }

  private fire(f: Fighter, kind: WeaponKind, charge = 1) {
    const w = WEAPON[kind];
    const spread = f.bot ? w.botSpread * this.diff.spread : kind === "sniper" && this.zoom ? 0 : w.spread;
    const m = this.muzzle(f);
    if (w.projectile) {
      const dir = fwd(f.yaw + rand(-spread, spread), f.pitch + rand(-spread, spread)).normalize();
      this.launch(f, w.projectile, dir, charge);
    } else {
      for (let i = 0; i < w.pellets; i++) this.hitscan(f, kind, spread, m);
    }
    this.particles.burst(m, kind === "raygun" ? "#7dd3fc" : "#fde047", w.pellets > 1 ? 14 : kind === "sniper" ? 10 : 4, 2, 0.15, 0);
    if (!f.bot) {
      this.flash.position.copy(m);
      this.flash.intensity = Math.max(this.flash.intensity, w.recoil * 12);
      this.recoil = w.recoil;
    }
    this.sfx.shot(kind, this.vol(f.pos, f.bot));
    f.cd = w.cd;
  }

  // Lautstärke je nach Entfernung
  private vol(pos: THREE.Vector3, far: boolean) {
    if (!far) return 1;
    return clamp(1 - this.camera.position.distanceTo(pos) / 70, 0, 1) * 0.7;
  }

  private showBanner(text: string) {
    this.banner = { text, t: this.time };
  }

  private confetti(at: THREE.Vector3, n = 10) {
    for (const c of ["#f87171", "#facc15", "#4ade80", "#60a5fa", "#c084fc", "#f472b6"]) this.particles.burst(at, c, n, 5, 1.4, 5);
  }

  // ---------- Schatzkiste ----------
  private spawnChest() {
    const me = this.fighters[0];
    const near = this.pillars.filter((q) => me?.alive && Math.hypot(q.x - me.pos.x, q.z - me.pos.z) < 35);
    const pool = this.mode === "br" && near.length ? near : this.pillars;
    const p = this.flat ? this.freeSpot(this.ringR * 0.85, me?.alive ? me.pos : undefined) : pool[Math.floor(Math.random() * pool.length)];
    const g = new THREE.Group();
    const gold = toy("#f59e0b", { metalness: 0.6, roughness: 0.25, emissive: "#b45309", emissiveIntensity: 0.4 });
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.6, 0.6, 3, 0.08), gold);
    box.position.y = 0.3;
    const lid = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.24, 0.66, 3, 0.08), toy("#fbbf24", { metalness: 0.6, roughness: 0.25 }));
    lid.position.y = 0.7;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.88, 0.68), toy("#78350f"));
    band.position.y = 0.42;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), toy("#fde047", { metalness: 0.8 }));
    lock.position.set(0, 0.55, -0.35);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.3), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.position.y = 20;
    const balloon = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 14), toy("#ef4444"));
    ball.scale.y = 1.15;
    ball.position.y = 3;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2, 4), mat("#f5f5f4"));
    string.position.y = 1.5;
    balloon.add(ball, string);
    g.add(box, lid, band, lock, beam, balloon);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o !== beam) o.castShadow = true;
    });
    const pos = new THREE.Vector3(p.x + rand(-1, 1), p.top + 30, p.z + rand(-1, 1));
    g.position.copy(pos);
    this.scene.add(g);
    this.chest = { mesh: g, balloon, pos, landed: false, top: p.top, life: 30 };
    this.say("📦 Eine Schatzkiste kommt!");
    this.sfx.chest();
  }

  private removeChest() {
    if (!this.chest) return;
    this.scene.remove(this.chest.mesh);
    this.chest = null;
  }

  private updateChest(dt: number) {
    if (!this.chest) {
      if (this.time >= this.nextChest) {
        this.spawnChest();
        this.nextChest = this.time + (this.rules.chestEvery ?? (this.mode === "br" ? 15 : 25));
      }
      return;
    }
    const c = this.chest;
    if (!c.landed) {
      c.pos.y -= 3 * dt;
      if (c.pos.y <= c.top) {
        c.pos.y = c.top;
        c.landed = true;
        c.balloon.visible = false;
        this.particles.burst(c.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), "#fde047", 30, 4, 0.8, 4);
      }
    } else {
      c.life -= dt;
    }
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.y += dt * 0.8;
    if (Math.random() < 0.3) this.particles.spawn(c.pos.x + rand(-0.6, 0.6), c.pos.y + rand(0.2, 1), c.pos.z + rand(-0.6, 0.6), 0, 1, 0, 0.8, "#fde047", 0);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (Math.hypot(f.pos.x - c.pos.x, f.pos.z - c.pos.z) < 1.3 && Math.abs(f.pos.y - c.pos.y) < 1.6) {
        const rare: ItemKind[] = ["minigun", "rocket", "sniper", "raygun"];
        const kind = rare[Math.floor(Math.random() * rare.length)];
        const free = f.slots.findIndex((s) => s === null);
        f.slots[free >= 0 ? free : f.sel] = { kind, uses: ITEMS[kind].uses };
        f.shield = Math.min(100, f.shield + 50);
        this.say(`📦 ${f.name} hat die Schatzkiste!`);
        this.confetti(c.pos.clone().add(new THREE.Vector3(0, 1, 0)), 8);
        if (!f.bot) {
          this.sfx.chest();
          this.showBanner(`📦 SCHATZKISTE! ${ITEMS[kind].emoji} ${ITEMS[kind].name}`);
        } else this.drawLabel(f);
        this.removeChest();
        return;
      }
    }
    if (c.life <= 0 || c.pos.y < this.lavaY + 0.5) this.removeChest();
  }

  private hitscan(f: Fighter, kind: WeaponKind, spread: number, m: THREE.Vector3) {
    const w = WEAPON[kind];
    const dir = fwd(f.yaw + rand(-spread, spread), f.pitch + rand(-spread, spread)).normalize();
    const origin = this.eye(f);
    const as = f.bot ? 1 : this.diff.assist;

    let best = Infinity;
    let victim: Fighter | null = null;
    let head = false;
    for (const o of this.fighters) {
      if (!o.alive || o === f || o.team === f.team) continue;
      const th = raySphere(origin, dir, o.pos.x, o.pos.y + 1.5, o.pos.z, 0.33 * as);
      const tb = raySphere(origin, dir, o.pos.x, o.pos.y + 0.85, o.pos.z, 0.6 * as);
      if (th < best) {
        best = th;
        victim = o;
        head = true;
      }
      if (tb < best) {
        best = tb;
        victim = o;
        head = false;
      }
    }
    let block = 400;
    for (const p of this.pillars) block = Math.min(block, rayPillar(origin, dir, p));
    if (dir.y < 0) block = Math.min(block, (this.floorY() - origin.y) / dir.y);
    const hitVictim = victim && best < block ? victim : null;
    const end = origin.clone().addScaledVector(dir, hitVictim ? best : block);
    this.tracer(m, end, w.color, w.width);

    if (hitVictim) {
      const hl = Math.hypot(dir.x, dir.z) || 1;
      let dmg = head ? w.head : w.dmg;
      if (kind === "shotgun") dmg = Math.max(1, Math.round(dmg * clamp(1.2 - best / 18, 0.2, 1)));
      this.damage(hitVictim, dmg, f, dir.x / hl, dir.z / hl, w.kb, end, head);
    } else if (block < 400) {
      this.particles.burst(end, "#d6d3d1", 6, 2.5, 0.35);
    }
  }

  private launch(f: Fighter, type: ProjType, dir: THREE.Vector3, charge: number) {
    const g = new THREE.Group();
    if (type === "rocket") {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 10), mat("#4d7c0f"));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 10), mat("#dc2626"));
      tip.position.y = 0.42;
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2, 0.4) }));
      fire.position.y = -0.36;
      g.add(body, tip, fire);
    } else if (type === "arrow") {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), mat("#d6b98c"));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), mat("#9ca3af", { metalness: 0.8 }));
      tip.position.y = 0.5;
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.15, 0.08), mat("#ef4444"));
      fletch.position.y = -0.38;
      g.add(shaft, tip, fletch);
    } else {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 3, 6) }));
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      g.add(core, halo);
    }
    const pos = f.bot ? this.muzzle(f) : this.eye(f).addScaledVector(dir, 0.8);
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(UP, dir);
    this.scene.add(g);
    const speed = type === "rocket" ? 30 : type === "plasma" ? 45 : 20 + 30 * charge;
    this.projectiles.push({
      type,
      pos,
      vel: dir.clone().multiplyScalar(speed),
      owner: f,
      t: 0,
      mesh: g,
      grav: type === "arrow" ? 9 : 0,
      dmg: type === "arrow" ? Math.round(25 + 55 * charge) : WEAPON.raygun.dmg,
    });
  }

  private projHit(p: Proj, at: THREE.Vector3, victim: Fighter | null, head: boolean, dir: THREE.Vector3) {
    p.dead = true;
    if (p.type === "rocket") {
      this.explode({ pos: at, owner: p.owner }, 6, 55);
      return;
    }
    const hl = Math.hypot(dir.x, dir.z) || 1;
    if (victim) this.damage(victim, Math.round(head ? p.dmg * 1.6 : p.dmg), p.owner, dir.x / hl, dir.z / hl, p.type === "arrow" ? 3 : 1.5, at, head);
    else this.particles.burst(at, p.type === "plasma" ? "#38bdf8" : "#d6b98c", 12, 2.5, 0.4);
    if (p.type === "plasma") this.particles.burst(at, "#7dd3fc", 14, 3, 0.35, 0);
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.t += dt;
      p.vel.y -= p.grav * dt;
      const speed = p.vel.length();
      const step = speed * dt;
      const dir = p.vel.clone().divideScalar(speed);
      const as = p.owner.bot ? 1 : this.diff.assist;
      let hitT = Infinity;
      let victim: Fighter | null = null;
      let head = false;
      for (const o of this.fighters) {
        if (!o.alive || o.team === p.owner.team) continue;
        const th = raySphere(p.pos, dir, o.pos.x, o.pos.y + 1.5, o.pos.z, 0.33 * as);
        const tb = raySphere(p.pos, dir, o.pos.x, o.pos.y + 0.85, o.pos.z, 0.6 * as);
        if (th < hitT) {
          hitT = th;
          victim = o;
          head = true;
        }
        if (tb < hitT) {
          hitT = tb;
          victim = o;
          head = false;
        }
      }
      let block = Infinity;
      for (const q of this.pillars) block = Math.min(block, rayPillar(p.pos, dir, q));
      if (dir.y < 0) block = Math.min(block, (this.floorY() - p.pos.y) / dir.y);
      if (victim && hitT <= step && hitT < block) {
        this.projHit(p, p.pos.clone().addScaledVector(dir, hitT), victim, head, dir);
      } else if (block <= step) {
        this.projHit(p, p.pos.clone().addScaledVector(dir, block), null, false, dir);
      } else {
        p.pos.addScaledVector(dir, step);
        if (this.onBridge(p.pos)) this.projHit(p, p.pos.clone(), null, false, dir);
        else if (p.t > 4) p.dead = true;
      }
      p.mesh.position.copy(p.pos);
      p.mesh.quaternion.setFromUnitVectors(UP, dir);
      if (p.type === "rocket") {
        this.particles.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-0.4, 0.4), rand(0, 0.6), rand(-0.4, 0.4), 0.9, "#57534e", -0.6);
        this.particles.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.25, "#fb923c", 0);
      } else if (p.type === "plasma") {
        this.particles.spawn(p.pos.x, p.pos.y, p.pos.z, rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3), 0.3, "#38bdf8", 0);
      }
      if (p.dead) {
        this.scene.remove(p.mesh);
        p.mesh.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private buildBridge(f: Fighter, pitch: number) {
    const p = clamp(pitch, -0.45, 0.45);
    const dx = -Math.sin(f.yaw);
    const dz = -Math.cos(f.yaw);
    const slope = Math.tan(p);
    const back = 0.6;
    const b: Bridge = {
      sx: f.pos.x - dx * back,
      sy: f.pos.y - back * slope,
      sz: f.pos.z - dz * back,
      dx,
      dz,
      px: dz,
      pz: -dx,
      lenH: BRIDGE_LEN * Math.cos(p),
      slope,
      life: BRIDGE_LIFE,
      mesh: buildBridgeMesh(this.woods, this.ropeMat, this.postMat),
    };
    b.mesh.position.set(b.sx, b.sy, b.sz);
    b.mesh.rotation.order = "YXZ";
    b.mesh.rotation.y = f.yaw;
    b.mesh.rotation.x = p;
    this.arena.add(b.mesh);
    this.bridges.push(b);
    this.sfx.build(this.vol(f.pos, f.bot));
    this.particles.burst(new THREE.Vector3(f.pos.x + dx * 3, f.pos.y, f.pos.z + dz * 3), "#d97706", 25, 3, 0.6);
  }

  // Gegenstand benutzen (keine Waffe). Gibt true zurück, wenn er verbraucht wurde.
  private canHeal(f: Fighter, kind: ItemKind) {
    const h = HEALS[kind];
    if (!h) return false;
    const hpRoom = (h.hp ?? 0) > 0 && f.hp + f.regenHp < (h.hpMax ?? 100);
    const shRoom = ((h.shield ?? 0) > 0 || !!h.overflow) && f.shield + f.regenShield < (h.shieldMax ?? 100);
    return hpRoom || shRoom;
  }

  private heal(f: Fighter, h: HealCfg) {
    const c = new THREE.Vector3(f.pos.x, f.pos.y + 1, f.pos.z);
    if (h.slow) {
      f.regenHp += h.hp ?? 0;
      f.regenShield += h.shield ?? 0;
    } else {
      if (h.hp) {
        const cap = h.hpMax ?? 100;
        const before = f.hp;
        if (f.hp < cap) f.hp = Math.min(cap, f.hp + h.hp);
        if (h.overflow) f.shield = Math.min(100, f.shield + Math.max(0, before + h.hp - 100));
      }
      if (h.shield) {
        const cap = h.shieldMax ?? 100;
        if (f.shield < cap) f.shield = Math.min(cap, f.shield + h.shield);
      }
    }
    if (!f.bot) this.sfx.heal();
    if (h.hp) this.particles.burst(c, "#4ade80", 30, 2.5, 0.9, -1);
    if (h.shield || h.overflow) this.particles.burst(c, "#60a5fa", 30, 2.5, 0.9, -1);
    if (f.bot) this.drawLabel(f);
    return true;
  }

  private useItem(f: Fighter, kind: ItemKind): boolean {
    const h = HEALS[kind];
    if (h) return this.canHeal(f, kind) && this.heal(f, h);
    switch (kind) {
      case "medkit":
        if (f.hp >= 100) return false;
        f.hp = Math.min(100, f.hp + 50);
        this.particles.burst(new THREE.Vector3(f.pos.x, f.pos.y + 1, f.pos.z), "#4ade80", 30, 2.5, 0.9, -1);
        if (f.bot) this.drawLabel(f);
        return true;
      case "bridge":
        if (!f.onGround) return false;
        this.buildBridge(f, f.pitch);
        return true;
      case "mushroom": {
        if (!f.onGround) return false;
        const d = fwd(f.yaw);
        f.vel.set(d.x * 9, 13, d.z * 9);
        this.sfx.boing(this.vol(f.pos, f.bot));
        f.onGround = false;
        this.particles.burst(f.pos.clone(), "#4ade80", 30, 4, 0.7);
        return true;
      }
      case "bomb": {
        const d = fwd(f.yaw, f.pitch);
        const g = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat("#111827", { metalness: 0.3, roughness: 0.3 }));
        ball.castShadow = true;
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: "#fde047" }));
        spark.position.y = 0.28;
        g.add(ball, spark);
        const pos = this.eye(f).addScaledVector(d, 0.7);
        g.position.copy(pos);
        this.scene.add(g);
        this.bombs.push({ pos, vel: d.multiplyScalar(14).add(new THREE.Vector3(0, 4, 0)), owner: f, t: 0, mesh: g });
        return true;
      }
    }
    return false;
  }

  private act(f: Fighter, pressed: boolean, held: boolean) {
    const s = f.slots[f.sel];
    if (s?.kind !== "bow") f.charge = 0;
    if (s?.kind !== "minigun") f.spin = 0;
    if (!s) return;
    if (isWeapon(s.kind)) {
      const w = WEAPON[s.kind];
      const dt = this.dtNow;
      if (s.kind === "minigun" && !f.bot) {
        f.spin = held ? Math.min(1, f.spin + dt / 0.7) : Math.max(0, f.spin - dt * 2);
        if (f.spin < 1) return;
      }
      if (s.kind === "bow") {
        if (f.bot) {
          if (f.cd <= 0) {
            this.fire(f, "bow", 0.75);
            if (!this.rules.infinite) s.uses--;
          }
        } else if (held) {
          f.charge = Math.min(1, f.charge + dt);
          return;
        } else if (f.charge > 0) {
          if (f.cd <= 0) {
            this.fire(f, "bow", Math.max(0.2, f.charge));
            if (!this.rules.infinite) s.uses--;
          }
          f.charge = 0;
        }
      } else {
        const want = w.auto ? held : pressed;
        if (want && f.cd <= 0) {
          this.fire(f, s.kind);
          if (!this.rules.infinite) s.uses--;
        }
      }
    } else if (pressed && this.useItem(f, s.kind)) {
      if (!this.rules.infinite) s.uses--;
      if (!f.bot) this.recoil = 0.6;
    }
    if (s.uses <= 0) {
      f.slots[f.sel] = null;
      if (!f.bot) this.zoom = false;
    }
  }

  private explode(b: { pos: THREE.Vector3; owner: Fighter }, R = 5.5, maxDmg = 45) {
    this.sfx.explode(Math.max(0.2, this.vol(b.pos, true) / 0.7));
    this.particles.burst(b.pos, "#f97316", 70, 9, 0.9, 4);
    this.particles.burst(b.pos, "#fde047", 40, 6, 0.6, 2);
    this.particles.burst(b.pos, "#57534e", 30, 3, 1.4, -1.5);
    this.flash.position.copy(b.pos);
    this.flash.intensity = 40;
    for (const f of this.aliveFighters()) {
      const c = new THREE.Vector3(f.pos.x, f.pos.y + 0.9, f.pos.z);
      const d = c.distanceTo(b.pos);
      if (d < R) {
        const k = 1 - d / R;
        const hx = c.x - b.pos.x;
        const hz = c.z - b.pos.z;
        const hl = Math.hypot(hx, hz) || 1;
        this.damage(f, Math.round(10 + maxDmg * k), b.owner, hx / hl, hz / hl, 4 + 11 * k, c);
      }
    }
    const me = this.fighters[0];
    if (me.alive) this.shake = Math.max(this.shake, 0.5 * Math.max(0, 1 - me.pos.distanceTo(b.pos) / 30));
    // Bomben zerstören Brücken
    this.bridges = this.bridges.filter((br) => {
      for (let a = 0; a <= br.lenH; a += 1) {
        const x = br.sx + br.dx * a;
        const z = br.sz + br.dz * a;
        const y = br.sy + a * br.slope;
        if (Math.hypot(x - b.pos.x, y - b.pos.y, z - b.pos.z) < 4.5) {
          this.arena.remove(br.mesh);
          this.particles.burst(new THREE.Vector3(x, y, z), "#a0522d", 20, 4, 0.8);
          return false;
        }
      }
      return true;
    });
  }

  // Steht man an dieser Stelle auf etwas?
  private supported(x: number, z: number, feet: number) {
    if (this.flat && feet < 2.6 && feet > -0.6) return true;
    for (const p of this.near(x, z))
      if (Math.hypot(x - p.x, z - p.z) < p.r - 0.2 && p.top <= feet + 0.5 && p.top >= feet - 2.5) return true;
    for (const b of this.bridges) {
      const rx = x - b.sx;
      const rz = z - b.sz;
      const along = rx * b.dx + rz * b.dz;
      const side = rx * b.px + rz * b.pz;
      if (along < 0 || along > b.lenH || Math.abs(side) > BRIDGE_W / 2 - 0.1) continue;
      const surf = b.sy + along * b.slope;
      if (surf <= feet + 0.7 && surf >= feet - 2.5) return true;
    }
    return false;
  }

  private clearShot(from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from);
    const len = d.length();
    d.normalize();
    for (const p of this.pillars) if (rayPillar(from, d, p) < len - 0.5) return false;
    return true;
  }

  private physics(f: Fighter, wishX: number, wishZ: number, dt: number) {
    const gliding = f.glide && !f.onGround;
    wishX *= this.rules.speed;
    wishZ *= this.rules.speed;
    if (this.flat && f.pos.y < 0.4 && this.inRiver(f.pos.x, f.pos.z)) {
      wishX *= 0.55;
      wishZ *= 0.55;
      if (Math.random() < 0.15 && Math.hypot(f.vel.x, f.vel.z) > 1)
        this.particles.spawn(f.pos.x, 0.2, f.pos.z, rand(-1, 1), rand(1, 2.5), rand(-1, 1), 0.5, this.day ? "#bfdbfe" : "#fb923c", 8);
    }
    if (gliding) {
      wishX *= 1.6;
      wishZ *= 1.6;
    }
    const control = gliding ? 2.5 : f.stun > 0 ? 0.4 : f.onGround ? 12 : 1.5;
    const k = Math.min(1, control * dt);
    f.vel.x += (wishX - f.vel.x) * k;
    f.vel.z += (wishZ - f.vel.z) * k;
    f.vel.y = gliding ? Math.max(f.vel.y - GRAV * this.rules.gravity * 0.3 * dt, -5) : Math.max(f.vel.y - GRAV * this.rules.gravity * dt, -40);
    const prevY = f.pos.y;
    f.pos.addScaledVector(f.vel, dt);
    f.onGround = false;
    for (const p of this.near(f.pos.x, f.pos.z)) {
      const dx = f.pos.x - p.x;
      const dz = f.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d >= p.r + BODY_R) continue;
      if (d < p.r + 0.15 && prevY >= p.top - 0.05 && f.pos.y <= p.top) {
        f.pos.y = p.top;
        if (f.vel.y < 0) f.vel.y = 0;
        f.onGround = true;
      } else if (f.pos.y < p.top - 0.05) {
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        f.pos.x = p.x + nx * (p.r + BODY_R);
        f.pos.z = p.z + nz * (p.r + BODY_R);
        const vn = f.vel.x * nx + f.vel.z * nz;
        if (vn < 0) {
          f.vel.x -= vn * nx;
          f.vel.z -= vn * nz;
        }
      }
    }
    for (const b of this.bridges) {
      const rx = f.pos.x - b.sx;
      const rz = f.pos.z - b.sz;
      const along = rx * b.dx + rz * b.dz;
      if (along < -0.3 || along > b.lenH + 0.3) continue;
      const side = rx * b.px + rz * b.pz;
      if (Math.abs(side) > BRIDGE_W / 2 + 0.2) continue;
      const surf = b.sy + clamp(along, 0, b.lenH) * b.slope;
      if (f.pos.y <= surf && prevY >= surf - 0.6 && f.vel.y <= 0.01) {
        f.pos.y = surf;
        f.vel.y = 0;
        f.onGround = true;
      }
    }
    if (this.flat && f.pos.y <= 0) {
      f.pos.y = 0;
      if (f.vel.y < 0) f.vel.y = 0;
      f.onGround = true;
    }
    if (f.glide && f.onGround) {
      f.glide = false;
      if (f.chute) f.chute.visible = false;
    }
  }

  // ---------- Computer-Gegner ----------
  private solveThrow(horiz: number, dy: number) {
    let best = 0.3;
    let bestErr = Infinity;
    for (let p = -0.4; p <= 1.2; p += 0.04) {
      const vx = 14 * Math.cos(p);
      const vy = 14 * Math.sin(p) + 4;
      const t = horiz / vx;
      const y = vy * t - 0.5 * GRAV * 0.8 * t * t;
      const err = Math.abs(y - dy);
      if (err < bestErr) {
        bestErr = err;
        best = p;
      }
    }
    return best;
  }

  private pickStrafe(f: Fighter) {
    const ai = f.ai;
    if (this.flat) {
      ai.strafeX = f.pos.x + rand(-4, 4);
      ai.strafeZ = f.pos.z + rand(-4, 4);
      ai.strafeT = rand(0.8, 2);
      return;
    }
    const p = this.pillars.find((q) => Math.hypot(f.pos.x - q.x, f.pos.z - q.z) < q.r + 0.2 && Math.abs(q.top - f.pos.y) < 0.3);
    if (!p) {
      ai.strafeX = f.pos.x;
      ai.strafeZ = f.pos.z;
    } else {
      const a = rand(0, Math.PI * 2);
      const r = rand(0, p.r * 0.55);
      ai.strafeX = p.x + Math.sin(a) * r;
      ai.strafeZ = p.z + Math.cos(a) * r;
    }
    ai.strafeT = rand(0.8, 2);
  }

  private botPref(k: WeaponKind, d: number) {
    switch (k) {
      case "sniper":
        return d > 15 ? 5 : 1.5;
      case "rifle":
        return 3;
      case "smg":
        return d < 15 ? 4 : 2;
      case "minigun":
        return d < 25 ? 4.5 : 2;
      case "shotgun":
        return d < 7 ? 6 : 0;
      case "rocket":
        return d > 6 ? 3.8 : 0;
      case "bow":
        return 2.5;
      case "raygun":
        return 3.5;
    }
  }

  // Über eine kleine Lücke springen, wenn dahinter Boden ist
  private tryLeap(f: Fighter, dx: number, dz: number) {
    if (!f.onGround) return false;
    for (const d of [3.2, 4.0]) {
      if (this.supported(f.pos.x + dx * d, f.pos.z + dz * d, f.pos.y)) {
        const ai = f.ai;
        f.yaw = Math.atan2(-dx, -dz);
        ai.aimYaw = f.yaw;
        ai.leapX = dx;
        ai.leapZ = dz;
        ai.jump = true;
        ai.forwardT = 0.9;
        return true;
      }
    }
    return false;
  }

  // Richtung ein Ziel laufen (mit Brücke, Sprung oder Pilz)
  private botApproach(f: Fighter, dx: number, dz: number, dist: number, targetY: number) {
    const ai = f.ai;
    ai.aimYaw = Math.atan2(-dx, -dz);
    ai.aimPitch = 0;
    if (this.supported(f.pos.x + dx * 1.2, f.pos.z + dz * 1.2, f.pos.y)) {
      ai.wishX = dx * SPEED;
      ai.wishZ = dz * SPEED;
      return;
    }
    if (this.tryLeap(f, dx, dz)) return;
    const bridge = f.slots.findIndex((s) => s?.kind === "bridge");
    if (bridge >= 0 && f.onGround) {
      f.sel = bridge;
      ai.aimPitch = clamp(Math.atan2(targetY - f.pos.y, Math.min(dist, 12) * 0.8), -0.42, 0.42);
      ai.use = true;
      ai.forwardT = 3;
      return;
    }
    const mush = f.slots.findIndex((s) => s?.kind === "mushroom");
    if (mush >= 0 && f.onGround) {
      f.sel = mush;
      ai.use = true;
      ai.forwardT = 1.6;
    }
  }

  private botThink(f: Fighter) {
    const ai = f.ai;
    ai.fire = false;
    ai.use = false;
    ai.wishX = ai.wishZ = 0;
    const others = this.aliveFighters().filter((o) => o.team !== f.team);
    if (!others.length) return;
    let t = others[0];
    const score = (o: Fighter) => o.pos.distanceTo(f.pos) * (o.bot ? 1 : (this.rules.youBias ?? this.diff.youBias));
    for (const o of others) if (score(o) < score(t)) t = o;

    const e = this.eye(f);
    const chest = new THREE.Vector3(t.pos.x, t.pos.y + 1.0, t.pos.z);
    const to = chest.clone().sub(e);
    const dist = to.length();
    const horiz = Math.hypot(to.x, to.z);
    const los = this.clearShot(e, chest);
    const find = (k: ItemKind) => f.slots.findIndex((s) => s?.kind === k);
    const yawTo = Math.atan2(-to.x, -to.z);
    const pitchTo = Math.atan2(to.y, horiz);
    const dirX = to.x / (horiz || 1);
    const dirZ = to.z / (horiz || 1);

    const strafe = () => {
      if (ai.strafeT <= 0) this.pickStrafe(f);
      const sx = ai.strafeX - f.pos.x;
      const sz = ai.strafeZ - f.pos.z;
      const sl = Math.hypot(sx, sz);
      if (sl > 0.3) {
        ai.wishX = (sx / sl) * SPEED * 0.7;
        ai.wishZ = (sz / sl) * SPEED * 0.7;
      }
    };

    // 1. heilen
    const med = f.slots.findIndex((s) => {
      if (!s || !this.canHeal(f, s.kind)) return false;
      const h = HEALS[s.kind]!;
      if (f.hp < 60 && (h.hp ?? 0) > 0) return true;
      return !los && f.shield < 50 && ((h.shield ?? 0) > 0 || !!h.overflow);
    });
    if (med >= 0) {
      f.sel = med;
      ai.use = true;
      ai.aimYaw = f.yaw;
      ai.aimPitch = f.pitch;
      return;
    }
    // 2. schießen
    let weapon = -1;
    let bestPref = 0;
    f.slots.forEach((s, i) => {
      if (!s || !isWeapon(s.kind)) return;
      const p = this.botPref(s.kind, dist);
      if (p > bestPref) {
        bestPref = p;
        weapon = i;
      }
    });
    if (los && weapon >= 0 && dist < this.diff.range) {
      f.sel = weapon;
      ai.aimYaw = yawTo;
      ai.aimPitch = f.slots[weapon]?.kind === "bow" ? pitchTo + Math.atan2(0.5 * 9 * (dist / 42) ** 2, dist) : pitchTo;
      ai.fire = true;
      strafe();
      if (f.hp < 70 && f.onGround && Math.random() < 0.08) ai.jump = true;
      return;
    }
    // 3. Bombe werfen
    const bomb = find("bomb");
    if (bomb >= 0 && horiz < 22 && horiz > 4) {
      f.sel = bomb;
      ai.aimYaw = yawTo;
      ai.aimPitch = this.solveThrow(horiz, t.pos.y - f.pos.y - 0.6);
      ai.use = true;
      return;
    }
    // Im Sturm? Zur Mitte!
    if (this.mode === "br") {
      const s = this.storm;
      const sx = s.x - f.pos.x;
      const sz = s.z - f.pos.z;
      const sd = Math.hypot(sx, sz);
      if (sd > s.r - 3 && sd > 2) {
        this.botApproach(f, sx / sd, sz / sd, sd, f.pos.y);
        return;
      }
    }
    // Schatzkiste auf der eigenen Säule? Hin!
    const ch = this.chest;
    if (ch && ch.landed && Math.abs(ch.pos.y - f.pos.y) < 1 && Math.hypot(ch.pos.x - f.pos.x, ch.pos.z - f.pos.z) < 7) {
      const cx = ch.pos.x - f.pos.x;
      const cz = ch.pos.z - f.pos.z;
      const cl = Math.hypot(cx, cz) || 1;
      ai.wishX = (cx / cl) * SPEED;
      ai.wishZ = (cz / cl) * SPEED;
      return;
    }
    // 4. hinlaufen
    ai.aimYaw = yawTo;
    ai.aimPitch = 0;
    if (horiz < 3) {
      strafe();
      return;
    }
    if (!this.supported(f.pos.x + dirX * 1.2, f.pos.z + dirZ * 1.2, f.pos.y) && this.tryLeap(f, dirX, dirZ)) return;
    if (this.supported(f.pos.x + dirX * 1.2, f.pos.z + dirZ * 1.2, f.pos.y)) {
      ai.wishX = dirX * SPEED;
      ai.wishZ = dirZ * SPEED;
      return;
    }
    const bridge = find("bridge");
    if (bridge >= 0 && f.onGround) {
      f.sel = bridge;
      ai.aimPitch = clamp(Math.atan2(t.pos.y - f.pos.y, horiz * 0.8), -0.42, 0.42);
      ai.use = true;
      ai.forwardT = 3;
      return;
    }
    const mush = find("mushroom");
    if (mush >= 0 && f.onGround && horiz < 16) {
      f.sel = mush;
      ai.use = true;
      ai.forwardT = 1.6;
      return;
    }
    strafe();
  }

  private updateBot(f: Fighter, dt: number) {
    const ai = f.ai;
    if (f.glide) {
      this.physics(f, 0, 0, dt);
      return;
    }
    ai.strafeT -= dt;
    ai.think -= dt;
    if (ai.think <= 0) {
      this.botThink(f);
      ai.think = rand(this.diff.think[0], this.diff.think[1]);
    }
    const turn = this.diff.turn * dt;
    const dy = angleDiff(f.yaw, ai.aimYaw);
    f.yaw += clamp(dy, -turn, turn);
    f.pitch += clamp(ai.aimPitch - f.pitch, -turn, turn);
    const aimed = Math.abs(angleDiff(f.yaw, ai.aimYaw)) < 0.06 && Math.abs(ai.aimPitch - f.pitch) < 0.06;

    const s = f.slots[f.sel];
    if (ai.fire && aimed && s && isWeapon(s.kind)) {
      const chance = WEAPON[s.kind].auto
        ? this.diff.fireChance
        : Math.min(1, this.diff.sniperChance * (s.kind === "sniper" ? 1 : 3));
      if (Math.random() < chance) this.act(f, true, true);
    } else if (ai.use && aimed && s && !isWeapon(s.kind)) {
      this.act(f, true, false);
      ai.use = false;
      if (s.kind !== "bridge" && s.kind !== "mushroom") ai.forwardT = 0;
    } else if (ai.use && s && isWeapon(s.kind)) {
      ai.use = false;
    }

    let wx = ai.wishX;
    let wz = ai.wishZ;
    if (ai.forwardT > 0 && !ai.use) {
      ai.forwardT -= dt;
      const d = fwd(f.yaw);
      wx = d.x * SPEED;
      wz = d.z * SPEED;
    }
    // nicht von der Kante laufen
    if (f.onGround && (wx || wz) && !ai.jump) {
      const l = Math.hypot(wx, wz);
      if (!this.supported(f.pos.x + (wx / l) * 0.9, f.pos.z + (wz / l) * 0.9, f.pos.y)) {
        wx = wz = 0;
        ai.forwardT = 0;
      }
    }
    if (ai.jump && f.onGround) {
      f.vel.y = JUMP_V * this.rules.jump;
      f.onGround = false;
      if (ai.leapX || ai.leapZ) {
        f.vel.x = ai.leapX * SPEED * 1.1;
        f.vel.z = ai.leapZ * SPEED * 1.1;
      }
    }
    ai.jump = false;
    ai.leapX = ai.leapZ = 0;
    this.physics(f, wx, wz, dt);
  }

  // ---------- Hauptschleife ----------
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const me = this.fighters[0];
    const paused = this.playing && me?.alive && !this.locked && !this.preview;
    if (this.playing && !paused) this.step(dt);
    this.updateEffects(dt, paused);
    this.updateCamera(dt);
    if (this.high) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    this.followShadow();
    this.hudTimer += dt;
    if (this.hudTimer > 0.08) {
      this.hudTimer = 0;
      this.emitHud();
    }
    this.miniTimer += dt;
    if (this.miniTimer > 0.15) {
      this.miniTimer = 0;
      this.drawMini();
    }
  };

  private step(dt: number) {
    this.time += dt;
    this.dtNow = dt;
    const me = this.fighters[0];

    if (this.time >= this.nextItem) {
      this.giveItems();
      this.nextItem = this.time + this.rules.itemEvery;
    }
    if (this.lavaActive()) this.lavaY = Math.min(this.lavaY + LAVA_SPEED * this.rules.lavaSpeed * dt, 22);
    this.updateStorm(dt);

    for (const b of this.bridges) {
      b.life -= dt;
      b.mesh.visible = b.life > 2 || Math.floor(b.life * 8) % 2 === 0;
      if (b.life <= 0) this.arena.remove(b.mesh);
    }
    this.bridges = this.bridges.filter((b) => b.life > 0);

    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.cd -= dt;
      f.stun = Math.max(0, f.stun - dt);
      if (this.rules.regen && f.hp < 100) f.hp = Math.min(100, f.hp + 3 * dt);
      if (this.flat && !this.day && f.pos.y < 0.4 && this.inRiver(f.pos.x, f.pos.z)) {
        f.hp -= 15 * dt;
        if (!f.bot) this.hurt = Math.max(this.hurt, 0.5);
        if (f.hp <= 0) {
          this.eliminate(f, null, true);
          continue;
        }
      }
      if (f.regenHp > 0 || f.regenShield > 0) {
        const a = Math.min(f.regenHp, 10 * dt);
        const b = Math.min(f.regenShield, 10 * dt);
        f.regenHp -= a;
        f.regenShield -= b;
        f.hp = Math.min(100, f.hp + a);
        f.shield = Math.min(100, f.shield + b);
        if (Math.random() < 0.3)
          this.particles.spawn(f.pos.x + rand(-0.4, 0.4), f.pos.y + rand(0.2, 1.6), f.pos.z + rand(-0.4, 0.4), 0, 1, 0, 0.6, a > 0 ? "#4ade80" : "#60a5fa", 0);
        if (f.bot) this.drawLabel(f);
      }
      if (f.bot) {
        this.updateBot(f, dt);
      } else {
        const fx = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
        const rx = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
        const fw = fwd(f.yaw);
        let wx = fw.x * fx + Math.cos(f.yaw) * rx;
        let wz = fw.z * fx - Math.sin(f.yaw) * rx;
        const l = Math.hypot(wx, wz);
        const slow = f.spin > 0 ? 0.55 : f.charge > 0 ? 0.7 : 1;
        if (l > 0) {
          wx = (wx / l) * SPEED * slow;
          wz = (wz / l) * SPEED * slow;
        }
        if (this.jumpPressed && f.onGround && f.stun <= 0) {
          this.sfx.jump();
          f.vel.y = JUMP_V * this.rules.jump;
          f.onGround = false;
        }
        this.jumpPressed = false;
        this.act(f, this.firePressed, this.fireHeld);
        this.firePressed = false;
        this.physics(f, wx, wz, dt);
      }
      // Lava?
      if (f.alive && f.pos.y < this.lavaY + 0.3) {
        const by = f.lastHitBy && this.time - f.lastHitT < 6 ? f.lastHitBy : null;
        this.eliminate(f, by, true);
      }
      // Figur bewegen
      const dCam = this.camera.position.distanceTo(f.pos);
      if (f.bot) {
        f.mesh.visible = dCam < 150;
        const near = dCam < 55;
        for (const d of f.details) d.visible = near;
        f.label.visible = f.team === 0 || dCam < 80;
      }
      {
        f.mesh.position.copy(f.pos);
        f.mesh.rotation.y = f.yaw + (f.dance > 0 ? (2 - f.dance) * 12 : 0);
        const sp = Math.hypot(f.vel.x, f.vel.z);
        if (f.onGround) f.walk += sp * dt * 2.2;
        const sw = f.onGround && sp > 0.5 ? Math.sin(f.walk) * 0.18 : 0;
        f.feet[0].position.z = -0.05 + sw;
        f.feet[1].position.z = -0.05 - sw;
        f.mesh.position.y += f.onGround ? Math.abs(Math.sin(f.walk)) * 0.06 * Math.min(1, sp / 3) : 0;
        if (f.dance > 0) {
          f.dance -= dt;
          f.mesh.position.y += Math.abs(Math.sin(f.dance * 12)) * 0.35;
          if (Math.random() < 0.2) this.particles.spawn(f.pos.x, f.pos.y + 2, f.pos.z, rand(-1, 1), 1, rand(-1, 1), 0.6, ["#f472b6", "#facc15", "#60a5fa"][Math.floor(Math.random() * 3)], 2);
        }
        const s = f.slots[f.sel];
        f.gun.visible = !!s && isWeapon(s.kind) && dCam < 55;
        f.gun.scale.z = s?.kind === "sniper" ? 1.5 : 1;
        f.label.position.set(f.pos.x, f.pos.y + 2.35, f.pos.z);
      }
    }

    // Bomben
    for (const b of this.bombs) {
      b.t += dt;
      b.vel.y -= GRAV * 0.8 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 6;
      if (Math.random() < 0.5) this.particles.spawn(b.pos.x, b.pos.y + 0.3, b.pos.z, rand(-0.5, 0.5), 1, rand(-0.5, 0.5), 0.3, "#fde047", 0);
      let boom = b.t > 2.5 || b.pos.y < this.floorY();
      if (!boom) boom = this.pillars.some((p) => Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < p.r + 0.2 && b.pos.y < p.top + 0.2);
      if (!boom) boom = this.supported(b.pos.x, b.pos.z, b.pos.y) && b.vel.y < 0 && this.bridges.length > 0 && this.onBridge(b.pos);
      if (!boom)
        boom = this.fighters.some(
          (f) => f.alive && (f !== b.owner || b.t > 0.4) && Math.hypot(b.pos.x - f.pos.x, b.pos.z - f.pos.z) < 0.7 && b.pos.y > f.pos.y && b.pos.y < f.pos.y + 1.8,
        );
      if (boom) {
        this.explode(b);
        this.scene.remove(b.mesh);
        b.t = -1;
      }
    }
    this.bombs = this.bombs.filter((b) => b.t >= 0);
    this.updateProjectiles(dt);
    for (const pad of this.pads) {
      for (const f of this.fighters) {
        if (!f.alive || !f.onGround || f.pos.y > 0.5) continue;
        if (Math.hypot(f.pos.x - pad.x, f.pos.z - pad.z) < 1.1) {
          f.vel.y = 17;
          f.onGround = false;
          this.sfx.boing(this.vol(f.pos, f.bot));
          this.particles.burst(new THREE.Vector3(pad.x, 0.3, pad.z), "#22d3ee", 20, 4, 0.6, 4);
        }
      }
    }
    this.updateChest(dt);

    // Ende?
    const alive = this.aliveFighters();
    if (this.endTimer < 0 && this.aliveTeams() <= 1) this.endTimer = 2.5;
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        for (const a of alive) a.place = 1;
        this.playing = false;
        if (document.pointerLockElement) document.exitPointerLock();
        const ranking = this.fighters
          .map((f) => ({ name: f.name, color: f.color, place: f.place, you: !f.bot, kills: f.kills }))
          .sort((a, b) => a.place - b.place);
        const won = alive.some((a) => a.team === me.team);
        if (won) {
          this.sfx.win();
          this.confetti(new THREE.Vector3(me.pos.x, me.pos.y + 2, me.pos.z), 25);
        }
        this.onEnd({ won, place: me.place, ranking });
        this.emitHud();
      }
    }
  }

  private onBridge(p: THREE.Vector3) {
    for (const b of this.bridges) {
      const rx = p.x - b.sx;
      const rz = p.z - b.sz;
      const along = rx * b.dx + rz * b.dz;
      const side = rx * b.px + rz * b.pz;
      if (along < 0 || along > b.lenH || Math.abs(side) > BRIDGE_W / 2) continue;
      const surf = b.sy + along * b.slope;
      if (p.y < surf + 0.2 && p.y > surf - 0.4) return true;
    }
    return false;
  }

  private updateEffects(dt: number, paused: boolean | undefined) {
    const t = performance.now() / 1000;
    this.lavaTime.value = t;
    this.dayGroup.rotation.y = t * 0.004;
    if (!paused)
      for (const fp of this.fires) {
        if (Math.random() < 0.6) this.particles.spawn(fp.x + rand(-0.3, 0.3), fp.y + 0.3, fp.z + rand(-0.3, 0.3), rand(-0.2, 0.2), rand(1.5, 3), rand(-0.2, 0.2), rand(0.4, 0.8), Math.random() < 0.5 ? "#f97316" : "#fde047", -0.5);
        if (Math.random() < 0.15) this.particles.spawn(fp.x, fp.y + 1.2, fp.z, rand(-0.3, 0.3), rand(0.8, 1.5), rand(-0.3, 0.3), 2.5, "#57534e", -0.2);
      }
    for (const b of this.birds) {
      b.a += b.sp * dt;
      b.g.position.set(Math.sin(b.a) * b.r, b.y + Math.sin(t * 0.7 + b.r) * 2, Math.cos(b.a) * b.r);
      b.g.rotation.y = b.a + (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      const flap = Math.sin(t * 9 + b.r) * 0.6;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    }
    for (const isl of this.islands) isl.m.position.y = isl.y + Math.sin(t * 0.4 + isl.p) * 0.8;
    this.skyTime.value = t;
    this.lavaU.value = this.lavaY;
    for (const r of this.rocks) {
      r.m.rotation.x += dt * r.s;
      r.m.rotation.y += dt * r.s * 0.7;
      r.m.position.y = r.y + Math.sin(t * 0.5 + r.s * 10) * 0.6;
    }
    this.lava.position.y = this.lavaY + Math.sin(t * 0.8) * 0.05;
    this.lavaLight.position.set(0, this.lavaY + 4, 0);
    this.flash.intensity *= Math.exp(-dt * 10);
    if (!paused) {
      // Glut-Funken
      for (let i = 0; i < (this.day ? 0 : 3); i++) {
        const a = rand(0, Math.PI * 2);
        const r = rand(0, this.ringR + 30);
        this.particles.spawn(Math.sin(a) * r, this.lavaY, Math.cos(a) * r, rand(-0.3, 0.3), rand(1.5, 4), rand(-0.3, 0.3), rand(2, 5), Math.random() < 0.5 ? "#fb923c" : "#fde047", -0.2);
      }
      this.particles.update(dt);
    }
    for (const tr of this.tracers) {
      tr.life -= dt;
      (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.life / tr.max);
      if (tr.life <= 0) {
        this.scene.remove(tr.mesh);
        (tr.mesh.material as THREE.Material).dispose();
      }
    }
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    for (const fl of this.floaters) {
      fl.life -= dt;
      fl.sprite.position.y += dt * 1.2;
      fl.sprite.material.opacity = Math.min(1, fl.life * 3);
      if (fl.life <= 0) {
        this.scene.remove(fl.sprite);
        fl.sprite.material.map?.dispose();
        fl.sprite.material.dispose();
      }
    }
    this.floaters = this.floaters.filter((fl) => fl.life > 0);
    this.hitTime += dt;
    this.hurt = Math.max(0, this.hurt - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 1.2);
    this.recoil *= Math.exp(-dt * 12);
  }

  private updateCamera(dt: number) {
    const me = this.fighters[0];
    const s = me?.slots[me.sel];
    const zoomOn = this.zoom && s?.kind === "sniper" && me.alive;
    const targetFov = zoomOn ? 20 : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
    this.camera.updateProjectionMatrix();

    if (this.playing && me?.alive) {
      const sp = Math.hypot(me.vel.x, me.vel.z);
      if (me.onGround) this.bob += sp * dt * 1.6;
      const bobY = me.onGround ? Math.sin(this.bob * 2) * 0.04 * Math.min(1, sp / SPEED) : 0;
      this.camera.position.set(
        me.pos.x + rand(-1, 1) * this.shake * 0.3,
        me.pos.y + EYE + bobY + rand(-1, 1) * this.shake * 0.3,
        me.pos.z + rand(-1, 1) * this.shake * 0.3,
      );
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.set(me.pitch + this.recoil * 0.03, me.yaw, 0);

      // Hand-Gegenstand
      for (const k in this.viewModels) this.viewModels[k].visible = false;
      const vm = this.viewModels[s ? s.kind : "none"];
      const tp = (this.thirdPerson || me.dance > 0 || me.glide) && !zoomOn;
      me.mesh.visible = tp;
      if (tp) {
        const eye = this.camera.position.clone();
        const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
        const want = eye.clone().addScaledVector(fwd(me.yaw, me.pitch), me.glide ? -8 : -4).addScaledVector(right, 0.9).add(new THREE.Vector3(0, me.glide ? 2.5 : 0.4, 0));
        const d = want.clone().sub(eye);
        let len = d.length();
        d.normalize();
        for (const p of this.pillars) len = Math.min(len, rayPillar(eye, d, p) - 0.3);
        this.camera.position.copy(eye).addScaledVector(d, Math.max(0.3, len));
      }
      vm.visible = !tp && !(zoomOn && this.camera.fov < 40);
      const spinner = vm.getObjectByName("spin");
      if (spinner) spinner.rotation.z += me.spin * dt * 40;
      const arrow = vm.getObjectByName("arrow");
      if (arrow) {
        arrow.position.z = me.charge * 0.25;
        arrow.visible = me.cd <= 0.05;
      }
      this.vmRoot.position.set(0.3 + Math.cos(this.bob) * 0.01, -0.28 + bobY * 0.4 - (s ? 0 : 1), -0.72 + this.recoil * 0.08);
      this.vmRoot.rotation.set(this.recoil * 0.25, 0, 0);
    } else {
      const mate = this.playing && me && !me.alive ? this.fighters.find((o) => o.alive && o.team === me.team) : undefined;
      if (mate) {
        const b = fwd(mate.yaw);
        this.camera.position.set(mate.pos.x - b.x * 5, mate.pos.y + 3.2, mate.pos.z - b.z * 5);
        this.camera.lookAt(mate.pos.x, mate.pos.y + 1.4, mate.pos.z);
      } else {
        // Kamera kreist über der Arena (Menü oder Zuschauen)
        this.orbit += dt * 0.12;
        const big = this.ringR > 30;
        const cx = this.mode === "br" && this.playing ? this.storm.x : 0;
        const cz = this.mode === "br" && this.playing ? this.storm.z : 0;
        const R = big ? 45 : this.ringR + 16;
        this.camera.position.set(cx + Math.sin(this.orbit) * R, big ? 48 : 30, cz + Math.cos(this.orbit) * R);
        this.camera.lookAt(cx, this.flat ? 2 : 15, cz);
      }
      for (const k in this.viewModels) this.viewModels[k].visible = false;
    }
  }

  private followShadow() {
    this.skyMesh.position.copy(this.camera.position);
    this.realSky.position.copy(this.camera.position);
    const me = this.fighters[0];
    const c = this.playing && me?.alive ? me.pos : new THREE.Vector3(this.camera.position.x * 0.5, 0, this.camera.position.z * 0.5);
    this.sunLight.position.copy(this.lightDir).multiplyScalar(120).add(c);
    this.sunLight.target.position.copy(c);
    this.sunLight.target.updateMatrixWorld();
  }

  private emitHud() {
    const me = this.fighters[0];
    if (!me) return;
    const s = me.slots[me.sel];
    this.onHud({
      playing: this.playing,
      locked: this.locked,
      dead: !me.alive,
      place: me.place,
      hp: Math.max(0, Math.round(me.hp)),
      shield: Math.round(me.shield),
      day: this.day,
      theme: this.real ? "real" : this.day ? "sky" : "night",
      mode: this.mode,
      teams: this.aliveTeams(),
      teamSize: this.teamSize,
      mates: this.fighters
        .filter((o) => o.team === me.team && o !== me)
        .map((o) => ({ name: o.name, color: o.color, hp: Math.max(0, Math.round(o.hp)), shield: Math.round(o.shield), alive: o.alive })),
      storm:
        this.mode !== "br"
          ? ""
          : this.storm.dur > 0
            ? "🌪️ Der Sturm zieht sich zusammen!"
            : this.storm.r > 0.5
              ? `🌪️ Sturm schrumpft in ${Math.max(0, Math.ceil(this.storm.nextAt - this.time))} s`
              : "",
      inStorm: this.mode === "br" && me.alive && !me.glide && Math.hypot(me.pos.x - this.storm.x, me.pos.z - this.storm.z) > this.storm.r,
      gliding: me.glide,
      kills: me.kills,
      banner: this.time - this.banner.t < 2.2 ? this.banner.text : "",
      muted: this.sfx.muted,
      slots: me.slots.map((x) => (x ? { ...x } : null)),
      sel: me.sel,
      nextItem: Math.max(0, Math.ceil(this.nextItem - this.time)),
      alive: this.aliveFighters().length,
      total: this.fighters.length,
      zoom: this.zoom && s?.kind === "sniper" && me.alive && this.camera.fov < 40,
      hit: this.hitTime < 0.2,
      headshot: this.headshot,
      hurt: this.hurt,
      reload: s && isWeapon(s.kind) && WEAPON[s.kind].cd >= 0.8 ? clamp(me.cd / WEAPON[s.kind].cd, 0, 1) : 0,
      charge: s?.kind === "bow" ? me.charge : s?.kind === "minigun" ? me.spin : 0,
      lava: this.lavaActive() && this.time < (this.rules.lavaStart ?? this.diff.lavaStart) + 4,
      feed: this.feed.filter((f) => this.time - f.t < 8).map((f) => f.text),
    });
  }
}
