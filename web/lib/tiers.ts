import { MAX_STREAK_BONUS } from "./game/streak.ts";

// Tier names, points, quips and colours (spec §2). Points: 5, 10, 20, 30, 60, 100, 200 (user, 2026-10-14; they were
// 10 ... 1,000). pipeline/jobless/config.py has the same ladder and the prompt files carry it; lib/tiers.test.ts checks
// they agree. Each tier has its own colour for its badge (components/Brand.tsx), its column and its level in the drop.
export const TIERS = [
  { tier: 1, name: "World Cup Bandwagon", points: 5, quip: "You only watch the World Cup.", color: "#8A94A6" },
  { tier: 2, name: "Glory Hunter", points: 10, quip: "Supports whoever won the league last season.", color: "#4F7CC2" },
  { tier: 3, name: "Part-Time Fan", points: 20, quip: "Catches the highlights. Respectable.", color: "#1F9D55" },
  { tier: 4, name: "Season Ticket Holder", points: 30, quip: "Rain or shine, you're in your seat.", color: "#2563EB" },
  { tier: 5, name: "True Analyst", points: 60, quip: "Owns a tactics board. Uses it.", color: "#7C3AED" },
  { tier: 6, name: "Insane Ball Knowledge", points: 100, quip: "Genuinely concerning ball knowledge.", color: "#E2571B" },
  { tier: 7, name: "Jobless", points: 200, quip: "Go outside. Seriously.", color: "#D9A206" },
] as const;

// 7 rounds of Jobless, plus what a perfect streak earns (lib/game/streak.ts).
export const MAX_SCORE = 7 * 200 + MAX_STREAK_BONUS;

export function tierInfo(tier: number) {
  return TIERS[tier - 1];
}
