// The matchday scene's moving parts as pure functions of time (spec: docs/superpowers/specs/2026-10-16-matchday-scene-design.md
// and 2026-10-17-scene-2-design.md). components/Scene.tsx draws the layers from public/art/scene/ (made by art/scene.py);
// everything here decides where and when: the whole-number scale that keeps the pixel art crisp, parallax, the crowd's
// frames and its Mexican wave, camera flashes, flares and their smoke, confetti, twinkling stars, scrolling LEDs, the
// players jogging and breathing, and dust drifting through the light. No randomness at run time: the same time gives the
// same picture, so tests can pin it down.

export type Composition = "wide" | "tall";
export type Mood = "normal" | "calm" | "hype";
export type SceneMeta = {
  w: number; h: number;
  view: [number, number, number, number];   // the visible window inside the art: x, y, w, h (the rest is margin)
  margin: [number, number];                 // the margin around it: parallax uses PARALLAX of it, the fit may show the rest
  focus: [number, number];                  // the point of the view kept on screen when cropping
  horizon: number;
  lamps: [number, number, number, number][];   // x, y, glow radius, strength
  seats: [number, number, number][];           // supporters for the camera flashes: x, y, width in art pixels
  players: [number, number, number, number][];   // the foreground players and the ball: x, y, w, h
  stars: [number, number, number][];              // x, y, brightness 0-2
  ribbons: Ribbon[];                              // the LED boards and ribbons, scrolled underneath the back layer
  flares: [number, number][];                     // supporters' flares in the stands, art pixels
  field: FieldSprite[];                           // the players up the pitch, furthest first
};
/** An LED board: its rows in the picture, and its tiling strip of text (rows sy.. in the strips image). */
export type Ribbon = { y: number; h: number; sy: number; period: number; speed: number };
/** A player up the pitch: his row in the sprite sheet (cell: x, y, w, h of the first frame; then FIELD_FRAMES facing
 *  right and as many facing left), where his feet are on the pitch at home, and pixels per metre along it there. */
export type FieldSprite = FieldMover & {
  z: number; ppm: number; feet: [number, number]; cell: [number, number, number, number]; anchor: [number, number]; kind: string;
};
export const FIELD_FRAMES = 6;

/** The nearest layer's largest parallax shift, in art pixels; other layers move a share of it (LAYER_DEPTH). */
export const PARALLAX = { x: 6, y: 4 } as const;
export const LAYER_DEPTH = { sky: 0.12, back: 0.25, pitch: 0.45, players: 0.5, front: 1 } as const;

export function pickComposition(width: number, height: number): Composition {
  return width / height >= 0.85 ? "wide" : "tall";
}

/** Cover the screen at a whole-number scale (every art pixel an exact square of device pixels), keeping the focus
 *  point in place. The visible window may spill into the part of the margin that parallax doesn't need, so a screen
 *  slightly bigger than an exact multiple still gets the smaller scale instead of a jump to the next one. */
export function coverFit(width: number, height: number, meta: SceneMeta) {
  const sx = meta.margin[0] - PARALLAX.x, sy = meta.margin[1] - PARALLAX.y;
  const [vx, vy, vw, vh] = [meta.view[0] - sx, meta.view[1] - sy, meta.view[2] + 2 * sx, meta.view[3] + 2 * sy];
  const scale = Math.max(1, Math.ceil(Math.max(width / vw, height / vh)));
  const fx = meta.view[0] + meta.view[2] * meta.focus[0], fy = meta.view[1] + meta.view[3] * meta.focus[1];
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const dx = Math.round(clamp(width * meta.focus[0] - fx * scale, width - (vx + vw) * scale, -vx * scale));
  const dy = Math.round(clamp(height * meta.focus[1] - fy * scale, height - (vy + vh) * scale, -vy * scale));
  return { scale, dx, dy };
}

