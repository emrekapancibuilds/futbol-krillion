import { tierInfo } from "./tiers.ts";

const fmt = (n: number) => n.toLocaleString("en-US");

/** Plain-text result for the share sheet (spec §7). `game` is the daily's number or an Unlimited label;
 *  `tiers[i]` is null for a missed round. */
export function shareText(game: number | string, points: number[], tiers: (number | null)[], url: string): string {
  const total = points.reduce((a, b) => a + b, 0);
  const best = tiers.filter((t): t is number => t !== null).sort((a, b) => b - a)[0];
  return [
    `Futkrill ${typeof game === "number" ? `#${game}` : game} · ${fmt(total)} / 7,000`,
    points.join(" · "),
    `Best pick: ${best ? tierInfo(best).name : "none"}`,
    url,
  ].join("\n");
}

/** Streak after finishing daily `day`, given what was stored last time. */
export function streakAfter(prev: { last: number; streak: number } | null, day: number): number {
  if (!prev) return 1;
  if (prev.last === day) return prev.streak;
  return prev.last === day - 1 ? prev.streak + 1 : 1;
}
