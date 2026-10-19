"use client";

// The tier reveal, Tunnel 3.0 (specs: docs/superpowers/specs/2026-10-16-matchday-scene-design.md and
// 2026-10-17-scene-2-design.md): a first-person run down a stadium tunnel. A football smashes through one gate per
// tier, faster at each gate, and the tunnel beyond takes the next tier's colour; after the last gate the camera walks
// out into the stadium from the site background.
//
// The tunnel is ray-cast per pixel into an image buffer, sampling weathered surfaces baked when the run starts
// (lib/reveal/walls.ts: brick where the plaster fell, cracks, stains, grime, puddles and rubble, and jerseys, team
// photos, posters, scarves, exit signs, extinguishers and a pipe on the walls), with steel ribs (some lamps dead or
// flickering), a strip light along the ceiling and a guide line on the floor; the gates are bricks in a steel frame
// with hazard stripes. Ordered dithering keeps it pixel art. A "THIS IS FUTKRILL" sign hangs before the last gate.
// Every run ends with a tease (lib/reveal/timeline.ts): the ball rams a gate, bounces back, rams it again and pushes
// while time slows, the picture trembles, chips trickle off and light leaks through the spreading cracks. On a break the
// gate gives and the ball walks out; on a hold (it was the next tier's gate) it bounces off and drops to the floor.
// Each smash: cracks spread as the ball closes in, then a hit-stop freeze, a camera punch and jolt, the ball squashing, a zoom burst, an impact star, a shockwave, sparks, polygon shards,
// tumbling bricks, dust, crumbs falling from the ceiling, the lights surging and flickering, a tier-tinted flash and a
// colour split; from gate 5 electric arcs, from 6 embers, and at 7 gold lightning and confetti. It hits harder the
// deeper the gate. About 200 canvas pixels on the short side, scaled up crisp by CSS.

import { useEffect, useRef } from "react";

import { camBack, clockRate, crackAt, depthAt, type Outcome, revealTimeline, strainAt, teaseOutcome, TEMPO } from "@/lib/reveal/timeline.ts";
import { ballDrop, bolt, EXIT, FOCAL, GAP, hitStopMs, HW, LEAD, settleCam, tierEffects, VIEW } from "@/lib/reveal/tunnel.ts";
import { buildSurfaces, F_DECAL, F_EMISSIVE, F_PATCH, F_PUDDLE, TPU, type Surface } from "@/lib/reveal/walls.ts";
import { pickComposition, type SceneMeta } from "@/lib/scene/engine.ts";
import { TIER_COLORS, TIERS } from "@/lib/tiers.ts";

const BALL_R = 0.11;
const BALL_Y = 0.16;        // the ball flies a little below the centre line, and hits the gate there
const CRACK_RANGE = 1.3;    // cracks start spreading when the ball is this close to a gate
// Effect timings follow the run's tempo (80% speed).
const RING_MS = 300 / TEMPO;
const HOLE_MS = 150 / TEMPO;        // the hole in a smashed gate blows open over this long
const PUNCH_MS = 220 / TEMPO;
const SQUASH_MS = 90 / TEMPO;
const SHAKE_MS = 320 / TEMPO;
const SPLIT_MS = 150;               // the colour-split flash after a smash
const SETTLE_MS = 900 / TEMPO;      // the walkout into the stadium after the last smash
const LANDED_DELAY_MS = 140;        // the white flash shows before the banner
const STOP_AFTER_MS = 2600;         // the loop stops this long after landing; the last frame stays
const SHORT_SIDE = 200;             // canvas pixels on the screen's short side
const BURST_MS = 170 / TEMPO;       // the zoom burst after a smash
const STAR_MS = 240 / TEMPO;        // the impact star
const SURGE_MS = 380 / TEMPO;       // the lights surge, then stutter, after a smash
const ARC_MS = 520 / TEMPO;         // electric arcs (gate 5 and up)
const SIGN_TEXT = "THIS IS FUTKRILL";

type Rgb = [number, number, number];
type Debris = { kind: "brick" | "chip" | "dust" | "shard" | "crumb"; x: number; y: number; z: number; vx: number; vy: number;
                vz: number; size: number; rot: number; spin: number; c: Rgb; edge: Rgb; born: number; life: number;
                shape?: [number, number][] };