/** A layer's offset in device pixels: mostly the pointer (-1..1 each way), plus a slow camera drift. */
export function parallax(depth: number, px: number, py: number, t: number, scale: number) {
  const mix = (p: number, drift: number) => Math.max(-1, Math.min(1, p * 0.75 + drift * 0.25));
  const x = mix(px, Math.sin(t * 0.13)) * PARALLAX.x * depth * scale;
  const y = mix(py, Math.cos(t * 0.11)) * PARALLAX.y * depth * scale;
  return { x: Math.round(x), y: Math.round(y) };
}

function hash(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Which crowd frame shows (0 = everyone still, 1-3 = different supporters up). Settled after a missed chance,
 *  swaying normally, and in a frenzy after a rare answer, at the game's own beat. */
export function crowdFrame(mood: Mood, beatMs: number, t: number): number {
  if (mood === "calm") return 0;
  if (mood === "hype") {
    const step = Math.floor(t / Math.max(0.07, (beatMs || 600) / 3000));
    return 1 + Math.floor(hash(step + 7) * 3);
  }
  const step = Math.floor(t / 0.34);
  const h = hash(step);
  return h < 0.35 ? 0 : 1 + Math.floor(((h - 0.35) / 0.65) * 3);
}

const FLASH_RATE: Record<Mood, number> = { calm: 0.6, normal: 5, hype: 18 };   // per second
const FLASH_LIFE = 0.16;

/** Camera flashes popping in the stands right now: which seat, and how far through its short life (0..1). */
export function activeFlashes(mood: Mood, t: number, seats: SceneMeta["seats"]) {
  const rate = FLASH_RATE[mood];
  const out: { seat: number; age: number }[] = [];
  if (!seats.length) return out;
  for (let k = Math.floor((t - FLASH_LIFE) * rate) - 1; k <= Math.floor(t * rate); k++) {
    const start = (k + hash(k * 3 + 1) * 0.9) / rate;
    const age = (t - start) / FLASH_LIFE;
    if (age >= 0 && age <= 1) out.push({ seat: Math.floor(hash(k * 3 + 2) * seats.length), age });
  }
  return out.slice(0, 12);
}

/** The players breathe in and out every 1.7 s; the grass in front of the lens sways on its own rhythm. */
export function breathFrame(t: number): 0 | 1 {
  return (Math.floor(t / 1.7) % 2) as 0 | 1;
}

export function swayFrame(t: number): 0 | 1 {
  return (Math.floor((t + 0.4) / 1.15) % 2) as 0 | 1;
}

/** Dust drifting through the floodlight, in art pixels: wraps around so it never leaves the picture. */
export function dustAt(t: number, n: number, w: number, h: number) {
  return Array.from({ length: n }, (_, i) => {
    const vx = 1.5 + hash(i * 5 + 1) * 4;
    const x = (((hash(i * 5 + 2) * w + vx * t) % w) + w) % w;
    const y = (((hash(i * 5 + 3) * h * 0.8 + Math.sin(t * 0.5 + i) * 5 - t * (0.4 + hash(i * 5 + 4))) % h) + h) % h;
    return { x, y, a: 0.2 + 0.5 * Math.abs(Math.sin(t * 0.8 + i * 1.7)) };
  });
}

/** A player up the pitch, as art/scene.py describes him: his home spot and how far and fast he runs (metres). */
export type FieldMover = { home: number; range: number; speed: number; seed: number };
const CYCLE = 5;          // seconds: rest, jog to a new spot, rest
const STRIDE = 0.55;      // metres covered per running frame
const target = (p: FieldMover, k: number) => p.home + p.range * (2 * hash(p.seed * 7919 + k) - 1);

/** Where a player up the pitch is (metres along it), which way he faces, and his frame: 0-1 resting (breathing),
 *  2-5 running. Each cycle he rests, jogs to a new spot near home, and rests again; resting, he faces the ball. */
export function fieldState(p: FieldMover, t: number): { x: number; dir: 1 | -1; frame: number } {
  const tt = t + hash(p.seed * 31) * CYCLE;
  const k = Math.floor(tt / CYCLE), u = tt - k * CYCLE;
  const a = target(p, k - 1), b = target(p, k);
  const start = 0.4 + 1.8 * hash(p.seed * 131 + k);
  const end = Math.min(start + Math.abs(b - a) / p.speed, CYCLE - 0.2);
  const ball: 1 | -1 = p.home < 0 ? 1 : -1;
  const rest = (x: number) => ({ x, dir: ball, frame: Math.floor(tt / 1.7) % 2 });
  if (u <= start) return rest(a);
  if (u >= end) return rest(b);
  const x = a + (b - a) * ((u - start) / (end - start));
  return { x, dir: b > a ? 1 : -1, frame: 2 + (Math.floor(Math.abs(x - a) / STRIDE) % 4) };
}

/** How far an LED strip has scrolled, in whole art pixels within its period. */
export function ribbonOffset(t: number, speed: number, period: number): number {
  return ((Math.floor(t * speed) % period) + period) % period;
}

export const WAVE_HALF = 22;    // half the width of the Mexican wave, in art pixels
const WAVE: Record<Mood, { every: number; lasts: number } | null> = {
  calm: null, normal: { every: 26, lasts: 7 }, hype: { every: 9, lasts: 4.5 },
};

/** The centre column of the Mexican wave going round the stands right now, or null between waves. */
export function waveAt(mood: Mood, t: number, width: number): number | null {
  const w = WAVE[mood];
  if (!w) return null;
  const u = (t % w.every) / w.lasts;
  return u > 1 ? null : -WAVE_HALF + u * (width + 2 * WAVE_HALF);
}

/** A star's brightness (0.15-1): each one breathes at its own pace, and now and then glints. */
export function twinkle(i: number, t: number): number {
  const slow = 0.5 + 0.5 * Math.sin(t * (0.7 + 1.6 * hash(i * 5 + 1)) + hash(i * 5 + 2) * 6.28);
  const glint = Math.max(0, Math.sin(t * 0.9 + hash(i * 5 + 3) * 40)) ** 24;
  return Math.min(1, 0.15 + 0.6 * slow + 0.25 * glint);
}

/** A flare's brightness (0.55-1): fast, uneven flicker. */
export function flareFlicker(k: number, t: number): number {
  const n = Math.sin(t * 23 + k * 1.7) * 0.5 + Math.sin(t * 37.3 + k * 4.1) * 0.3 + Math.sin(t * 7.1 + k) * 0.2;
  return 0.775 + 0.225 * n;
}

/** How many of the flares burn: two smoulder after a miss, more normally, every one after a rare answer. */
export function litFlares(mood: Mood, count: number): number {
  return Math.min(count, mood === "calm" ? 2 : mood === "hype" ? count : 3);
}

const SMOKE_LIFE = 4.5;

/** Smoke from flare k: puffs rising and drifting with the wind, growing and fading; offsets in art pixels. */
export function smokeAt(t: number, k: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const age = (t + (i / n) * SMOKE_LIFE + hash(k * 977) * SMOKE_LIFE) % SMOKE_LIFE;
    const s = age / SMOKE_LIFE;
    const rise = 6 + 4 * hash(k * 31 + i);
    return {
      dx: age * (2 + 2 * hash(k * 53 + i)) + Math.sin(age * 1.4 + i) * 1.5,
      dy: -Math.min(60, age * rise),
      size: 1 + Math.min(3, Math.floor(s * 4)),
      a: 0.55 * Math.min(1, age * 3) * (1 - s),
    };
  });
}

/** Confetti after a rare answer: n pieces tumbling down through the picture, in one of four colours; in art pixels. */
export function confettiAt(t: number, n: number, w: number, h: number) {
  return Array.from({ length: n }, (_, i) => {
    const fall = 14 + 12 * hash(i * 7 + 1);
    const x = (((hash(i * 7 + 2) * w + Math.sin(t * (1.5 + hash(i * 7 + 3)) + i) * 4) % w) + w) % w;
    const y = (hash(i * 7 + 4) * h + fall * t) % h;
    return { x, y, c: Math.floor(hash(i * 7 + 5) * 4), wide: (Math.floor(t * 8 + i) % 2) === 0 };
  });
}
