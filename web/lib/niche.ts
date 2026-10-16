// The Niche-o-meter (user, 2026-10-16): type a player, get 1-100 for how niche they are. Pure functions, no I/O: the
// data (web/data/niche-players.json, from pipeline/jobless/niche.py) is loaded by lib/niche-server.ts.
//
// The score comes from the player's fame rank (1 = the most famous of the ~178,000 players we track), on a log scale
// through the game's own tier boundaries. Anyone with ANY fame (a Wikipedia article in some language) is capped at
// NICHE_CAP = 96. Only players with no fame at all can score 97-100, spread by their depth (see the pipeline module).
import { normalize } from "./matching/match.ts";

/** [fame rank, fame, one-line description, depth 0-100 (only used when fame is 0)] */
export type NichePlayer = [number, number, string, number];
export type NicheData = { n: number; p: Record<string, NichePlayer> };
export type NicheResult = { id: string; name: string; line: string; score: number; label: string; percent: number; rank: number };

export const NICHE_CAP = 96;
export const NOT_FOUND_MESSAGE = "Even we don't know who that is";

// [rank, score]: tier boundaries of the game (300, 1,000, 2,000, 5,000, 12,000, 32,000), then the last player with fame.
const ANCHORS: [number, number][] = [[1, 1], [300, 15], [1_000, 28], [2_000, 38], [5_000, 50], [12_000, 64], [32_000, 78], [172_000, NICHE_CAP]];

export function nicheScore([rank, fame, , depth]: NichePlayer): number {
  if (fame <= 0) return Math.round(97 + 3 * Math.max(0, Math.min(100, depth)) / 100);   // no fame at all: 97-100
  const r = Math.max(1, rank);
  let score = NICHE_CAP;
  for (let i = 1; i < ANCHORS.length; i++) {
    const [r1, s1] = ANCHORS[i];
    if (r <= r1) {
      const [r0, s0] = ANCHORS[i - 1];
      score = s0 + (s1 - s0) * (Math.log(r / r0) / Math.log(r1 / r0));
      break;
    }
  }
  return Math.min(NICHE_CAP, Math.max(1, Math.round(score)));
}

export function nicheLabel(score: number): string {
  if (score >= 97) return "Nobody on earth knows them";
  if (score >= 85) return "Basically a secret";
  if (score >= 66) return "Only the dedicated know them";
  if (score >= 46) return "Deep-cut knowledge";
  if (score >= 26) return "Known to proper fans";
  if (score >= 11) return "A household name";
  return "Everyone has heard of them";
}

/** The share of tracked players who are better known than this one, 0-99. */
export function moreNichePercent(rank: number, n: number): number {
  return Math.max(0, Math.min(99, Math.floor(((rank - 1) / n) * 100)));
}

/** The line under the score. 'More niche than 0%' reads oddly for a star, so the top few percent are counted in players. */
export function betterKnownLine(rank: number, n: number): string {
  const total = n.toLocaleString("en-US");
  const better = rank - 1;
  if (better < 1) return "Nobody we track is better known.";
  if (moreNichePercent(rank, n) < 5) return `Only ${better.toLocaleString("en-US")} ${better === 1 ? "player" : "of the " + total + " players"} we track ${better === 1 ? "is" : "are"} better known.`;
  return `More niche than ${moreNichePercent(rank, n)}% of the ${total} players we track.`;
}

export function describe(data: NicheData, id: string, name: string): NicheResult | null {
  const p = data.p[id];
  if (!p) return null;
  const score = nicheScore(p);
  return { id, name, line: p[2], score, label: nicheLabel(score), percent: moreNichePercent(p[0], data.n), rank: p[0] };
}

export type SearchIndex = { ids: string[]; names: string[]; norms: string[]; alias: boolean[] };

/** `rows`: [player id, name]; the first row of each id is the real name, later ones are nicknames and variants. */
export function buildSearchIndex(rows: [string, string][]): SearchIndex {
  const seen = new Set<string>();
  const alias = rows.map(([id]) => (seen.has(id) ? true : (seen.add(id), false)));
  return { ids: rows.map((r) => r[0]), names: rows.map((r) => r[1]), norms: rows.map((r) => normalize(r[1])), alias };
}

export const MIN_QUERY = 2;
export const MAX_QUERY = 60;

/** Up to `limit` player ids for what was typed, each once. Accents and capitals don't matter. Better matches first: the
 *  whole name, then the start of the name or of any word, then anywhere in it; a match on a nickname comes after all of
 *  the real-name matches ('Haaland of temu' is a nickname of someone else). The most famous first within each. */
export function searchNames(index: SearchIndex, query: string, rankOf: (id: string) => number, limit = 6): string[] {
  const q = normalize(query.slice(0, MAX_QUERY));
  if (q.length < MIN_QUERY) return [];
  const best = new Map<string, [number, number]>();      // id -> [kind of match, fame rank]
  for (let i = 0; i < index.norms.length; i++) {
    const n = index.norms[i];
    const at = n.indexOf(q);
    if (at < 0) continue;
    const kind = (n === q ? 0 : at === 0 || n[at - 1] === " " ? 1 : 2) + (index.alias[i] ? 3 : 0);
    const id = index.ids[i];
    const seen = best.get(id);
    if (!seen || kind < seen[0]) best.set(id, [kind, rankOf(id)]);
  }
  return [...best.entries()].sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).slice(0, limit).map(([id]) => id);
}
