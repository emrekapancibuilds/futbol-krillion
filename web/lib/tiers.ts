// Tier names, points and quips (spec §2). Icons are the pixel art in public/art.
export const TIERS = [
  { tier: 1, name: "World Cup Bandwagon", points: 10, quip: "You only watch the World Cup.", icon: "/art/tier-1-bandwagon.png" },
  { tier: 2, name: "Glory Hunter", points: 40, quip: "Supports whoever won the league last season.", icon: "/art/tier-2-glory-hunter.png" },
  { tier: 3, name: "Part-Time Fan", points: 80, quip: "Catches the highlights. Respectable.", icon: "/art/tier-3-part-time-fan.png" },
  { tier: 4, name: "Season Ticket Holder", points: 160, quip: "Rain or shine, you're in your seat.", icon: "/art/tier-4-season-ticket.png" },
  { tier: 5, name: "True Analyst", points: 320, quip: "Owns a tactics board. Uses it.", icon: "/art/tier-5-true-analyst.png" },
  { tier: 6, name: "Insane Ball Knowledge", points: 640, quip: "Genuinely concerning ball knowledge.", icon: "/art/tier-6-insane-ball-knowledge.png" },
  { tier: 7, name: "Jobless", points: 1000, quip: "Go outside. Seriously.", icon: "/art/tier-7-jobless.png" },
] as const;

export const MAX_SCORE = 7_000;

/** Tunnel colours for the reveal: wall, darker wall stripe, and the bright trim/light of each tier. */
export const TIER_COLORS: Record<number, { wall: string; stripe: string; light: string }> = {
  1: { wall: "#6e6152", stripe: "#544a3f", light: "#c9a27a" },   // dull bronze-grey
  2: { wall: "#7d8796", stripe: "#5f6774", light: "#e6ecf4" },   // silver
  3: { wall: "#2f7d45", stripe: "#225c33", light: "#6cf08f" },   // green
  4: { wall: "#2c55b0", stripe: "#203f85", light: "#6fa8ff" },   // blue
  5: { wall: "#6a3cb8", stripe: "#4e2b8a", light: "#c69bff" },   // purple
  6: { wall: "#b33a1c", stripe: "#862913", light: "#ff9a3c" },   // red-orange fire
  7: { wall: "#141108", stripe: "#0a0905", light: "#ffce48" },   // black with gold light
};

export function tierInfo(tier: number) {
  return TIERS[tier - 1];
}
