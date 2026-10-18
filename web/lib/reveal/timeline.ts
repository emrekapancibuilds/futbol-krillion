// Timing of the tunnel reveal: a ball smashes through one gate per tier, faster at every gate. For True
// Analyst and up it hangs just short of the last gate (the walkout pause) before the final smash.
// Depth is measured in gates: depth 3 means the ball is at gate 3.

export const TEMPO = 0.8;           // the run plays at 80% of its first speed (user, 2026-10-11)
export const FIRST_GATE_MS = 560 / TEMPO;   // launch to gate 1
export const SPEEDUP = 0.8;         // each gate comes this much quicker than the one before
export const PAUSE_MS = 550 / TEMPO;        // the hang before the last gate
export const PAUSE_FROM_TIER = 5;
const HOLD_AT = 0.72;               // where in the last stretch the ball hangs
const CREEP = 0.05;                 // how far it drifts while hanging
const RUSH = 0.6;                   // the final rush is quicker than the stretch's normal pace

type Ease = "in" | "linear" | "out";
type Segment = { t0: number; t1: number; d0: number; d1: number; ease: Ease };
export type Timeline = { tier: number; gates: number[]; landAt: number; segments: Segment[] };

export function revealTimeline(tierIn: number): Timeline {
  const tier = Math.min(7, Math.max(1, Math.round(tierIn) || 1));
  const segments: Segment[] = [];
  const gates: number[] = [];
  let t = 0;
  const push = (ms: number, d0: number, d1: number, ease: Ease) => {
    segments.push({ t0: t, t1: t + ms, d0, d1, ease });
    t += ms;
  };
  for (let i = 0; i < tier; i++) {
    const ms = FIRST_GATE_MS * SPEEDUP ** i;
    if (i === tier - 1 && tier >= PAUSE_FROM_TIER) {
      push(ms * HOLD_AT, i, i + HOLD_AT, "linear");
      push(PAUSE_MS, i + HOLD_AT, i + HOLD_AT + CREEP, "out");
      push(ms * (1 - HOLD_AT) * RUSH, i + HOLD_AT + CREEP, i + 1, "in");
    } else {
      push(ms, i, i + 1, i === 0 ? "in" : "linear");
    }
    gates.push(t);
  }
  return { tier, gates, landAt: t, segments };
}

const EASE: Record<Ease, (u: number) => number> = {
  in: (u) => u * u,
  linear: (u) => u,
  out: (u) => 1 - (1 - u) * (1 - u),
};

/** Ball depth (in gates) `t` ms after launch. */
export function depthAt(tl: Timeline, t: number): number {
  if (t <= 0) return 0;
  if (t >= tl.landAt) return tl.tier;
  const s = tl.segments.find((seg) => t < seg.t1) ?? tl.segments[tl.segments.length - 1];
  const u = (t - s.t0) / (s.t1 - s.t0);
  return s.d0 + (s.d1 - s.d0) * EASE[s.ease](u);
}
