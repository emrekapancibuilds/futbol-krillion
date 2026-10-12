"use client";

// The tier reveal: a first-person run down a stadium tunnel. A football smashes through one gate per tier,
// faster at each gate, and the tunnel beyond takes the next tier's colour. The last gate opens onto the walkout light.
// Each smash: cracks spread across the gate as the ball closes in, then a camera punch, the ball squashing, a
// shockwave ring, sparks, tumbling bricks and dust, and the broken gate with a jagged hole blowing open as we pass.
// It all hits harder the deeper the gate. Fills its box (the whole screen): about 120 canvas pixels across the short
// side, scaled up crisp by CSS.

import { useEffect, useRef } from "react";

import { depthAt, revealTimeline, TEMPO } from "@/lib/reveal/timeline.ts";
import { TIER_COLORS, TIERS } from "@/lib/tiers.ts";

const HW = 1;               // tunnel half width, world units; the half height follows the screen's shape
const GAP = 3;              // tunnel length between two gates: long enough to see the next gate coming
const LEAD = 0.9;           // the camera trails the ball by this much
const VIEW = 7;             // draw distance
const STEP = 0.25;          // depth of one wall slice (alternating stripes)
const BALL_R = 0.11;
const BALL_Y = 0.16;        // the ball flies a little below the centre line, and hits the gate there
const CRACK_RANGE = 1.3;    // cracks start spreading when the ball is this close to a gate
// Effect timings follow the run's tempo (80% speed).
const RING_MS = 280 / TEMPO;
const HOLE_MS = 150 / TEMPO;        // the hole in a smashed gate blows open over this long
const PUNCH_MS = 220 / TEMPO;
const SQUASH_MS = 90 / TEMPO;
const SHAKE_MS = 320 / TEMPO;
const SETTLE_MS = 700 / TEMPO;      // the camera glides into the light after the last smash
const LANDED_DELAY_MS = 140; // the white flash shows before the banner
const STOP_AFTER_MS = 2600; // the loop stops this long after landing; the last frame stays

type Debris = { kind: "brick" | "chip" | "dust"; x: number; y: number; z: number; vx: number; vy: number; vz: number;
                size: number; rot: number; spin: number; c: Rgb; edge: Rgb; born: number; life: number };