type Mote = { kind: "ember" | "confetti"; x: number; y: number; vx: number; vy: number; c: Rgb; born: number; life: number; ph: number };
type Bolt = { pts: [number, number][]; born: number; life: number; c: Rgb; glow: Rgb };
type Spark = { x: number; y: number; vx: number; vy: number; c: string; born: number; life: number };
type Smash = { gate: number; at: number };

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb, alpha = 1) => (alpha >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`);
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const DUST: Rgb = [150, 140, 128];
const CONCRETE: Rgb = [62, 68, 90];
const STEEL: Rgb = [118, 126, 150];
const FLOOR: Rgb = [38, 40, 54];
const GUIDE: Rgb = [206, 212, 222];
const RUST: Rgb = [122, 66, 32];
const GOLD: Rgb = [255, 206, 72];
const CONFETTI: Rgb[] = [GOLD, WHITE, [255, 236, 160], [214, 150, 40]];
const PALETTE = Object.fromEntries(Object.entries(TIER_COLORS).map(([k, v]) => [k, {
  wall: hex(v.wall), stripe: hex(v.stripe), light: hex(v.light),
}])) as Record<number, { wall: Rgb; stripe: Rgb; light: Rgb }>;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // roughly -1..1, centre-heavy
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const fract = (v: number) => v - Math.floor(v);
const hash2 = (a: number, b: number) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Pentagon centres of a football: the 12 vertices of an icosahedron.
const PHI = (1 + Math.sqrt(5)) / 2;
const PATCHES = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0],
  [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map(([x, y, z]) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
});

// 3x5 letters for the "THIS IS FUTKRILL" sign.
const GLYPHS: Record<string, string[]> = {
  T: ["###", ".#.", ".#.", ".#.", ".#."], H: ["#.#", "#.#", "###", "#.#", "#.#"], I: ["###", ".#.", ".#.", ".#.", "###"],
  S: ["###", "#..", "###", "..#", "###"], F: ["###", "#..", "##.", "#..", "#.."], U: ["#.#", "#.#", "#.#", "#.#", "###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"], R: ["##.", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
  " ": ["...", "...", "...", "...", "..."],
};

/** The sign over the tunnel before the last gate: white pixel letters on navy, in a gold frame. */
function makeSign(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIGN_TEXT.length * 4 + 7;
  c.height = 13;
  const g = c.getContext("2d");
  if (!g) return c;
  g.fillStyle = "#7a5a10"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#ffce48"; g.fillRect(1, 1, c.width - 2, c.height - 2);
  g.fillStyle = "#101530"; g.fillRect(2, 2, c.width - 4, c.height - 4);
  [...SIGN_TEXT].forEach((ch, k) => {
    const glyph = (GLYPHS[ch] ?? GLYPHS[" "]).join("");
    for (let i = 0; i < 15; i++) {
      if (glyph[i] !== "#") continue;
      const x = 4 + k * 4 + (i % 3), y = 4 + Math.floor(i / 3);
      g.fillStyle = "#7a5a10"; g.fillRect(x, y + 1, 1, 1);
      g.fillStyle = "#ffffff"; g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

/** Fill a triangle with whole pixels, row by row (crisp, unlike a canvas path). */
function fillTri(ctx: CanvasRenderingContext2D, p: [number, number][]) {
  const [a, b, c] = [...p].sort((u, v) => u[1] - v[1]);
  const edge = (p0: [number, number], p1: [number, number], y: number) =>
    p1[1] === p0[1] ? p0[0] : p0[0] + ((p1[0] - p0[0]) * (y - p0[1])) / (p1[1] - p0[1]);
  const y0 = Math.max(0, Math.ceil(a[1])), y1 = Math.min(ctx.canvas.height, Math.floor(c[1]));   // only rows on the canvas
  for (let y = y0; y <= y1; y++) {
    const xa = edge(a, c, y);
    const xb = y < b[1] ? edge(a, b, y) : edge(b, c, y);
    const x0 = Math.round(Math.min(xa, xb)), x1 = Math.round(Math.max(xa, xb));
    ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1);
  }
}

/** Spider cracks for one gate, in wall units from the impact point: a few jagged lines, each a list of points. */
function makeCracks(): [number, number][][] {
  return Array.from({ length: 10 }, (_, i) => {
    let a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
    let x = 0, y = 0;
    const len = 0.5 + Math.random() * 0.9;
    const pts: [number, number][] = [[0, 0]];
    for (let k = 0; k < 8; k++) {
      a += (Math.random() - 0.5) * 0.8;
      x += Math.cos(a) * len / 8;
      y += Math.sin(a) * len / 8;
      pts.push([x, y]);
    }
    return pts;
  });
}

/** The stadium for the walkout: the site's own scene at rest (art/scene.py's "still" picture) as pixels, ready to sample. */
async function loadStadium(w: number, h: number) {
  const name = pickComposition(w, h);
  const meta = await fetch(`/art/scene/${name}.json`).then((r) => r.json() as Promise<SceneMeta>);
  const layers = await Promise.all(["still"].map((l) => new Promise<HTMLImageElement>((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = fail;
    im.src = `/art/scene/${name}-${l}.png`;
  })));
  const off = document.createElement("canvas");
  off.width = meta.w; off.height = meta.h;
  const c = off.getContext("2d");
  if (!c) throw new Error("no 2d context");
  for (const im of layers) c.drawImage(im, 0, 0);
  return { meta, px: new Uint32Array(c.getImageData(0, 0, meta.w, meta.h).data.buffer) };
}

export default function TunnelReveal({ tier, outcome, onSmash, onLanded }: {
  tier: number; outcome?: Outcome;      // break or hold at the tease: random unless given (the preview page)
  onSmash?: (gate: number, last: boolean) => void; onLanded: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef(false);
  const callbacks = useRef({ onSmash, onLanded });
  useEffect(() => { callbacks.current = { onSmash, onLanded }; });   // the latest callbacks, without restarting the run

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    const scale = Math.max(2, Math.min(box.width, box.height) / SHORT_SIDE);
    const W = Math.max(40, Math.round(box.width / scale));
    const H = Math.max(40, Math.round(box.height / scale));
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;                  // after resizing: that resets the context
    const CX = W / 2;
    const VY = H / 2;
    const F0 = FOCAL * W;                               // focal length: the tunnel fills the width just ahead
    const HH = (HW * H) / W;                            // a cross-section the shape of the screen
    const PX = W / 160;                                 // screen-space speeds scale with the canvas
    const tl = revealTimeline(tier, outcome ?? teaseOutcome(tier, Math.random()));
    const broke = tl.outcome === "break";                // through the last gate and out, or held at the next tier's
    const G = tl.teaseGate;
    const exitZ = tl.tier * GAP + EXIT;
    const segOf = (z: number) => (broke && z > tl.tier * GAP ? tl.tier : Math.min(7, Math.max(1, Math.ceil(z / GAP - 1e-9))));
    const surf = buildSurfaces({ length: (broke ? exitZ : G * GAP) + 0.6, hh: HH, gap: GAP, palette: (z) => PALETTE[segOf(z)] });
    const sign = makeSign();
    const signZ = G * GAP - 0.55;                        // hung from the ceiling just before the gate it rams
    const FALL = HH - BALL_R - BALL_Y;                   // from the flight line down to resting on the floor
    const icons = TIERS.map((t) => Object.assign(new Image(), { src: t.icon }));
    const cracks = Array.from({ length: 8 }, makeCracks);
    const jags = Array.from({ length: 8 }, () => Array.from({ length: 22 }, () => 0.7 + Math.random() * 0.6));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const image = ctx.createImageData(W, H);
    const buf = new Uint32Array(image.data.buffer);
    let stadium: Awaited<ReturnType<typeof loadStadium>> | null = null;
    loadStadium(W, H).then((s) => { stadium = s; }).catch(() => { /* the walkout falls back to plain light */ });

    let t0 = performance.now();
    let last = t0;
    let smashed = 0;
    let rammed = 0;
    let bounced = false;
    let landed = false;
    let raf = 0;
    let F = F0;
    let freezeUntil = 0;
    let shake = { amp: 0, at: 0 };
    let flash = { amp: 0, at: 0, ms: 120, c: WHITE };
    let split = { amp: 0, at: -1e9 };
    let lastHit = { gate: 0, at: -1e9, k: 1 };          // the last smash or ram: the ball squashes, the camera punches in
    let surge = { amp: 0, at: -1e9 };
    let arcs = { amt: 0, at: -1e9, gate: 1 };
    let burst = { amt: 0, at: -1e9 };
    let star = { amt: 0, at: -1e9, c: WHITE };
    const debris: Debris[] = [];
    const sparks: Spark[] = [];
    const smashes: Smash[] = [];
    const rings: Smash[] = [];                          // shockwaves, on smashes and rams
    const motes: Mote[] = [];
    const bolts: Bolt[] = [];

    const skipToEnd = (now: number, withFlash: boolean) => {
      t0 = now - (tl.landAt + SETTLE_MS);
      smashed = tl.tier;                                  // no debris for the gates jumped over
      rammed = tl.rams.length;
      bounced = true;
      debris.length = 0;
      sparks.length = 0;
      smashes.length = 0;
      rings.length = 0;
      motes.length = 0;
      bolts.length = 0;
      freezeUntil = 0;
      flash = { amp: withFlash ? 1 : 0, at: tl.landAt + SETTLE_MS, ms: 300, c: WHITE };
    };
    if (reduce) skipToEnd(t0, false);
    const onKey = (e: KeyboardEvent) => { if (!landed && (e.key === "Enter" || e.key === " ")) skipRef.current = true; };
    window.addEventListener("keydown", onKey);

    const power = (gate: number) => 0.6 + 0.4 * (gate / 7);      // deeper gates break harder

    /** Camera shake on every hit: the whole picture jolts and rolls, then settles; harder for deeper gates.
     *  On the element itself (compositor-only transforms), on top of the jitter inside the picture. */
    const jolt = (gate: number, final: boolean, k = 1) => {
      if (reduce || !canvas.animate) return;
      const a = (5 + gate * 1.6 + (final ? 7 : 0)) * k;       // CSS pixels
      const r = (0.6 + gate * 0.15 + (final ? 0.9 : 0)) * k; // degrees of roll
      const at = (x: number, y: number, deg: number) => ({ transform: `translate(${x}px, ${y}px) rotate(${deg}deg) scale(1.06)` });
      canvas.animate([at(0, 0, 0), at(-a, a * 0.6, -r), at(a * 0.8, -a * 0.5, r * 0.8), at(-a * 0.45, a * 0.3, -r * 0.4),
                      at(a * 0.2, -a * 0.1, r * 0.15), at(0, 0, 0)],
                     { duration: SHAKE_MS, easing: "ease-out" });
    };

    const spawn = (gate: number, t: number, big: boolean) => {
      const p = PALETTE[gate];
      const k = power(gate);
      const z = gate * GAP;
      const piece = (spread: number) => {
        const x = Math.max(-HW, Math.min(HW, gauss() * HW * spread));
        const y = Math.max(-HH, Math.min(HH, BALL_Y + gauss() * HH * spread));
        return { x, y, dx: x, dy: y - BALL_Y };
      };
      for (let i = 0; i < Math.round(110 * k); i++) {         // chunky bricks, tumbling towards us
        const { x, y, dx, dy } = piece(0.7);
        const r = Math.random();
        const c = r < 0.55 ? p.wall : r < 0.85 ? p.stripe : p.light;
        debris.push({ kind: "brick", x, y, z, born: t, life: 1500, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 24,
                      size: (0.045 + Math.random() * 0.1) * (0.8 + 0.4 * k),
                      vx: dx * (2 + Math.random() * 4) + gauss() * 0.4, vy: dy * (2 + Math.random() * 4) - Math.random() * 0.9,
                      vz: -(1.5 + Math.random() * 4.5) * k, c, edge: mix(c, BLACK, 0.55) });
      }
      for (let i = 0; i < Math.round(220 * k); i++) {         // fine chips
        const { x, y, dx, dy } = piece(1);
        const r = Math.random();
        const c = r < 0.12 ? WHITE : r < 0.35 ? p.light : r < 0.7 ? p.wall : p.stripe;
        debris.push({ kind: "chip", x, y, z, born: t, life: 1200, rot: 0, spin: 0, size: 0.022,
                      vx: dx * (1 + Math.random() * 3), vy: dy * (1 + Math.random() * 3) - Math.random() * 0.5,
                      vz: -(0.8 + Math.random() * 3.2), c, edge: c });
      }
      for (let i = 0; i < Math.round(36 * k); i++) {          // dust puffs that hang and fade
        const { x, y, dx, dy } = piece(0.6);
        debris.push({ kind: "dust", x, y, z, born: t, life: 650 + Math.random() * 450, rot: 0, spin: 0,
                      size: 0.14 + Math.random() * 0.22, vx: dx * 0.7, vy: dy * 0.7 - 0.15, vz: -(0.2 + Math.random() * 0.8),
                      c: mix(DUST, p.wall, 0.35), edge: DUST });
      }
      const bx = CX, by = VY + BALL_Y * (F0 / LEAD);         // where the ball is on screen at impact
      for (let i = 0; i < Math.round(48 * k); i++) {          // sparks flying off the point of impact
        const a = Math.random() * Math.PI * 2;
        const v = (70 + Math.random() * 170) * PX * k;
        sparks.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, born: t, life: 140 + Math.random() * 200,
                      c: css(Math.random() < 0.5 ? WHITE : mix(p.light, WHITE, 0.3)) });
      }
      const fx = tierEffects(gate, big);
      for (let i = 0; i < fx.shards; i++) {                    // angular shards of the gate, spinning out
        const { x, y, dx, dy } = piece(0.6);
        const r = Math.random();
        const c = r < 0.5 ? p.wall : r < 0.8 ? p.light : mix(p.light, WHITE, 0.5);
        const shape = Array.from({ length: 3 }, (_, k) => {
          const a = (k / 3) * Math.PI * 2 + Math.random() * 1.2;
          const rr = 0.5 + Math.random() * 0.6;
          return [Math.cos(a) * rr, Math.sin(a) * rr] as [number, number];
        });
        debris.push({ kind: "shard", x, y, z, born: t, life: 1400, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 18,
                      size: (0.05 + Math.random() * 0.09) * (0.8 + 0.4 * k), shape,
                      vx: dx * (3 + Math.random() * 5) + gauss() * 0.6, vy: dy * (3 + Math.random() * 5) - Math.random() * 1.2,
                      vz: -(2.5 + Math.random() * 5) * k, c, edge: mix(c, WHITE, 0.45) });
      }
      const cam = camZ(t);
      for (let i = 0; i < Math.round(26 * k); i++) {             // the old tunnel shakes: crumbs fall from the ceiling
        debris.push({ kind: "crumb", x: (Math.random() * 2 - 1) * HW * 0.95, y: -HH + 0.02, z: cam + 0.5 + Math.random() * 3,
                      born: t + Math.random() * 160, life: 1700, rot: 0, spin: 0, size: 0.018 + Math.random() * 0.02,
                      vx: gauss() * 0.1, vy: Math.random() * 0.3, vz: 0, c: mix(CONCRETE, WHITE, 0.25 + Math.random() * 0.3), edge: DUST });
      }
      if (fx.embers > 0) {                                       // embers drifting up through the picture
        for (let i = 0; i < Math.round(90 * fx.embers); i++) {
          motes.push({ kind: "ember", x: Math.random() * W, y: H * (0.35 + Math.random() * 0.7), vx: (Math.random() - 0.5) * 14 * PX,
                       vy: -(10 + Math.random() * 26) * PX, c: Math.random() < 0.5 ? [255, 154, 60] : [255, 214, 120],
                       born: t + Math.random() * 300, life: 900 + Math.random() * 900, ph: Math.random() * 6 });
        }
      }
      if (fx.arcs > 0) arcs = { amt: fx.arcs, at: t, gate };
      if (fx.gold) {                                             // gold lightning: three bolts down to the impact
        const iy = VY + BALL_Y * (F0 / LEAD);
        [0, 90, 200].forEach((lag, n) => {
          const x0 = W * (0.2 + 0.3 * n + (Math.random() - 0.5) * 0.15);
          bolts.push({ pts: bolt(x0, -2, CX + (Math.random() - 0.5) * W * 0.1, iy, 0.22, Math.random), born: t + lag, life: 90 + n * 20,
                       c: [255, 244, 200], glow: GOLD });
        });
      }
      if (fx.confetti) {                                         // and gold confetti over the walkout
        for (let i = 0; i < 170; i++) {
          motes.push({ kind: "confetti", x: Math.random() * W, y: -Math.random() * H * 0.9, vx: (Math.random() - 0.5) * 10 * PX,
                       vy: (22 + Math.random() * 30) * PX, c: CONFETTI[i % CONFETTI.length], born: t + Math.random() * 400,
                       life: 2600 + Math.random() * 900, ph: Math.random() * 6 });
        }
      }
      smashes.push({ gate, at: t });
    };

    /** A hit that doesn't get through: chips and dust knocked off the face of the gate, a few bricks, sparks off the
     *  ball and crumbs shaken from the ceiling. `k` scales it. */
    const knock = (gate: number, t: number, k: number) => {
      const p = PALETTE[gate];
      const z = gate * GAP - 0.03;
      const chip = (life: number, speed: number) => {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.22;
        const v = (0.5 + Math.random() * 1.6) * speed;
        const c = Math.random() < 0.15 ? WHITE : Math.random() < 0.6 ? p.wall : p.light;
        debris.push({ kind: "chip", x: Math.cos(a) * r, y: BALL_Y + Math.sin(a) * r, z, born: t, life, rot: 0, spin: 0, size: 0.022,
                      vx: Math.cos(a) * v, vy: Math.sin(a) * v - Math.random() * 0.5, vz: -(0.3 + Math.random() * 1.5) * speed, c, edge: c });
      };
      for (let i = 0; i < Math.round(80 * k); i++) chip(900, 1);
      for (let i = 0; i < Math.round(7 * k); i++) {                // a few bricks knocked loose, dropping off the face
        const r = Math.random();
        const c = r < 0.6 ? p.wall : p.stripe;
        debris.push({ kind: "brick", x: gauss() * 0.35, y: BALL_Y + gauss() * 0.3, z, born: t, life: 1300, rot: Math.random() * 6,
                      spin: (Math.random() - 0.5) * 14, size: 0.04 + Math.random() * 0.05, vx: gauss() * 0.6, vy: -Math.random() * 0.6,
                      vz: -(0.4 + Math.random() * 1.2), c, edge: mix(c, BLACK, 0.55) });
      }
      for (let i = 0; i < Math.round(18 * k); i++) {               // a puff of dust off the point of impact
        const a = Math.random() * Math.PI * 2;
        debris.push({ kind: "dust", x: Math.cos(a) * 0.12, y: BALL_Y + Math.sin(a) * 0.12, z: z - 0.05, born: t,
                      life: 600 + Math.random() * 500, rot: 0, spin: 0, size: 0.1 + Math.random() * 0.16, vx: Math.cos(a) * 0.5,
                      vy: Math.sin(a) * 0.4 - 0.1, vz: -(0.2 + Math.random() * 0.5), c: mix(DUST, p.wall, 0.35), edge: DUST });
      }
      const bx = CX, by = VY + BALL_Y * (F0 / LEAD);
      for (let i = 0; i < Math.round(30 * k); i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (50 + Math.random() * 130) * PX * k;
        sparks.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, born: t, life: 120 + Math.random() * 160,
                      c: css(Math.random() < 0.5 ? WHITE : mix(p.light, WHITE, 0.3)) });
      }
      const cam = camZ(t);
      for (let i = 0; i < Math.round(16 * k); i++) {
        debris.push({ kind: "crumb", x: (Math.random() * 2 - 1) * HW * 0.95, y: -HH + 0.02, z: cam + 0.4 + Math.random() * 2,
                      born: t + Math.random() * 160, life: 1700, rot: 0, spin: 0, size: 0.018 + Math.random() * 0.02,
                      vx: gauss() * 0.1, vy: Math.random() * 0.3, vz: 0, c: mix(CONCRETE, WHITE, 0.25 + Math.random() * 0.3), edge: DUST });
      }
    };

    /** While the ball pushes: the gate crumbling under it, a chip or a spark at a time, more as the strain builds. */
    const trickle = (t: number, dt: number, k: number) => {
      const p = PALETTE[G];
      const n = Math.floor(dt * (30 + 90 * k) + Math.random());
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.08 + Math.random() * 0.2;
        const c = Math.random() < 0.6 ? p.wall : p.light;
        debris.push({ kind: "chip", x: Math.cos(a) * r, y: BALL_Y + Math.sin(a) * r, z: G * GAP - 0.03, born: t, life: 800,
                      rot: 0, spin: 0, size: 0.02, vx: Math.cos(a) * 0.5, vy: 0.2 + Math.random() * 0.4, vz: -(0.2 + Math.random() * 0.6), c, edge: c });
        if (Math.random() < 0.5) {
          const sa = Math.random() * Math.PI * 2, v = (30 + Math.random() * 70) * PX;
          sparks.push({ x: CX, y: VY + BALL_Y * (F0 / LEAD), vx: Math.cos(sa) * v, vy: Math.sin(sa) * v * 0.8, born: t,
                        life: 80 + Math.random() * 120, c: css(mix(p.light, WHITE, 0.5)) });
        }
      }
    };

    const ballZ = (t: number) => (!broke || t <= tl.landAt ? depthAt(tl, t) * GAP : tl.tier * GAP + (t - tl.landAt) * 0.012);
    const camZ = (t: number) => (!broke || t <= tl.landAt ? (depthAt(tl, t) - camBack(tl, t)) * GAP - LEAD
                                                          : settleCam(tl.tier, (t - tl.landAt) / SETTLE_MS));

    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      if (!(n <= 4 * (W + H))) return;                       // never a runaway loop on a wild (or non-finite) point
      for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    };

    /** Write a colour into the buffer, quantised to 20-level steps with ordered dithering (the pixel-art look). */
    const put = (i: number, x: number, y: number, r: number, g: number, b: number) => {
      const d = BAYER[((y & 3) << 2) | (x & 3)];
      const q = (v: number) => Math.max(0, Math.min(255, Math.floor(v / 20 + d) * 20));
      buf[i] = 0xff000000 | (q(b) << 16) | (q(g) << 8) | q(r);
    };

    /** A lamp's state: most burn steadily, a few are dead and a few are on the blink. 1 = fully on. */
    const lampOn = (k: number, t: number) => {
      const h = hash2(k, 11);
      if (h < 0.07) return 0.15;
      if (h < 0.17) return Math.sin(t * 0.021 + k * 7) + Math.sin(t * 0.053 + k) > 0.4 ? 1 : 0.2;
      return 1;
    };
    const texel = (sf: Surface, z: number, across: number) =>
      Math.min(sf.rows - 1, Math.max(0, (across * TPU) | 0)) * sf.cols + Math.min(sf.cols - 1, Math.max(0, (z * TPU) | 0));
    const unpack = (v: number): Rgb => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];

    /** The tunnel itself: walls, ceiling and floor, one ray per pixel (the same maths as castTunnel), up to `limit`.
     *  `surge` brightens every lamp for a moment after a smash. */
    const drawTunnel = (cam: number, limit: number, t: number, surge: number) => {
      const open = broke && smashed >= tl.tier;
      const lit = open ? PALETTE[tl.tier] : null;
      for (let y = 0; y < H; y++) {
        const ry = (y + 0.5 - VY) / F;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const rx = (x + 0.5 - CX) / F;
          const ts = rx !== 0 ? HW / Math.abs(rx) : Infinity;
          const tf = ry !== 0 ? HH / Math.abs(ry) : Infinity;
          const t_ = Math.min(ts, tf);
          if (t_ > limit) { buf[i] = 0xff000000; continue; }
          const z = cam + t_;
          const zf = fract(z);
          const beyond = broke && z > tl.tier * GAP;              // the stretch after the last gate: the walkout light
          const seg = Math.min(7, Math.max(1, Math.ceil(z / GAP - 1e-9)));
          const p = beyond ? PALETTE[tl.tier] : PALETTE[seg];
          const pool = Math.exp(-((zf - 0.3) ** 2) / 0.03) * lampOn(Math.floor(z), t);
          let c: Rgb;
          let light: number;
          let glow = false;
          if (ts < tf) {                                           // a side wall; u runs -1 (top) .. 1 (bottom)
            const u = (ry * ts) / HH;
            const sf = surf.walls[rx < 0 ? 0 : 1];
            const ti = texel(sf, z, (u + 1) * HH);
            const fl = sf.flags[ti];
            const fpz = (t_ * t_) / (HW * F);                      // metres of depth per pixel across the wall
            const fpu = t_ / (F * HH);
            const ribD = Math.abs(fract(z / 0.75 + 0.5) - 0.5) * 0.75;
            const seamD = Math.abs(fract(z / 1.5 + 0.5) - 0.5) * 1.5;
            const frameD = Math.abs(z - Math.round(z / GAP) * GAP);
            if (frameD < Math.max(0.06, 0.6 * fpz) && z > 0.5) c = mix(p.light, STEEL, 0.55);          // the door frame of a gate
            else if (fl & F_DECAL) { c = unpack(sf.rgb[ti]); glow = (fl & F_EMISSIVE) !== 0; }          // hung on the wall
            else if (ribD < Math.max(0.035, 0.55 * fpz)) {
              const k = Math.round(z / 0.75);
              c = ribD < Math.max(0.012, 0.25 * fpz) ? mix(STEEL, WHITE, 0.25) : mix(STEEL, RUST, 0.4 * hash2(k, 5));   // steel rib, rusting
              if (u < -0.72 && u > -0.86) {                                                             // a lamp on the rib
                const on = lampOn(k + 100, t);
                c = mix(mix(p.light, WHITE, 0.5), [30, 30, 36], 1 - on);
                glow = on > 0.5;
              }
            } else {
              c = unpack(sf.rgb[ti]);
              if (!(fl & F_PATCH) && u < 0.42 && (seamD < Math.max(0.018, 0.4 * fpz) || Math.abs(u + 0.15) < Math.max(0.015, 0.6 * fpu)))
                c = mix(c, BLACK, 0.4);                                                                 // panel seams
            }
            light = 0.42 + 0.58 * pool * (0.6 - 0.4 * u);
          } else if (ry < 0) {                                     // ceiling: a strip light down the middle
            const u = (rx * tf) / HW;
            const fp = t_ / F;
            const on = lampOn(Math.floor(z), t);
            if (Math.abs(u) < Math.max(0.15, fp) && zf < 0.55) { c = mix(mix(p.light, WHITE, 0.55), [26, 26, 32], 1 - on); glow = on > 0.5; }
            else if (Math.abs(u) < 0.22) c = mix(STEEL, BLACK, 0.45);
            else {
              c = unpack(surf.ceiling.rgb[texel(surf.ceiling, z, u + 1)]);
              if (Math.abs(Math.abs(u) - 0.63) < Math.max(0.025, 0.6 * fp)) c = mix(c, BLACK, 0.4);
            }
            light = 0.55 + 0.3 * Math.exp(-((zf - 0.3) ** 2) / 0.05) * on;
          } else {                                                 // floor: a guide line, gutters, puddles, rubble
            const u = (rx * tf) / HW;
            const fp = t_ / F;
            const ti = texel(surf.floor, z, u + 1);
            const fl = surf.floor.flags[ti];
            if (Math.abs(u) < Math.max(0.03, 0.6 * fp) && hash2(Math.floor(z * 4), 9) > 0.12) c = GUIDE;   // worn in places
            else if (Math.abs(u) > 0.9) c = mix(FLOOR, BLACK, 0.45);
            else c = unpack(surf.floor.rgb[ti]);
            light = 0.38 + 0.62 * pool * (1 - 0.5 * Math.abs(u));
            if (Math.abs(u) < 0.2 && zf < 0.55) light += 0.15 * lampOn(Math.floor(z), t);           // the strip light's reflection
            if (fl & F_PUDDLE) {                                   // standing water mirrors the strip light, shimmering
              const shimmer = 0.06 * Math.sin(z * 31 + t * 0.012);
              if (Math.abs(u) < 0.3) { c = mix(c, p.light, 0.4); light += 0.3 * pool + shimmer; }
              else light += shimmer;
            }
          }
          const fog = Math.max(0, Math.min(1, 1.05 - t_ / VIEW)) ** 1.3;
          let k = glow ? Math.max(fog, 0.5) * 1.15 : light * fog;
          k *= surge;
          if (beyond && lit) {                                     // warm walkout light pouring in from the stadium
            c = mix(c, lit.light, 0.35);
            k = Math.min(1.35, k * 1.25 + 0.15);
          }
          put(i, x, y, c[0] * k, c[1] * k, c[2] * k);
        }
      }
    };

    /** A gate's surface at wall coordinates (lx, ly): bricks, a steel frame with rivets, hazard stripes along the
     *  bottom. `s` is pixels per wall unit (for line widths that never vanish in the distance). */
    const gateColor = (gate: number, lx: number, ly: number, s: number): Rgb => {
      const p = PALETTE[gate];
      const px1 = 1 / s;
      const ax = Math.abs(lx), ay = Math.abs(ly);
      if (ax > HW * 0.9 || ay > HH * 0.88) {                                         // frame
        const fx = HW * 0.9, fy = HH * 0.88;
        const along = ax > fx ? ly : lx;
        const rivet = Math.abs(fract(along / 0.16) - 0.5) < Math.max(0.12, px1 / 0.16) &&
                      Math.abs((ax > fx ? ax - (fx + HW) / 2 : ay - (fy + HH) / 2)) < Math.max(0.018, px1);
        const base = mix(STEEL, p.light, 0.25);
        return rivet ? mix(base, WHITE, 0.55) : (ax > HW * 0.97 || ay > HH * 0.975) ? mix(base, BLACK, 0.45) : base;
      }
      if (ly > HH * 0.62) {                                                           // hazard stripes
        const stripe = Math.floor((lx - ly) / 0.14) % 2 === 0;
        return stripe ? mix(p.light, WHITE, 0.15) : [22, 22, 28];
      }
      const bh = 0.11, bw = 0.26;
      const row = Math.floor((ly + HH) / bh);
      const yIn = (ly + HH) - row * bh;
      const shifted = lx + HW + (row % 2 ? bw / 2 : 0);
      const col = Math.floor(shifted / bw);
      const xIn = shifted - col * bw;
      const mortar = Math.max(0.012, 0.6 * px1);
      if (yIn < mortar || xIn < mortar) return mix(p.stripe, BLACK, 0.35);
      const v = 0.82 + 0.3 * hash2(row, col);
      const c = mix(p.wall, BLACK, 1 - Math.min(1, v));
      return yIn < mortar + Math.max(0.012, px1) ? mix(c, p.light, 0.3) : c;            // bevel catching the light
    };

    /** Draw a gate (intact, or smashed with a jagged hole opening from the impact point) into the buffer. */
    const drawGate = (gate: number, z: number, cam: number, hole: number) => {
      const d = z - cam;
      if (d < 0.06) return;
      const s = F / d;
      const x0 = Math.max(0, Math.floor(CX - HW * s)), x1 = Math.min(W, Math.ceil(CX + HW * s));
      const y0 = Math.max(0, Math.floor(VY - HH * s)), y1 = Math.min(H, Math.ceil(VY + HH * s));
      const fog = Math.max(0, Math.min(1, 1.05 - d / VIEW)) ** 1.3;
      const jag = jags[gate];
      const p = PALETTE[gate];
      for (let y = y0; y < y1; y++) {
        const ly = (y + 0.5 - VY) / s;
        const lightY = 0.68 + 0.32 * (1 - (ly + HH) / (2 * HH));
        for (let x = x0; x < x1; x++) {
          const lx = (x + 0.5 - CX) / s;
          if (hole > 0) {
            const wx = lx, wy = ly - BALL_Y;
            const a = Math.atan2(wy, wx);
            const edge = hole * jag[Math.floor(((a + Math.PI) / (Math.PI * 2)) * jag.length) % jag.length];
            const dd = Math.hypot(wx, wy);
            if (dd < edge) continue;                                                   // the hole
            if (dd < edge + Math.max(0.03, 1.2 / s)) {
              const rim = mix(p.light, WHITE, 0.35);
              put(y * W + x, x, y, rim[0] * fog, rim[1] * fog, rim[2] * fog);
              continue;
            }
          }
          const c = gateColor(gate, lx, ly, s);
          const k = lightY * fog;
          put(y * W + x, x, y, c[0] * k, c[1] * k, c[2] * k);
        }
      }
    };

    /** The opening at the end of the walkout: the stadium (the site's own scene), overexposed at first. */
    const drawStadium = (cam: number, t: number) => {
      const d = exitZ - cam;
      if (d < 0.05) return;
      const s = F / d;
      const rx0 = CX - HW * s, ry0 = VY - HH * s, rw = 2 * HW * s, rh = 2 * HH * s;
      const x0 = Math.max(0, Math.floor(rx0)), x1 = Math.min(W, Math.ceil(rx0 + rw));
      const y0 = Math.max(0, Math.floor(ry0)), y1 = Math.min(H, Math.ceil(ry0 + rh));
      const u = Math.max(0, Math.min(1, (t - tl.landAt) / SETTLE_MS));
      const expose = 0.92 * (1 - u) ** 1.6;                         // white-out at first, the stadium as we come out
      const light = mix(PALETTE[tl.tier].light, WHITE, 0.6);
      const st = stadium;
      let k = 1, fx = 0, fy = 0;
      if (st) {
        const [vx, vy, vw, vh] = st.meta.view;
        k = Math.max(rw / vw, rh / vh);
        fx = vx + vw * st.meta.focus[0] - rw / k / 2;
        fy = vy + vh * st.meta.focus[1] - rh / k / 2;
      }
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          let r = light[0], g = light[1], b = light[2];
          if (st) {
            const sx = Math.min(st.meta.w - 1, Math.max(0, Math.floor(fx + (x + 0.5 - rx0) / k)));
            const sy = Math.min(st.meta.h - 1, Math.max(0, Math.floor(fy + (y + 0.5 - ry0) / k)));
            const v = st.px[sy * st.meta.w + sx];
            r = (v & 0xff) + ((light[0] - (v & 0xff)) * expose);
            g = ((v >> 8) & 0xff) + ((light[1] - ((v >> 8) & 0xff)) * expose);
            b = ((v >> 16) & 0xff) + ((light[2] - ((v >> 16) & 0xff)) * expose);
          }
          buf[y * W + x] = 0xff000000 | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r);
        }
      }
    };

    const drawGateDecor = (gate: number, cam: number, t: number) => {
      const d = gate * GAP - cam;
      const s = F / d;
      const fog = Math.max(0, Math.min(1, 1.05 - d / VIEW));
      const p = PALETTE[gate];
      const icon = icons[gate - 1];
      if (icon.complete && icon.naturalWidth) {
        const size = Math.max(4, Math.round(Math.min(HW, HH) * s * 0.9));
        ctx.globalAlpha = fog;
        ctx.drawImage(icon, Math.round(CX - size / 2), Math.round(VY - HH * 0.18 * s - size / 2), size, size);
        ctx.globalAlpha = 1;
      }
      const near = gate * GAP - ballZ(t);                     // cracks spread as the ball closes in
      const close = near < CRACK_RANGE ? Math.pow(1 - Math.max(0, near) / CRACK_RANGE, 1.4) : 0;
      const grow = gate === G ? Math.max(Math.min(close, 0.3), crackAt(tl, t)) : close;   // the tease gate: by the rams
      if (grow > 0) {
        const ix = CX, iy = VY + BALL_Y * s;
        const dark = p.wall[0] + p.wall[1] + p.wall[2] < 120;                   // on a black gate the cracks glow instead
        ctx.fillStyle = css(mix(dark ? p.light : mix(p.stripe, BLACK, 0.7), BLACK, 1 - fog));
        for (const crack of cracks[gate]) {
          const n = (crack.length - 1) * grow;
          for (let k = 0; k < Math.floor(n); k++)
            line(ix + crack[k][0] * s, iy + crack[k][1] * s, ix + crack[k + 1][0] * s, iy + crack[k + 1][1] * s);
        }
        if (grow > 0.55) {                                    // the gate starts to give: light leaks through the cracks
          const leak = Math.min(1, (grow - 0.55) * 2.2);
          ctx.fillStyle = css(mix(p.light, WHITE, 0.4), leak);
          for (const crack of cracks[gate]) {
            for (let k = 1; k < Math.floor((crack.length - 1) * grow); k += 2) {
              const [cx, cy] = crack[k];
              ctx.fillRect(Math.round(ix + cx * s), Math.round(iy + cy * s), 1, 1);
            }
          }
          if (gate === G) {                                   // the tease gate glows along its cracks, throbbing
            const throb = bounced ? 0.75 + 0.25 * Math.sin(t * 0.006) : 0.6 + 0.4 * Math.sin(t * 0.03);
            ctx.globalCompositeOperation = "lighter";
            for (const [dx, a] of [[0, 0.8], [1, 0.35]] as const) {     // a bright core and a softer second pixel
              ctx.fillStyle = css(mix(p.light, WHITE, 0.25), a * leak * throb);
              for (const crack of cracks[gate]) {
                const n = (crack.length - 1) * grow;
                for (let k = 0; k < Math.floor(n); k++)
                  line(ix + crack[k][0] * s + dx, iy + crack[k][1] * s, ix + crack[k + 1][0] * s + dx, iy + crack[k + 1][1] * s);
              }
            }
            const r = Math.max(2, 0.45 * s * leak);
            const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, r);
            g.addColorStop(0, css(mix(p.light, WHITE, 0.5), 0.5 * leak * throb));
            g.addColorStop(1, css(p.light, 0));
            ctx.fillStyle = g;
            ctx.fillRect(Math.round(ix - r), Math.round(iy - r), Math.ceil(2 * r), Math.ceil(2 * r));
            ctx.globalCompositeOperation = "source-over";
          }
        }
      }
    };

    const drawBall = (z: number, cam: number, t: number) => {
      const d = z - cam;
      if (d < 0.05) return;
      const s = F / d;
      const r = Math.max(1.5, BALL_R * s);
      const sq = Math.max(0, 1 - Math.abs(t - lastHit.at) / SQUASH_MS) * power(lastHit.gate || 1) * lastHit.k;
      const push = t >= tl.strain[0] && t < tl.strain[1] ? strainAt(tl, t) : 0;   // flattening against the gate
      const rx = r * (1 + 0.4 * sq + 0.22 * push), ry = r * (1 - 0.3 * sq - 0.16 * push);   // squashed flat on impact
      const off = tl.bounceAt === null ? 0 : t - tl.bounceAt;
      const tt = off > 0 ? tl.bounceAt! - Math.min(off, 600) * 0.5 : t;            // after a hold it rolls back and stops
      const bx = CX + Math.sin(tt * 0.004) * 1.2;
      const drop = ballDrop(off, FALL);
      const by = VY + (BALL_Y + drop) * s;                                         // and drops to the floor
      if (drop > 0) {                                                              // its shadow, darker as it lands
        const near = drop / FALL;
        ctx.fillStyle = css(BLACK, 0.45 * near * near);
        ctx.beginPath();
        ctx.ellipse(Math.round(bx), Math.round(VY + HH * s), r * (0.7 + 0.4 * near), Math.max(1, r * 0.28), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const spin = tt * 0.018;
      const cos = Math.cos(spin), sin = Math.sin(spin);
      const seg = Math.min(7, Math.max(1, Math.ceil(z / GAP - 1e-9)));
      const rim = PALETTE[seg].light;
      for (let py = -Math.ceil(ry); py <= Math.ceil(ry); py++) {
        for (let px = -Math.ceil(rx); px <= Math.ceil(rx); px++) {
          const nx = px / rx, ny = py / ry;
          const q = nx * nx + ny * ny;
          if (q > 1) continue;
          const nz = Math.sqrt(1 - q);
          const ty = ny * cos - nz * sin, tz = ny * sin + nz * cos;                 // rolls away from us
          const patch = PATCHES.some(([a, b, c]) => a * nx + b * ty + c * tz > 0.88);
          const shade = 0.4 + 0.6 * Math.max(0, -0.35 * nx - 0.45 * ny + 0.82 * nz);  // lit from the ceiling
          const base: Rgb = patch ? [26, 28, 40] : [244, 244, 236];
          let c = mix(BLACK, base, shade);
          if (nz < 0.28) c = mix(c, rim, 0.55);                                       // the tunnel's light on its rim
          if (!patch && (nx + 0.35) ** 2 + (ny + 0.42) ** 2 < 0.05) c = WHITE;         // specular highlight
          ctx.fillStyle = css(c);
          ctx.fillRect(Math.round(bx + px), Math.round(by + py), 1, 1);
        }
      }
    };

    /** Colour-split flash: the red channel slides one way and blue the other, for a beat after a smash. */
    const colourSplit = (amount: number) => {
      const k = Math.round(amount);
      if (k < 1) return;
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const src = new Uint8ClampedArray(d);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const xr = Math.min(W - 1, x + k), xb = Math.max(0, x - k);
          d[i] = src[(y * W + xr) * 4];
          d[i + 2] = src[(y * W + xb) * 4 + 2];
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    const frame = (now: number) => {
      if (skipRef.current && !landed) { skipRef.current = false; skipToEnd(now, true); }
      const frozen = now < freezeUntil;                       // hit-stop: time stands still for a beat
      if (frozen) t0 += now - last;
      else if (!reduce) {                                     // slow motion while the ball pushes against the gate
        const rate = clockRate(tl, now - t0);
        if (rate < 1) t0 += (now - last) * (1 - rate);
      }
      const t = now - t0;
      const slow = strainAt(tl, t);
      const dt = frozen ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;

      while (smashed < tl.tier && t >= tl.gates[smashed]) {
        smashed += 1;
        const final = smashed === tl.tier;
        const big = final && broke;                       // the climax: through the last gate and out
        spawn(smashed, t, big);
        lastHit = { gate: smashed, at: t, k: 1 };
        rings.push({ gate: smashed, at: t });
        shake = { amp: 2 + smashed * 0.9 + (big ? 4 : 0), at: t };
        jolt(smashed, big);
        const tint = mix(PALETTE[smashed].light, WHITE, 0.55);
        flash = big ? { amp: 0.72, at: t, ms: 420 / TEMPO, c: tint } : { amp: 0.36, at: t, ms: 90 / TEMPO, c: tint };   // the big smash shows through
        surge = { amp: 0.35 + 0.08 * smashed + (big ? 0.25 : 0), at: t };
        burst = { amt: power(smashed) * (big ? 1.5 : 0.8), at: t };
        star = { amt: power(smashed) * (big ? 1.3 : 0.75), at: t, c: mix(PALETTE[smashed].light, WHITE, 0.4) };
        split = { amp: 1 + power(smashed) + (big ? 1 : 0), at: t };
        if (!reduce) freezeUntil = now + hitStopMs(smashed, big);
        callbacks.current.onSmash?.(smashed, final);
      }
      while (rammed < tl.rams.length && t >= tl.rams[rammed]) {   // the tease: the gate takes the hit and stands
        rammed += 1;
        const k = rammed === 1 ? 0.7 : 1;                  // the second ram hits harder
        knock(G, t, k);
        lastHit = { gate: G, at: t, k: 0.8 * k };
        rings.push({ gate: G, at: t });
        shake = { amp: (1.5 + G * 0.6) * k, at: t };
        jolt(G, false, 0.65 * k);
        flash = { amp: 0.22 * k, at: t, ms: 80 / TEMPO, c: mix(PALETTE[G].light, WHITE, 0.6) };
        star = { amt: power(G) * 0.55 * k, at: t, c: mix(PALETTE[G].light, WHITE, 0.4) };
        if (!reduce) freezeUntil = now + hitStopMs(G, false) * (rammed === 1 ? 1.2 : 1.6);
      }
      if (!bounced && tl.bounceAt !== null && t >= tl.bounceAt) {   // it holds: the ball bounces off for good
        bounced = true;
        knock(G, t, 1.2);
        lastHit = { gate: G, at: t, k: 1 };
        shake = { amp: 2.5 + G * 0.7, at: t };
        jolt(G, false, 0.9);
        surge = { amp: 0.3, at: t };
        flash = { amp: 0.3, at: t, ms: 180 / TEMPO, c: BLACK };    // the lights dip
        if (!reduce) freezeUntil = now + 90;
      }
      if (!frozen && t >= tl.strain[0] && t < tl.strain[1]) trickle(t, dt, slow);
      if (!landed && t >= tl.landAt + LANDED_DELAY_MS) {
        landed = true;
        callbacks.current.onLanded();
      }

      const pu = (t - lastHit.at) / PUNCH_MS;                                       // camera punch-in on impact
      F = F0 * (1 + (pu >= 0 && pu < 1 ? 0.16 * power(lastHit.gate || 1) * lastHit.k * (1 - pu) * (1 - pu) : 0) + 0.1 * slow * slow);
      const cam = camZ(t);
      const open = broke && smashed >= tl.tier;            // the last gate is down: the stadium beyond
      const wallZ = open ? exitZ : (smashed + 1) * GAP;

      const su = (t - surge.at) / SURGE_MS;               // the lights surge, then stutter, after a smash
      const surgeK = su >= 0 && su < 1 ? 1 + surge.amp * (1 - su) * (1 - su) * (Math.random() < 0.18 * su ? -1.2 : 1) : 1;
      drawTunnel(cam, Math.min(VIEW, wallZ - cam), t, Math.max(0.35, surgeK));
      if (open) drawStadium(cam, t);
      else drawGate(smashed + 1, wallZ, cam, 0);
      for (let i = smashes.length - 1; i >= 0; i--) {     // broken gates still ahead, far to near
        const sm = smashes[i];
        if (sm.gate * GAP - cam < 0.06 && t - sm.at > RING_MS) { smashes.splice(i, 1); continue; }
        const u = Math.min(1, (t - sm.at) / HOLE_MS);
        drawGate(sm.gate, sm.gate * GAP, cam, (0.3 + 1.9 * (1 - (1 - u) * (1 - u))) * HW);
      }

      const tremble = t >= tl.strain[0] && t < tl.strain[1] ? 0.5 + 1.3 * slow : 0;   // the gate shudders under the push
      const s = shake.amp * Math.max(0, 1 - (t - shake.at) / SHAKE_MS) + tremble;
      const ox = frozen ? 0 : Math.round((Math.random() * 2 - 1) * s), oy = frozen ? 0 : Math.round((Math.random() * 2 - 1) * s);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.putImageData(image, ox, oy);
      ctx.setTransform(1, 0, 0, 1, ox, oy);

      if (!open) drawGateDecor(smashed + 1, cam, t);

      const sd = signZ - cam;                              // THIS IS FUTKRILL, hung from the ceiling before the last gate
      if (sd > 0.12 && sd < VIEW) {
        const sc = F / sd;
        const sw = 1.3 * sc, sh = (sw * sign.height) / sign.width;
        const sx = Math.round(CX - sw / 2), sy = Math.round(VY + (-HH + 0.07) * sc);
        const fog = Math.max(0, Math.min(1, 1.05 - sd / VIEW)) ** 1.3;
        ctx.fillStyle = css(mix(STEEL, BLACK, 0.4 + 0.6 * (1 - fog)));
        for (const cx of [-0.5, 0.5]) ctx.fillRect(Math.round(CX + cx * sc), Math.round(VY - HH * sc), 1, Math.max(1, sy - Math.round(VY - HH * sc)));
        ctx.globalAlpha = Math.max(0.15, fog);
        ctx.drawImage(sign, sx, sy, Math.round(sw), Math.max(1, Math.round(sh)));
        ctx.globalAlpha = 1;
      }

      if (open) {                                          // light rays turning slowly round the vanishing point
        const glow = Math.min(1, (t - tl.landAt) / 500) * Math.max(0, 1 - (t - tl.landAt) / (SETTLE_MS * 1.6));
        if (glow > 0.01) {
          ctx.globalCompositeOperation = "lighter";
          const rot = t * 0.0004;
          const R = Math.hypot(W, H);
          for (let k = 0; k < 16; k += 2) {
            const a0 = (k / 16) * Math.PI * 2 - rot, a1 = a0 + Math.PI / 16;
            ctx.fillStyle = css(mix(PALETTE[tl.tier].light, WHITE, 0.5), 0.1 * glow);
            ctx.beginPath(); ctx.moveTo(CX, VY);
            ctx.lineTo(CX + Math.cos(a0) * R, VY + Math.sin(a0) * R); ctx.lineTo(CX + Math.cos(a1) * R, VY + Math.sin(a1) * R);
            ctx.closePath(); ctx.fill();
          }
          ctx.globalCompositeOperation = "source-over";
        }
      }

      const bz = ballZ(t);
      if (bz < cam + VIEW && bz <= wallZ + (open ? 30 : 0)) drawBall(bz, cam, t);

      for (let i = rings.length - 1; i >= 0; i--) {       // shockwave rings, two of them, the second thinner
        const sm = rings[i];
        const u = (t - sm.at) / RING_MS;
        const d = sm.gate * GAP - cam;
        if (u >= 1) { rings.splice(i, 1); continue; }
        if (d <= 0.06) continue;
        const sc = F / d;
        const cy = VY + BALL_Y * sc;
        for (const [lag, wdt] of [[0, 2], [0.18, 1]] as const) {
          const v = u - lag;
          if (v <= 0) continue;
          const f = 0.3 + 1.5 * v;
          ctx.strokeStyle = css(mix(PALETTE[sm.gate].light, WHITE, 0.45), Math.max(0, 1 - v));
          ctx.lineWidth = wdt;
          ctx.beginPath();
          ctx.ellipse(CX, cy, HW * f * sc, HH * f * sc * 0.92, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      for (let i = debris.length - 1; i >= 0; i--) {
        const p = debris[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
        const age = t - p.born;
        if (age < 0) { p.x -= p.vx * dt; p.y -= p.vy * dt; p.z -= p.vz * dt; continue; }      // not fallen yet
        p.vy += (p.kind === "dust" ? 0.2 : 2.6) * dt;
        if (p.kind === "dust") { p.vx *= 0.96; p.vy *= 0.96; p.size += 0.25 * dt; }
        const d = p.z - cam;
        if (d < (p.kind === "dust" ? 0.06 : 0.32) || age > p.life || (p.kind === "crumb" && p.y > HH)) { debris.splice(i, 1); continue; }
        const sc = F / d;
        const sx = CX + p.x * sc, sy = VY + p.y * sc;
        if (p.kind === "shard" && p.shape) {                  // a flat shard of the gate, flipping as it spins
          const sz = Math.min(W * 0.09, p.size * sc);
          const cos = Math.cos(p.rot), sin = Math.sin(p.rot), flip = 0.3 + 0.7 * Math.abs(Math.cos(p.rot * 0.7));
          const pts = p.shape.map(([a, b]) => [sx + (a * cos - b * sin) * sz, sy + (a * sin + b * cos) * sz * flip] as [number, number]);
          ctx.fillStyle = css(mix(p.c, BLACK, Math.max(0, 0.3 - 0.3 * Math.abs(Math.sin(p.rot)))));
          fillTri(ctx, pts);
          ctx.fillStyle = css(p.edge);
          const [a, b] = [...pts].sort((u, v) => u[1] - v[1]);
          line(a[0], a[1], b[0], b[1]);                       // its lit top edge
        } else if (p.kind === "chip" || p.kind === "crumb") {
          ctx.fillStyle = css(p.c);
          const sz = Math.max(1, Math.min(3, Math.round(p.size * sc)));
          ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
        } else if (p.kind === "dust") {
          const r = Math.max(1, Math.min(W * 0.07, p.size * sc * 0.5));                  // a soft round puff
          const fade = 1 - age / p.life;
          ctx.fillStyle = css(p.c, 0.16 * fade);
          ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy), r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = css(mix(p.c, WHITE, 0.2), 0.14 * fade);
          ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy), r * 0.55, 0, Math.PI * 2); ctx.fill();
        } else {                                                                     // a tumbling brick: it flips as it spins
          const cap = W * 0.07;                                                        // never a flat slab across the screen
          const w = Math.max(1, Math.round(Math.min(cap, p.size * sc * (0.35 + 0.65 * Math.abs(Math.cos(p.rot))))));
          const h = Math.max(1, Math.round(Math.min(cap * 0.6, p.size * sc * 0.55 * (0.35 + 0.65 * Math.abs(Math.sin(p.rot))))));
          const x0 = Math.round(sx - w / 2), y0 = Math.round(sy - h / 2);
          ctx.fillStyle = css(p.edge);
          ctx.fillRect(x0, y0, w, h);
          if (w > 2 && h > 2) {
            ctx.fillStyle = css(p.c);
            ctx.fillRect(x0, y0, w - 1, h - 1);
            ctx.fillStyle = css(mix(p.c, WHITE, 0.35));                             // its lit top edge
            ctx.fillRect(x0, y0, w - 1, 1);
          }
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        const age = t - sp.born;
        if (age > sp.life) { sparks.splice(i, 1); continue; }
        const x1 = sp.x + sp.vx * (age / 1000), y1 = sp.y + sp.vy * (age / 1000);
        const x0 = sp.x + sp.vx * Math.max(0, age - 40) / 1000, y0 = sp.y + sp.vy * Math.max(0, age - 40) / 1000;
        ctx.fillStyle = sp.c;
        line(x0, y0, x1, y1);
      }

      for (let i = motes.length - 1; i >= 0; i--) {        // embers rising, confetti falling (screen space)
        const m = motes[i];
        const age = t - m.born;
        if (age < 0) continue;
        if (age > m.life || m.y > H + 4) { motes.splice(i, 1); continue; }
        const a = age / 1000;
        const x = m.x + m.vx * a + Math.sin(a * 3 + m.ph) * 3 * PX, y = m.y + m.vy * a;
        const fade = Math.min(1, 4 * (1 - age / m.life));
        if (m.kind === "ember") {
          ctx.fillStyle = css(m.c, fade * (0.55 + 0.45 * Math.abs(Math.sin(a * 9 + m.ph))));
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        } else {
          ctx.fillStyle = css(m.c, fade);
          const wide = Math.floor(a * 9 + m.ph) % 2 === 0;
          ctx.fillRect(Math.round(x), Math.round(y), wide ? 2 : 1, wide ? 1 : 2);
        }
      }

      const au = (t - arcs.at) / (ARC_MS * (0.6 + 0.4 * arcs.amt));
      if (!reduce && au >= 0 && au < 1) {                  // electric arcs crawling out from the impact
        const p = PALETTE[arcs.gate];
        const n = Math.round((2 + 4 * arcs.amt) * (1 - au * 0.5));
        const ix = CX, iy = VY + BALL_Y * (F / LEAD);
        for (let k = 0; k < n; k++) {
          if (Math.random() < 0.25) continue;                // they flicker
          const a = Math.random() * Math.PI * 2;
          const r0 = W * 0.04, r1 = W * (0.2 + 0.35 * Math.random()) * (0.6 + arcs.amt * 0.6);
          const pts = bolt(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0 * 0.8, ix + Math.cos(a) * r1, iy + Math.sin(a) * r1 * 0.8, 0.18, Math.random);
          for (const [col, off] of [[p.light, 1], [mix(p.light, WHITE, 0.7), 0]] as const) {
            ctx.fillStyle = css(col, off ? 0.5 : 1);
            for (let j = 1; j < pts.length; j++) line(pts[j - 1][0] + off, pts[j - 1][1], pts[j][0] + off, pts[j][1]);
          }
        }
      }

      for (let i = bolts.length - 1; i >= 0; i--) {        // gold lightning
        const b = bolts[i];
        const age = t - b.born;
        if (age < 0) continue;
        if (age > b.life) { bolts.splice(i, 1); continue; }
        for (const [col, off] of [[b.glow, -1], [b.glow, 1], [b.c, 0]] as const) {
          ctx.fillStyle = css(col, off ? 0.55 : 1);
          for (let j = 1; j < b.pts.length; j++) line(b.pts[j - 1][0] + off, b.pts[j - 1][1], b.pts[j][0] + off, b.pts[j][1]);
        }
        ctx.fillStyle = css(b.glow, 0.12 * (1 - age / b.life));
        ctx.fillRect(-8, -8, W + 16, H + 16);
      }

      const stu = (t - star.at) / STAR_MS;                 // the impact star: long rays and short ones, turning
      if (stu >= 0 && stu < 1) {
        const ix = CX, iy = VY + BALL_Y * (F / LEAD);
        const L = W * 0.22 * star.amt * Math.sqrt(1 - stu);
        const rot = stu * 0.6;
        ctx.fillStyle = css(star.c, 1 - stu * 0.6);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + rot;
          const len = k % 2 ? L * 0.45 : L;
          line(ix, iy, ix + Math.cos(a) * len, iy + Math.sin(a) * len * 0.85);
        }
        const core = Math.max(1, Math.round(W * 0.025 * star.amt * (1 - stu)));
        ctx.fillStyle = css(WHITE, 1 - stu);
        ctx.fillRect(Math.round(ix - core / 2), Math.round(iy - core / 2), core, core);
      }

      if (!open) {                                         // speed lines, more of them the faster we go, in the tunnel's light
        const speed = (depthAt(tl, t + 16) - depthAt(tl, t)) * GAP;
        const n = frozen ? 0 : Math.max(0, Math.round(speed * 70));
        const seg = Math.min(7, Math.max(1, Math.ceil(cam / GAP + 1e-9)));
        ctx.fillStyle = css(mix(PALETTE[seg].light, WHITE, 0.6), 0.4);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const r0 = (0.5 + Math.random() * 0.5) * CX, len = (0.04 + Math.random() * 0.1) * W;
          for (let k = 0; k < len; k += 1)
            ctx.fillRect(Math.round(CX + Math.cos(a) * (r0 + k)), Math.round(VY + Math.sin(a) * (r0 + k) * (H / W)), 1, 1);
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const bu = (t - burst.at) / BURST_MS;                // a zoom burst out of the impact: the picture streaks outwards
      if (!reduce && bu >= 0 && bu < 1) {
        const amt = burst.amt * (1 - bu);
        const ix = CX, iy = VY + BALL_Y * (F / LEAD);
        ctx.globalCompositeOperation = "lighter";
        for (let k = 1; k <= 3; k++) {
          const sc = 1 + 0.07 * k * amt;
          ctx.globalAlpha = (0.2 * amt) / k;
          ctx.drawImage(canvas, ix - ix * sc, iy - iy * sc, W * sc, H * sc);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      if (slow > 0) {                                      // the world closing in as time slows
        const g = ctx.createRadialGradient(CX, VY, Math.min(W, H) * 0.25, CX, VY, Math.hypot(W, H) * 0.6);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${0.6 * slow})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      const f = flash.amp * Math.max(0, 1 - (t - flash.at) / flash.ms);
      if (f > 0) {
        ctx.fillStyle = css(flash.c, Math.min(1, f));
        ctx.fillRect(0, 0, W, H);
      }
      const sv = (t - split.at) / SPLIT_MS;
      if (!reduce && sv >= 0 && sv < 1) colourSplit(split.amp * (1 - sv));

      if (t < tl.landAt + Math.max(STOP_AFTER_MS, SETTLE_MS + 200) || debris.length || sparks.length || motes.length || bolts.length)
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [tier, outcome]);

  return (
    <canvas ref={canvasRef} className="tunnel" width={160} height={100} onPointerDown={() => { skipRef.current = true; }}
            aria-label={`Revealing your tier: ${TIERS[Math.min(7, Math.max(1, tier)) - 1].name}`} />
  );
}
