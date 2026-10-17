// The matchday scene's moving parts as pure functions of time (spec: docs/superpowers/specs/2026-10-16-matchday-scene-design.md).
// components/Scene.tsx draws the layers from public/art/scene/ (made by art/scene.py); everything here decides where
// and when: the whole-number scale that keeps the pixel art crisp, parallax, the crowd's frames, camera flashes,
// the players breathing and dust drifting through the light. No randomness at run time: the same time gives the
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
  players: [number, number, number, number][];
};

/** The nearest layer's largest parallax shift, in art pixels; other layers move a share of it (LAYER_DEPTH). */
export const PARALLAX = { x: 6, y: 4 } as const;
export const LAYER_DEPTH = { back: 0.25, pitch: 0.45, players: 0.5, front: 1 } as const;

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
