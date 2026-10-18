// The ball drop (spec: docs/superpowers/specs/2026-10-18-clean-revamp-design.md): after an accepted answer a ball drops
// through seven levels, one per tier, and hits the floor of the answer's level. Depth is measured in levels: 0 is the
// top of the first level (World Cup Bandwagon), the floor of level N is at N. The ball falls under gravity, so the
// rarer the answer, the further and longer it falls; then it squashes, bounces twice and settles.

export const START = -0.7;          // the ball starts this far above the first level
const G = 3.2;                      // levels per second squared, falling
const G_BOUNCE = 10;                // the bounces are snappier than the fall (a level is a big step on screen)
const SQUASH_MS = 130;

export type DropPlan = {
  tier: number;
  floor: number;
  impactMs: number;                                         // when it first hits the floor
  bounces: { start: number; end: number; height: number }[];
  settleMs: number;                                         // when it comes to rest
};

export function dropPlan(tierIn: number): DropPlan {
  const tier = Math.min(7, Math.max(1, Math.round(tierIn) || 1));
  const fall = tier - START;
  const impactMs = Math.sqrt((2 * fall) / G) * 1000;
  const first = Math.min(0.17, 0.035 * fall);
  const bounces: DropPlan["bounces"] = [];
  let at = impactMs;
  for (const height of [first, first * 0.3]) {
    const dur = 2 * Math.sqrt((2 * height) / G_BOUNCE) * 1000;
    bounces.push({ start: at, end: at + dur, height });
    at += dur;
  }
  return { tier, floor: tier, impactMs, bounces, settleMs: at };
}

/** Where the ball is `ms` after the drop starts (in levels), how squashed it is (0..1) and whether it has landed. */
export function ballAt(plan: DropPlan, ms: number): { y: number; squash: number; landed: boolean } {
  if (ms < plan.impactMs) {
    const t = Math.max(0, ms) / 1000;
    return { y: START + 0.5 * G * t * t, squash: 0, landed: false };
  }
  let squash = 0;
  const contacts = [plan.impactMs, ...plan.bounces.slice(0, -1).map((b) => b.end)];
  contacts.forEach((c, i) => {
    const u = ms - c;
    if (u >= 0 && u < SQUASH_MS) squash = Math.max(squash, (1 - u / SQUASH_MS) * (i === 0 ? 1 : 0.5));
  });
  for (const b of plan.bounces) {
    if (ms >= b.start && ms < b.end) {
      const u = (ms - b.start) / (b.end - b.start);
      return { y: plan.floor - 4 * b.height * u * (1 - u), squash, landed: true };
    }
  }
  return { y: plan.floor, squash, landed: true };
}

const TOP = [0xf4, 0xf7, 0xfc];
const BOTTOM = [0x0f, 0x1f, 0x4b];   // the site's navy

/** The background of a level: nearly white for World Cup Bandwagon, deepening to navy for Jobless. */
export function levelShade(level: number): string {
  const t = Math.pow((Math.min(7, Math.max(1, level)) - 1) / 6, 1.15);
  return "#" + TOP.map((v, i) => Math.round(v + (BOTTOM[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
