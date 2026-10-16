// Server-only: loads the Niche-o-meter data once and answers searches (see lib/niche.ts).
import fs from "node:fs";
import path from "node:path";

import { buildSearchIndex, describe, searchNames, type NicheData, type NicheResult, type SearchIndex } from "./niche.ts";

const DIR = path.join(process.cwd(), "data");
let data: NicheData | null = null;
let index: SearchIndex | null = null;
let names: Map<string, string> | null = null;

function load() {
  if (data && index && names) return { data, index, names };
  data = JSON.parse(fs.readFileSync(path.join(DIR, "niche-players.json"), "utf8")) as NicheData;
  const rows = (JSON.parse(fs.readFileSync(path.join(DIR, "names-player.json"), "utf8")) as [string, string][]).filter(([id]) => id in data!.p);
  index = buildSearchIndex(rows);
  names = new Map();
  for (const [id, name] of rows) if (!names.has(id)) names.set(id, name);      // the first listed name is the canonical one
  return { data, index, names };
}

/** Up to 6 players for what was typed, with their niche score. Empty when nobody matches. */
export function findPlayers(query: string): NicheResult[] {
  const { data, index, names } = load();
  return searchNames(index, query, (id) => data.p[id][0])
    .map((id) => describe(data, id, names.get(id) ?? id))
    .filter((r): r is NicheResult => r !== null);
}

/** How many players the Niche-o-meter tracks. */
export function nicheTotal(): number {
  return load().data.n;
}
