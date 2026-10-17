// Tunnel geometry and smash timing (specs: docs/superpowers/specs/2026-10-16-matchday-scene-design.md and
// 2026-10-17-scene-2-design.md): pure maths for the per-pixel tunnel, the hit-stop on each smash, the slow motion before
// the last gate, which fireworks each gate brings, lightning bolts, and the walkout onto the stadium after the last
// gate. Units: the tunnel is 2*HW wide, gates are GAP apart, depth z runs down the tunnel; screen rays are (dx, dy, 1),
// so a hit's t is its depth.

import { PAUSE_FROM_TIER, type Timeline } from "./timeline.ts";

export const HW = 1;
export const GAP = 3;
export const LEAD = 0.9;           // the camera trails the ball by this much
export const VIEW = 7;
export const EXIT = 1.4;           // the last stretch of tunnel after the final gate, ending at the stadium
export const FOCAL = 0.4375;       // focal length as a share of the canvas width
const FILL_AT = 2 * HW * FOCAL;     // distance at which the opening (the tunnel's cross-section) just fills the screen

export type Hit = { t: number; surface: "wall" | "ceiling" | "floor"; u: number };

/** Where the ray through pixel (px, py) hits the tunnel: its depth `t`, the surface, and `u` across that surface
 *  (-1..1: top to bottom on a wall, left to right on the ceiling or floor). */
export function castTunnel(px: number, py: number, cx: number, vy: number, f: number, hh: number): Hit {
  const rx = (px - cx) / f, ry = (py - vy) / f;
  const ts = rx !== 0 ? HW / Math.abs(rx) : Infinity;
  const tf = ry !== 0 ? hh / Math.abs(ry) : Infinity;
  if (ts < tf) return { t: ts, surface: "wall", u: (ry * ts) / hh };
  return { t: tf, surface: ry < 0 ? "ceiling" : "floor", u: (rx * tf) / HW };
}

/** How long the picture freezes on a smash: a beat that grows with the gate, longest for the final one. */
export function hitStopMs(gate: number, final: boolean): number {
  return final ? 130 : 34 + gate * 4;
}

/** Share of the screen width the stadium opening covers when it is `d` ahead of the camera (>= 1: all of it). */
export function exitCover(d: number): number {
  return d <= 0 ? Infinity : FILL_AT / d;
}

/** Camera depth during the walkout, `u` = 0..1 through it: from just behind the last gate to where the opening
 *  fills the screen, easing out. */
export function settleCam(tier: number, u: number): number {
  const from = tier * GAP - LEAD;
  const to = tier * GAP + EXIT - FILL_AT * 0.9;        // a little past full: the shake zoom never shows an edge
  const k = Math.max(0, Math.min(1, u));
  return from + (to - from) * (1 - (1 - k) * (1 - k));
}

/** How long (ms of the run's own timeline) time runs slow right before the final gate: longer for rarer tiers. */
export function slowWindow(tier: number): number {
  return 90 + 25 * tier;
}

/** How much of the run's timeline actually runs slow: the full window, except where the run already hangs before the
 *  last gate (True Analyst and up), where only the final rush after the hang does. */
export function slowSpan(tl: Timeline): number {
  const finalAt = tl.gates[tl.tier - 1];
  if (tl.tier < PAUSE_FROM_TIER) return slowWindow(tl.tier);
  return Math.min(slowWindow(tl.tier), finalAt - tl.segments[tl.segments.length - 1].t0);
}

/** How fast the run's clock goes at timeline time `t` (1 = normal): slower for the last `window` ms before the final
 *  gate at `finalAt`, and slowest for the rarest tiers. */
export function slowMo(tier: number, t: number, finalAt: number, window = slowWindow(tier)): number {
  return t >= finalAt - window && t < finalAt ? 0.55 - 0.045 * tier : 1;
}

/** What a smash through `gate` sets off: polygon shards always (more for deeper gates), electric arcs from gate 5,
 *  embers from 6, and gold lightning with confetti for the final smash at 7. A smaller show on the way through. */
export function tierEffects(gate: number, final: boolean) {
  const k = final ? 1 : 0.45;
  return {
    shards: Math.round((18 + gate * 8) * (final ? 1.4 : 1)),
    arcs: gate >= 5 ? (k * (gate - 4)) / 3 : 0,
    embers: gate >= 6 ? (k * (gate - 5)) / 2 : 0,
    gold: gate >= 7 && final,
    confetti: gate >= 7 && final,
  };
}

/** A lightning bolt from (x0, y0) to (x1, y1): midpoint displacement, never straying more than `jag` of its length
 *  from the straight line. 17 points. */
export function bolt(x0: number, y0: number, x1: number, y1: number, jag: number, rand: () => number): [number, number][] {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  let pts: [number, number, number][] = [[x0, y0, 0], [x1, y1, 0]];        // x, y, offset from the line
  let amp = jag * L * 0.5;
  for (let level = 0; level < 4; level++) {
    const next: [number, number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, ao] = pts[i - 1], [bx, by, bo] = pts[i];
      const d = (2 * rand() - 1) * amp;
      const o = (ao + bo) / 2 + d;
      const mx = (ax + bx) / 2 - nx * ((ao + bo) / 2) + nx * o, my = (ay + by) / 2 - ny * ((ao + bo) / 2) + ny * o;
      next.push([mx, my, o], pts[i]);
    }
    pts = next;
    amp /= 2;
  }
  return pts.map(([x, y]) => [x, y]);
}
