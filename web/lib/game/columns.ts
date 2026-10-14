// The end-of-set column chart and the answer pop-up share two small rules (pure, so they are unit tested).

/** How high a round's column stands: 0 for a pass or a miss, otherwise its tier (1-7). */
export function columnLevel(r: { status: string; tier: number | null }): number {
  return r.status === "accepted" && r.tier ? r.tier : 0;
}

export type ListedAnswer = { name: string; fact: string; you?: boolean; added?: boolean };   // added: not in the server's top list
export type TierList = { tier: number; points: number; count: number; top: ListedAnswer[] };

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Marks the player's own answer in the revealed lists. The server only sends the top few of each tier, so an
 *  answer outside them is added to its tier (at the end of the shown names) so it can always be found. */
export function withYou(tiers: TierList[], mine: { name?: string; tier: number | null; fact?: string }): TierList[] {
  if (!mine.name || !mine.tier) return tiers;
  const name = key(mine.name);
  return tiers.map((t) => {
    if (t.tier !== mine.tier) return t;
    const top = t.top.map((a) => (key(a.name) === name ? { ...a, you: true } : a));
    if (!top.some((a) => a.you)) top.push({ name: mine.name!, fact: mine.fact ?? "", you: true, added: true });
    return { ...t, top };
  });
}
