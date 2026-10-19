// Timing of the tunnel reveal: a ball smashes through one gate per tier, faster at every gate, and every run ends with
// a tease (user, 2026-10-19: "is it going to break through?"). The ball rams a gate, bounces back off it, rams it again
// and pushes while time slows and the cracks spread. On a break (30% of runs, and always for Jobless) that gate is the
// answer's own last gate and the ball smashes through and walks out. On a hold (the other 70%) the ball has already
// smashed the answer's gate on the way, the gate it rams is the next tier's, and it holds: the ball bounces off and drops.
// The tier the run ends on is always the answer's real tier. Depth is measured in gates: depth 3 means the ball is at gate 3.

export const TEMPO = 0.8;           // the run plays at 80% of its first speed (user, 2026-10-11)
export const FIRST_GATE_MS = 560 / TEMPO;   // launch to gate 1
export const SPEEDUP = 0.8;         // each gate comes this much quicker than the one before
export const BREAK_CHANCE = 0.3;    // how often the tease breaks through (user, 2026-10-19)
export const STRAIN_RATE = 0.5;     // the clock runs at half speed during the push
const CONTACT = 0.04;               // the ball touches a gate this far (in gates) before it
const RECOIL = 0.14;                // how far it bounces back off the first ram
const RECOIL_MS = 210 / TEMPO;
const CHARGE_MS = 150 / TEMPO;      // back into the gate for the second ram
const PUSH = 0.02;                  // the gate gives a little under the push
const BREAK_MS = 70 / TEMPO;        // from the end of the push to the smash
const BOUNCE = 0.18;                // on a hold, how far the ball rebounds off the gate
const BOUNCE_MS = 420 / TEMPO;
const CAM_BACK = 0.12;              // and how much further the camera backs off, so the ball comes to rest in view
const FADE_MS = 300 / TEMPO;        // the strain fading after a hold
const strainMs = (tier: number) => (190 + 45 * tier) / TEMPO;   // the push, in timeline ms (it runs slow)

export type Outcome = "break" | "hold";
type Ease = "in" | "linear" | "out";
type Segment = { t0: number; t1: number; d0: number; d1: number; ease: Ease };
export type Timeline = {
  tier: number;
  outcome: Outcome;
  gates: number[];                  // when each of the tier's gates is smashed
  teaseGate: number;                // the gate the ball rams: its own last gate on a break, the next tier's on a hold
  rams: number[];                   // the two rams into the tease gate
  strain: [number, number];         // the push after the second ram
  bounceAt: number | null;          // a hold: when the ball gives up and bounces off
  landAt: number;
  segments: Segment[];
};

/** Break or hold, from a roll in 0..1. Jobless always breaks: there is no gate past it to fail at. */
export function teaseOutcome(tier: number, roll: number): Outcome {
  return tier >= 7 || roll < BREAK_CHANCE ? "break" : "hold";
}

export function revealTimeline(tierIn: number, outcomeIn: Outcome): Timeline {
  const tier = Math.min(7, Math.max(1, Math.round(tierIn) || 1));
  const outcome: Outcome = tier >= 7 ? "break" : outcomeIn;
  const teaseGate = outcome === "break" ? tier : tier + 1;
  const segments: Segment[] = [];
  const gates: number[] = [];
  const rams: number[] = [];
  let t = 0;
  const push = (ms: number, d0: number, d1: number, ease: Ease) => {
    segments.push({ t0: t, t1: t + ms, d0, d1, ease });
    t += ms;
  };
  for (let i = 0; i < teaseGate - 1; i++) {             // straight through every gate before the tease
    push(FIRST_GATE_MS * SPEEDUP ** i, i, i + 1, i === 0 ? "in" : "linear");
    gates.push(t);
  }
  const G = teaseGate, touch = G - CONTACT;
  push(FIRST_GATE_MS * SPEEDUP ** (G - 1), G - 1, touch, G === 1 ? "in" : "linear");
  rams.push(t);
  push(RECOIL_MS, touch, touch - RECOIL, "out");
  push(CHARGE_MS, touch - RECOIL, touch, "in");
  rams.push(t);
  const s0 = t;
  push(strainMs(tier), touch, touch + PUSH, "out");
  const strain: [number, number] = [s0, t];
  let bounceAt: number | null = null;
  if (outcome === "break") {
    push(BREAK_MS, touch + PUSH, G, "in");
    gates.push(t);
  } else {
    bounceAt = t;
    push(BOUNCE_MS, touch + PUSH, touch - BOUNCE, "out");
  }
  return { tier, outcome, gates, teaseGate, rams, strain, bounceAt, landAt: t, segments };
}

const EASE: Record<Ease, (u: number) => number> = {
  in: (u) => u * u,
  linear: (u) => u,
  out: (u) => 1 - (1 - u) * (1 - u),
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Ball depth (in gates) `t` ms after launch. */
export function depthAt(tl: Timeline, t: number): number {
  if (t <= 0) return 0;
  const end = tl.segments[tl.segments.length - 1];
  if (t >= tl.landAt) return end.d1;
  const s = tl.segments.find((seg) => t < seg.t1) ?? end;
  const u = (t - s.t0) / (s.t1 - s.t0);
  return s.d0 + (s.d1 - s.d0) * EASE[s.ease](u);
}

/** How fast the run's clock goes at timeline time `t` (1 = normal): slow during the push. */
export function clockRate(tl: Timeline, t: number): number {
  return t >= tl.strain[0] && t < tl.strain[1] ? STRAIN_RATE : 1;
}

/** How hard the ball is pushing, 0..1: it builds through the push, ends with the smash, and fades after a hold. */
export function strainAt(tl: Timeline, t: number): number {
  const [s0, s1] = tl.strain;
  if (t < s0) return 0;
  if (t < s1) return (t - s0) / (s1 - s0);
  if (tl.outcome === "break") return t < tl.landAt ? 1 : 0;
  return clamp01(1 - (t - s1) / FADE_MS);
}

/** How far the tease gate has cracked, 0..1: a little on the first ram, more on the second, almost through by the end
 *  of the push. It never heals. */
export function crackAt(tl: Timeline, t: number): number {
  const [r1, r2] = tl.rams;
  if (t < r1) return 0;
  if (t < r2) return 0.32 + 0.08 * clamp01((t - r1) / RECOIL_MS);
  const u = clamp01((t - tl.strain[0]) / (tl.strain[1] - tl.strain[0]));
  const c = 0.55 + 0.4 * (1 - (1 - u) * (1 - u));
  return tl.outcome === "break" && t >= tl.landAt ? 1 : c;
}

/** After a hold, how much further (in gates) the camera has backed off than the ball. */
export function camBack(tl: Timeline, t: number): number {
  if (tl.bounceAt === null || t <= tl.bounceAt) return 0;
  return CAM_BACK * EASE.out(clamp01((t - tl.bounceAt) / (tl.landAt - tl.bounceAt)));
}