type Spark = { x: number; y: number; vx: number; vy: number; c: string; born: number; life: number };
type Smash = { gate: number; at: number };
type Rgb = [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: Rgb, alpha = 1) => (alpha >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`);
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const DUST: Rgb = [150, 140, 128];
const PALETTE = Object.fromEntries(Object.entries(TIER_COLORS).map(([k, v]) => [k, {
  wall: hex(v.wall), stripe: hex(v.stripe), light: hex(v.light),
}])) as Record<number, { wall: Rgb; stripe: Rgb; light: Rgb }>;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // roughly -1..1, centre-heavy

// Pentagon centres of a football: the 12 vertices of an icosahedron.
const PHI = (1 + Math.sqrt(5)) / 2;
const PATCHES = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0],
  [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map(([x, y, z]) => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
});

/** Spider cracks for one gate, in wall units from the impact point: a few jagged lines, each a list of points. */
function makeCracks(): [number, number][][] {
  return Array.from({ length: 9 }, (_, i) => {
    let a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
    let x = 0, y = 0;
    const len = 0.5 + Math.random() * 0.9;
    const pts: [number, number][] = [[0, 0]];
    for (let k = 0; k < 7; k++) {
      a += (Math.random() - 0.5) * 0.8;
      x += Math.cos(a) * len / 7;
      y += Math.sin(a) * len / 7;
      pts.push([x, y]);
    }
    return pts;
  });
}

export default function TunnelReveal({ tier, onSmash, onLanded }: {
  tier: number; onSmash?: (gate: number, last: boolean) => void; onLanded: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skipRef = useRef(false);
  const callbacks = useRef({ onSmash, onLanded });
  callbacks.current = { onSmash, onLanded };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    const scale = Math.max(2, Math.min(box.width, box.height) / 120);
    const W = Math.max(40, Math.round(box.width / scale));
    const H = Math.max(40, Math.round(box.height / scale));
    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;                  // after resizing: that resets the context
    const CX = W / 2;
    const VY = H / 2;
    const F0 = 0.4375 * W;                              // focal length: the tunnel fills the width just ahead
    const HH = (HW * H) / W;                            // a cross-section the shape of the screen
    const PX = W / 160;                                 // screen-space speeds scale with the canvas
    const tl = revealTimeline(tier);
    const icons = TIERS.map((t) => Object.assign(new Image(), { src: t.icon }));
    const cracks = Array.from({ length: 8 }, makeCracks);
    const jags = Array.from({ length: 8 }, () => Array.from({ length: 18 }, () => 0.7 + Math.random() * 0.6));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let t0 = performance.now();
    let last = t0;
    let smashed = 0;
    let landed = false;
    let raf = 0;
    let F = F0;
    let shake = { amp: 0, at: 0 };
    let flash = { amp: 0, at: 0, ms: 120 };
    let lastSmash: Smash = { gate: 0, at: -1e9 };
    const debris: Debris[] = [];
    const sparks: Spark[] = [];
    const smashes: Smash[] = [];

    const skipToEnd = (now: number, withFlash: boolean) => {
      t0 = now - (tl.landAt + SETTLE_MS);
      smashed = tl.tier;                                  // no debris for the gates jumped over
      debris.length = 0;
      sparks.length = 0;
      smashes.length = 0;
      flash = { amp: withFlash ? 1 : 0, at: tl.landAt + SETTLE_MS, ms: 300 };
    };
    if (reduce) skipToEnd(t0, false);
    const onKey = (e: KeyboardEvent) => { if (!landed && (e.key === "Enter" || e.key === " ")) skipRef.current = true; };
    window.addEventListener("keydown", onKey);

    const power = (gate: number) => 0.6 + 0.4 * (gate / 7);      // deeper gates break harder

    /** Camera shake on every hit: the whole picture jolts and rolls, then settles; harder for deeper gates.
     *  On the element itself (compositor-only transforms), on top of the jitter inside the picture. */
    const jolt = (gate: number, final: boolean) => {
      if (reduce || !canvas.animate) return;
      const a = 5 + gate * 1.6 + (final ? 7 : 0);             // CSS pixels
      const r = 0.6 + gate * 0.15 + (final ? 0.9 : 0);       // degrees of roll
      const at = (x: number, y: number, deg: number) => ({ transform: `translate(${x}px, ${y}px) rotate(${deg}deg) scale(1.06)` });
      canvas.animate([at(0, 0, 0), at(-a, a * 0.6, -r), at(a * 0.8, -a * 0.5, r * 0.8), at(-a * 0.45, a * 0.3, -r * 0.4),
                      at(a * 0.2, -a * 0.1, r * 0.15), at(0, 0, 0)],
                     { duration: SHAKE_MS, easing: "ease-out" });
    };

    const spawn = (gate: number, t: number) => {
      const p = PALETTE[gate];
      const k = power(gate);
      const z = gate * GAP;
      const piece = (spread: number) => {
        const x = Math.max(-HW, Math.min(HW, gauss() * HW * spread));
        const y = Math.max(-HH, Math.min(HH, BALL_Y + gauss() * HH * spread));
        return { x, y, dx: x, dy: y - BALL_Y };
      };
      for (let i = 0; i < Math.round(70 * k); i++) {          // chunky bricks, tumbling towards us
        const { x, y, dx, dy } = piece(0.7);
        const r = Math.random();
        const c = r < 0.55 ? p.wall : r < 0.85 ? p.stripe : p.light;
        debris.push({ kind: "brick", x, y, z, born: t, life: 1500, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 24,
                      size: (0.05 + Math.random() * 0.11) * (0.8 + 0.4 * k),
                      vx: dx * (2 + Math.random() * 4) + gauss() * 0.4, vy: dy * (2 + Math.random() * 4) - Math.random() * 0.9,
                      vz: -(1.5 + Math.random() * 4.5) * k, c, edge: mix(c, BLACK, 0.5) });
      }
      for (let i = 0; i < Math.round(140 * k); i++) {         // fine chips
        const { x, y, dx, dy } = piece(1);
        const r = Math.random();
        const c = r < 0.12 ? WHITE : r < 0.35 ? p.light : r < 0.7 ? p.wall : p.stripe;
        debris.push({ kind: "chip", x, y, z, born: t, life: 1200, rot: 0, spin: 0, size: 0.03,
                      vx: dx * (1 + Math.random() * 3), vy: dy * (1 + Math.random() * 3) - Math.random() * 0.5,
                      vz: -(0.8 + Math.random() * 3.2), c, edge: c });
      }
      for (let i = 0; i < Math.round(26 * k); i++) {          // dust puffs that hang and fade
        const { x, y, dx, dy } = piece(0.6);
        debris.push({ kind: "dust", x, y, z, born: t, life: 650 + Math.random() * 350, rot: 0, spin: 0,
                      size: 0.14 + Math.random() * 0.2, vx: dx * 0.7, vy: dy * 0.7 - 0.15, vz: -(0.2 + Math.random() * 0.8),
                      c: mix(DUST, p.wall, 0.35), edge: DUST });
      }
      const bx = CX, by = VY + BALL_Y * (F0 / LEAD);         // where the ball is on screen at impact
      for (let i = 0; i < Math.round(30 * k); i++) {          // sparks flying off the point of impact
        const a = Math.random() * Math.PI * 2;
        const v = (70 + Math.random() * 150) * PX * k;
        sparks.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, born: t, life: 140 + Math.random() * 160,
                      c: css(Math.random() < 0.5 ? WHITE : p.light) });
      }
      smashes.push({ gate, at: t });
    };

    const ballZ = (t: number) => (t <= tl.landAt ? depthAt(tl, t) * GAP : tl.tier * GAP + (t - tl.landAt) * 0.012);
    const camZ = (t: number) => {
      if (t <= tl.landAt) return depthAt(tl, t) * GAP - LEAD;
      const u = Math.min(1, (t - tl.landAt) / SETTLE_MS);
      return tl.tier * GAP - LEAD + 1.2 * (1 - (1 - u) * (1 - u));
    };

    const rect = (z: number, cam: number) => {
      const s = F / (z - cam);
      return { s, x: Math.round(CX - HW * s), y: Math.round(VY - HH * s), w: Math.round(2 * HW * s), h: Math.round(2 * HH * s) };
    };

    const line = (x0: number, y0: number, x1: number, y1: number) => {
      const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
    };

    const brickAt = (lx: number, ly: number, bh: number) => {                  // mortar on a wall, in wall pixels
      const row = Math.floor(ly / bh);
      const yIn = ly - row * bh;
      const xIn = (lx + (row % 2 ? bh : 0)) % (bh * 2);
      return yIn < 1 || xIn < 1;
    };

    const drawWall = (gate: number, cam: number, t: number) => {
      const r = rect(gate * GAP, cam);
      const p = PALETTE[gate];
      const fog = Math.min(0.85, (gate * GAP - cam) / VIEW);
      ctx.fillStyle = css(mix(p.wall, BLACK, fog));
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const rows = Math.max(4, Math.round(r.h / Math.max(1, r.w / 10)));
      const bh = r.h / rows;
      ctx.fillStyle = css(mix(p.stripe, BLACK, fog));
      for (let i = 1; i < rows; i++) ctx.fillRect(r.x, Math.round(r.y + i * bh), r.w, 1);       // mortar lines
      for (let i = 0; i < rows; i++) {
        const off = i % 2 ? bh : 0;
        for (let x = r.x + off; x < r.x + r.w; x += bh * 2) ctx.fillRect(Math.round(x), Math.round(r.y + i * bh), 1, Math.ceil(bh));
      }
      ctx.strokeStyle = css(mix(p.light, BLACK, fog));
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      const icon = icons[gate - 1];
      if (icon.complete && icon.naturalWidth) {
        const size = Math.max(4, Math.round(Math.min(r.w, r.h) * 0.55));
        ctx.globalAlpha = 1 - fog;
        ctx.drawImage(icon, Math.round(CX - size / 2), Math.round(VY - size / 2), size, size);
        ctx.globalAlpha = 1;
      }
      const near = gate * GAP - ballZ(t);                     // cracks spread as the ball closes in
      if (near < CRACK_RANGE) {
        const grow = Math.pow(1 - Math.max(0, near) / CRACK_RANGE, 1.4);
        const ix = CX, iy = VY + BALL_Y * r.s;
        const dark = p.wall[0] + p.wall[1] + p.wall[2] < 120;                   // on a black gate the cracks glow instead
        ctx.fillStyle = css(mix(dark ? p.light : mix(p.stripe, BLACK, 0.65), BLACK, fog));
        for (const crack of cracks[gate]) {
          const n = (crack.length - 1) * grow;
          for (let k = 0; k < Math.floor(n); k++)
            line(ix + crack[k][0] * r.s, iy + crack[k][1] * r.s, ix + crack[k + 1][0] * r.s, iy + crack[k + 1][1] * r.s);
        }
        if (grow > 0.6) {                                    // the gate starts to give: light leaks through the cracks
          ctx.fillStyle = css(p.light, (grow - 0.6) * 2);
          for (const crack of cracks[gate]) {
            const [cx, cy] = crack[Math.min(crack.length - 1, Math.floor((crack.length - 1) * grow))];
            ctx.fillRect(Math.round(ix + cx * r.s), Math.round(iy + cy * r.s), 1, 1);
          }
        }
      }
    };

    /** A smashed gate still ahead of the camera: the wall with a jagged hole blowing open from the impact point. */
    const drawBrokenWall = (sm: Smash, cam: number, t: number) => {
      const z = sm.gate * GAP;
      if (z - cam < 0.06) return;
      const r = rect(z, cam);
      const p = PALETTE[sm.gate];
      const u = Math.min(1, (t - sm.at) / HOLE_MS);
      const radius = (0.3 + 1.9 * (1 - (1 - u) * (1 - u))) * HW;
      const jag = jags[sm.gate];
      const rows = Math.max(4, Math.round(r.h / Math.max(1, r.w / 10)));
      const bh = Math.max(1, r.h / rows);
      const wall = css(p.wall), mortar = css(p.stripe), rim = css(mix(p.light, WHITE, 0.3));
      const x0 = Math.max(0, r.x), x1 = Math.min(W, r.x + r.w), y0 = Math.max(0, r.y), y1 = Math.min(H, r.y + r.h);
      for (let y = y0; y < y1; y++) {
        const wy = (y - VY) / r.s - BALL_Y;
        for (let x = x0; x < x1; x++) {
          const wx = (x - CX) / r.s;
          const a = Math.atan2(wy, wx);
          const edge = radius * jag[Math.floor(((a + Math.PI) / (Math.PI * 2)) * jag.length) % jag.length];
          const d = Math.hypot(wx, wy);
          if (d < edge) continue;                                                   // the hole
          ctx.fillStyle = d < edge + 0.03 ? rim : brickAt(x - r.x, y - r.y, bh) ? mortar : wall;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    };

    const drawBall = (z: number, cam: number, t: number) => {
      const d = z - cam;
      if (d < 0.05) return;
      const s = F / d;
      const r = Math.max(1.5, BALL_R * s);
      const sq = Math.max(0, 1 - Math.abs(t - lastSmash.at) / SQUASH_MS) * power(lastSmash.gate || 1);
      const rx = r * (1 + 0.4 * sq), ry = r * (1 - 0.3 * sq);                    // squashed flat on impact
      const bx = CX + Math.sin(t * 0.004) * 1.2;
      const by = VY + BALL_Y * s;
      const spin = t * 0.018;
      const cos = Math.cos(spin), sin = Math.sin(spin);
      for (let py = -Math.ceil(ry); py <= Math.ceil(ry); py++) {
        for (let px = -Math.ceil(rx); px <= Math.ceil(rx); px++) {
          const nx = px / rx, ny = py / ry;
          const q = nx * nx + ny * ny;
          if (q > 1) continue;
          const nz = Math.sqrt(1 - q);
          const ty = ny * cos - nz * sin, tz = ny * sin + nz * cos;                 // rolls away from us
          const patch = PATCHES.some(([a, b, c]) => a * nx + b * ty + c * tz > 0.88);
          const shade = 0.45 + 0.55 * nz;
          const base: Rgb = patch ? [26, 28, 40] : [244, 244, 236];
          ctx.fillStyle = css(nz < 0.22 ? mix(base, [90, 96, 120], 0.6) : mix(BLACK, base, shade));
          ctx.fillRect(Math.round(bx + px), Math.round(by + py), 1, 1);
        }
      }
    };

    const frame = (now: number) => {
      if (skipRef.current && !landed) { skipRef.current = false; skipToEnd(now, true); }
      const t = now - t0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      while (smashed < tl.tier && t >= tl.gates[smashed]) {
        smashed += 1;
        const final = smashed === tl.tier;
        spawn(smashed, t);
        lastSmash = { gate: smashed, at: t };
        shake = { amp: 2 + smashed * 0.9 + (final ? 4 : 0), at: t };
        jolt(smashed, final);
        flash = final ? { amp: 1, at: t, ms: 420 / TEMPO } : { amp: 0.3, at: t, ms: 90 / TEMPO };
        callbacks.current.onSmash?.(smashed, final);
      }
      if (!landed && t >= tl.landAt + LANDED_DELAY_MS) {
        landed = true;
        callbacks.current.onLanded();
      }

      const pu = (t - lastSmash.at) / PUNCH_MS;                                     // camera punch-in on impact
      F = F0 * (1 + (pu >= 0 && pu < 1 ? 0.16 * power(lastSmash.gate || 1) * (1 - pu) * (1 - pu) : 0));
      const cam = camZ(t);
      const open = smashed >= tl.tier;                     // the last gate is down: the light beyond
      const wallAt = open ? Infinity : (smashed + 1) * GAP;
      const s = shake.amp * Math.max(0, 1 - (t - shake.at) / SHAKE_MS);
      ctx.setTransform(1, 0, 0, 1, Math.round((Math.random() * 2 - 1) * s), Math.round((Math.random() * 2 - 1) * s));
      ctx.fillStyle = "#000";
      ctx.fillRect(-8, -8, W + 16, H + 16);

      // walls: nested slices, near to far, each a band of its segment's colour
      let z = (Math.floor((cam + 0.05) / STEP) + 1) * STEP;
      for (; z < Math.min(cam + VIEW, wallAt); z += STEP) {
        const r = rect(z, cam);
        const fog = (z - cam) / VIEW;
        const seg = Math.min(7, Math.max(1, Math.ceil(z / GAP - 1e-9)));
        let c: Rgb;
        if (z > tl.tier * GAP) {
          const p = PALETTE[tl.tier];                          // the walkout light: brighter further in
          c = mix(Math.floor(z / STEP) % 2 ? p.light : mix(p.light, p.wall, 0.45), WHITE, Math.min(0.75, fog * 0.7));
        } else {
          const p = PALETTE[seg];
          c = mix(Math.floor(z / STEP) % 2 ? p.wall : p.stripe, BLACK, Math.min(0.9, fog * 1.1));
        }
        ctx.fillStyle = css(c);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        if (Number.isInteger(z) && z % GAP !== 0 && z <= tl.tier * GAP) {          // lamps along the walls
          ctx.fillStyle = css(mix(PALETTE[seg].light, BLACK, fog));
          const k = Math.max(1, Math.round(r.s * 0.03));
          for (const [lx, ly] of [[r.x, r.y], [r.x + r.w - k, r.y], [r.x, r.y + r.h - k], [r.x + r.w - k, r.y + r.h - k]])
            ctx.fillRect(lx, ly, k, k);
        }
      }
      if (wallAt !== Infinity) drawWall(smashed + 1, cam, t);
      else if (z >= cam + VIEW) {
        const r = rect(cam + VIEW, cam);
        ctx.fillStyle = css(mix(PALETTE[tl.tier].light, WHITE, 0.8));
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }

      if (open) {                                          // light rays turning slowly round the vanishing point
        const img = ctx.getImageData(0, 0, W, H);
        const rot = t * 0.0004;
        const glow = Math.min(1, (t - tl.landAt) / 500);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const a = Math.atan2(y - VY, x - CX) + rot;
            if (Math.floor((a + Math.PI * 2) / (Math.PI / 8)) % 2) continue;
            const i = (y * W + x) * 4;
            const k = 0.22 * glow * Math.max(0, 1 - Math.hypot((x - CX) / CX, (y - VY) / VY) / 1.2);
            img.data[i] += (255 - img.data[i]) * k;
            img.data[i + 1] += (255 - img.data[i + 1]) * k;
            img.data[i + 2] += (255 - img.data[i + 2]) * k;
          }
        }
        ctx.putImageData(img, 0, 0);
      }

      const bz = ballZ(t);
      if (bz < cam + VIEW && bz <= wallAt) drawBall(bz, cam, t);

      for (let i = smashes.length - 1; i >= 0; i--) {     // broken gates still ahead, and their shockwave rings
        const sm = smashes[i];
        if (sm.gate * GAP - cam < 0.06 && t - sm.at > RING_MS) { smashes.splice(i, 1); continue; }
        drawBrokenWall(sm, cam, t);
        const u = (t - sm.at) / RING_MS;
        if (u < 1 && sm.gate * GAP - cam > 0.06) {
          const r = rect(sm.gate * GAP, cam);
          const f = 0.35 + 1.3 * u;
          const hw = HW * f * r.s, hh = HH * f * r.s, cy = VY + BALL_Y * r.s;
          ctx.strokeStyle = css(mix(PALETTE[sm.gate].light, WHITE, 0.4), 1 - u);
          ctx.lineWidth = 2;
          ctx.strokeRect(Math.round(CX - hw) + 0.5, Math.round(cy - hh) + 0.5, Math.round(hw * 2), Math.round(hh * 2));
        }
      }

      for (let i = debris.length - 1; i >= 0; i--) {
        const p = debris[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
        p.vy += (p.kind === "dust" ? 0.2 : 2.6) * dt;
        if (p.kind === "dust") { p.vx *= 0.96; p.vy *= 0.96; p.size += 0.25 * dt; }
        const d = p.z - cam;
        const age = t - p.born;
        if (d < 0.04 || age > p.life) { debris.splice(i, 1); continue; }
        const sc = F / d;
        const sx = CX + p.x * sc, sy = VY + p.y * sc;
        if (p.kind === "chip") {
          ctx.fillStyle = css(p.c);
          ctx.fillRect(Math.round(sx), Math.round(sy), Math.max(1, Math.round(p.size * sc)), Math.max(1, Math.round(p.size * sc)));
        } else if (p.kind === "dust") {
          const sz = Math.max(1, Math.round(p.size * sc));
          ctx.fillStyle = css(p.c, 0.45 * (1 - age / p.life));
          ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy - sz / 2), sz, sz);
        } else {                                                                     // a tumbling brick: it flips as it spins
          const w = Math.max(1, Math.round(p.size * sc * (0.35 + 0.65 * Math.abs(Math.cos(p.rot)))));
          const h = Math.max(1, Math.round(p.size * sc * 0.55 * (0.35 + 0.65 * Math.abs(Math.sin(p.rot)))));
          const x0 = Math.round(sx - w / 2), y0 = Math.round(sy - h / 2);
          ctx.fillStyle = css(p.edge);
          ctx.fillRect(x0, y0, w, h);
          if (w > 2 && h > 2) {
            ctx.fillStyle = css(p.c);
            ctx.fillRect(x0, y0, w - 1, h - 1);
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

      if (!open) {                                         // speed lines, more of them the faster we go
        const speed = (depthAt(tl, t + 16) - depthAt(tl, t)) * GAP;
        const n = Math.round(speed * 60);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const r0 = (0.5 + Math.random() * 0.5) * CX, len = (0.04 + Math.random() * 0.09) * W;
          for (let k = 0; k < len; k += 1)
            ctx.fillRect(Math.round(CX + Math.cos(a) * (r0 + k)), Math.round(VY + Math.sin(a) * (r0 + k) * (H / W)), 1, 1);
        }
      }

      const f = flash.amp * Math.max(0, 1 - (t - flash.at) / flash.ms);
      if (f > 0) {
        ctx.fillStyle = `rgba(255,255,255,${f})`;
        ctx.fillRect(-8, -8, W + 16, H + 16);
      }

      if (t < tl.landAt + STOP_AFTER_MS || debris.length || sparks.length) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [tier]);

  return (
    <canvas ref={canvasRef} className="tunnel" width={160} height={100} onPointerDown={() => { skipRef.current = true; }}
            aria-label={`Revealing your tier: ${TIERS[Math.min(7, Math.max(1, tier)) - 1].name}`} />
  );
}
