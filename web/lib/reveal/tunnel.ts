// Smash 2.0 geometry (spec: docs/superpowers/specs/2026-10-16-matchday-scene-design.md): pure maths for the per-pixel
// tunnel, the hit-stop on each smash, and the walkout onto the stadium after the last gate. Units: the tunnel is
// 2*HW wide, gates are GAP apart, depth z runs down the tunnel; screen rays are (dx, dy, 1), so a hit's t is its depth.

export const HW = 1;
export const GAP = 3;
export const LEAD = 0.9;           // the camera trails the ball by this much
export const VIEW = 7;
export const EXIT = 1.4;           // the last stretch of tunnel after the final gate, ending at the stadium
const FILL_AT = 0.8;               // distance from the opening at which it covers the whole screen (see exitCover)

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
  const to = tier * GAP + EXIT - FILL_AT;
  const k = Math.max(0, Math.min(1, u));
  return from + (to - from) * (1 - (1 - k) * (1 - k));
}
