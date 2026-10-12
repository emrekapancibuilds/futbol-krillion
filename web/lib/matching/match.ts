// Forgiving answer checking (spec §6). Pure TypeScript, no dependencies, runs on the server only.
//
// Order: exact name or alias -> initial + surname -> surname (single word; shared surnames go to the least niche
// player) -> exact name of someone who is NOT a valid answer (reject) -> spelling mistakes within a length rule,
// unless an invalid person's name is at least as close -> sounds-alike surname -> reject.
// Only an exact name or alias is `exact`; everything else is a suggestion the player confirms ("Bale -> Gareth Bale?").

export type Answer = { id: string; name: string; tier: number; points: number; fact: string; variants: string[] };
export type NameRow = [entityId: string, name: string];

type Keyed = Map<string, number[]>; // normalized key -> answer indexes (ascending = more famous first)

export type PromptIndex = {
  answers: Answer[];
  ids: Set<string>;
  exact: Keyed;     // whole names and aliases only
  full: Keyed;      // whole names, aliases, "initial surname"
  single: Keyed;    // one-word keys: surnames and one-word names (Kaká, Pepe)
  phonetic: Keyed;  // sounds-alike key of each surname
};

export type GlobalIndex = {
  exact: Map<string, Set<string>>;                 // full names and one-word names -> entity ids
  fullByLen: Map<number, [string, Set<string>][]>;
  singleByLen: Map<number, [string, Set<string>][]>;
};

const SPECIAL: Record<string, string> = {
  "ß": "ss", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae", "œ": "oe", "Œ": "oe", "ł": "l", "Ł": "l",
  "đ": "d", "Đ": "d", "ı": "i", "þ": "th", "Þ": "th", "ð": "d", "Ð": "d",
};

export function normalize(text: string, dropClubWords = false): string {
  let t = text.replace(/[ßøØæÆœŒłŁđĐıþÞðÐ]/g, (ch) => SPECIAL[ch] ?? ch);
  t = t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  t = t.replace(/['’`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (dropClubWords) t = t.split(" ").filter((w) => !["fc", "afc", "cf", "the"].includes(w)).join(" ");
  return t;
}

/** Typos allowed for a key of this length: <=3: 0, 4-5: 1, 6-8: 2, 9-12: 3, 13+: 4 (a bit more lenient since
 *  2026-10-11; every corrected answer is confirmed by the player anyway). */
export function allowedTypos(key: string): number {
  const n = key.replace(/ /g, "").length;
  return n <= 3 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 4;
}

/** How many letters a guess may be short of (or longer than) a name and still count as a misspelling: a spelling
 *  slip, not a half-typed name that we would be filling in. */
function lengthSlack(key: string): number {
  return key.replace(/ /g, "").length > 8 ? 2 : 1;
}

/** A guess that is just the start of a name ('Bal', 'Griezm') is completion, not a misspelling: it stays as strict
 *  as ever, at most one missing letter, and none for names of 4 letters or fewer. */
function tooShortAPrefix(q: string, key: string): boolean {
  if (!key.startsWith(q) || key === q) return false;
  return key.length - q.length > (key.replace(/ /g, "").length <= 4 ? 0 : 1);
}

/** Optimal-string-alignment Damerau-Levenshtein distance; returns max+1 as soon as it must exceed `max`. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  let prev2 = new Array<number>(n + 1).fill(0);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/** Simplified sounds-alike key for a single word (sh/sch/ch, c/k/q, z/s, w/v, ph/f; vowels dropped after the first letter). */
export function phonetic(word: string): string {
  let t = word.replace(/sch/g, "s").replace(/sh/g, "s").replace(/ph/g, "f").replace(/ch/g, "k").replace(/ck/g, "k");
  t = t.replace(/c(?=[eiy])/g, "s").replace(/[cq]/g, "k").replace(/z/g, "s").replace(/w/g, "v").replace(/[yj]/g, "i");
  const out = t[0] + t.slice(1).replace(/[aeiouh]/g, "");
  return out.replace(/(.)\1+/g, "$1");
}

function add(map: Keyed, key: string, index: number) {
  if (!key) return;
  const list = map.get(key);
  if (!list) map.set(key, [index]);
  else if (!list.includes(index)) list.push(index);
}

export function preparePrompt(answers: Answer[], dropClubWords = false): PromptIndex {
  const p: PromptIndex = { answers, ids: new Set(answers.map((x) => x.id)), exact: new Map(), full: new Map(), single: new Map(),
                           phonetic: new Map() };
  answers.forEach((ans, i) => {
    for (const v of new Set([ans.name, ...ans.variants])) {
      const key = normalize(v, dropClubWords);
      if (!key) continue;
      add(p.exact, key, i);
      const words = key.split(" ");
      if (words.length === 1) {
        add(p.single, key, i);
        add(p.full, key, i);
      } else {
        add(p.full, key, i);
        const last = words[words.length - 1];
        add(p.single, last, i);
        add(p.full, `${words[0][0]} ${words.slice(1).join(" ")}`, i);
        if (last.length > 3) add(p.phonetic, phonetic(last), i);
      }
    }
  });
  return p;
}

export function prepareGlobal(rows: NameRow[]): GlobalIndex {
  const exact = new Map<string, Set<string>>();
  const singles = new Map<string, Set<string>>();
  for (const [id, name] of rows) {
    const key = normalize(name);
    if (!key) continue;
    (exact.get(key) ?? exact.set(key, new Set()).get(key)!).add(id);
    const words = key.split(" ");
    const one = words[words.length - 1];
    (singles.get(one) ?? singles.set(one, new Set()).get(one)!).add(id);
  }
  const byLen = (m: Map<string, Set<string>>, keep: (k: string) => boolean) => {
    const out = new Map<number, [string, Set<string>][]>();
    for (const [k, ids] of m) if (keep(k)) (out.get(k.length) ?? out.set(k.length, []).get(k.length)!).push([k, ids]);
    return out;
  };
  return { exact, fullByLen: byLen(exact, (k) => k.includes(" ")), singleByLen: byLen(singles, () => true) };
}

function mostFamous(p: PromptIndex, indexes: number[]): Answer {
  return p.answers[Math.min(...indexes)];
}

/** Closest key within its typo allowance; ties go to the smaller distance, then the more famous answer. */
function fuzzy(q: string, keys: Keyed): { d: number; index: number; key: string } | null {
  let best: { d: number; index: number; key: string } | null = null;
  for (const [key, indexes] of keys) {
    const max = allowedTypos(key);
    if (max === 0 || Math.abs(q.length - key.length) > lengthSlack(key) || tooShortAPrefix(q, key)) continue;
    const d = distance(q, key, max);
    if (d > max) continue;
    const index = Math.min(...indexes);
    if (!best || d < best.d || (d === best.d && index < best.index)) best = { d, index, key };
  }
  return best;
}

/** True when someone who is NOT a valid answer has a (different) name at most `d` edits from the input. */
function closerInvalid(q: string, d: number, p: PromptIndex, keys: Keyed, byLen: GlobalIndex["fullByLen"]): boolean {
  for (let len = q.length - d; len <= q.length + d; len++) {
    for (const [key, ids] of byLen.get(len) ?? []) {
      if (keys.has(key)) continue;
      if (distance(q, key, d) <= d && [...ids].some((x) => !p.ids.has(x))) return true;
    }
  }
  return false;
}

export type Match = { answer: Answer; exact: boolean };

export function matchDetail(raw: string, p: PromptIndex, g: GlobalIndex, dropClubWords = false): Match | null {
  const q = normalize(raw, dropClubWords);
  if (!q) return null;
  const guess = (answer: Answer): Match => ({ answer, exact: false });
  const exact = p.exact.get(q);
  if (exact) return { answer: mostFamous(p, exact), exact: true };
  const initials = p.full.get(q);
  if (initials) return guess(mostFamous(p, initials));
  const oneWord = !q.includes(" ");
  if (oneWord) {
    const bySurname = p.single.get(q);
    if (bySurname) return guess(mostFamous(p, bySurname));
  }
  const elsewhere = g.exact.get(q);
  if (elsewhere && [...elsewhere].some((x) => !p.ids.has(x))) return null;

  const keys = oneWord ? p.single : p.full;
  const hit = fuzzy(q, keys);
  if (hit) {
    const byLen = oneWord ? g.singleByLen : g.fullByLen;
    return closerInvalid(q, hit.d, p, keys, byLen) ? null : guess(p.answers[hit.index]);
  }
  const last = q.split(" ").pop()!;
  if (last.length > 3) {
    const sounds = p.phonetic.get(phonetic(last));
    if (sounds) {
      const ans = mostFamous(p, sounds);
      const surname = normalize(ans.name).split(" ").pop()!;
      if (distance(last, surname, allowedTypos(surname) + 1) <= allowedTypos(surname) + 1) return guess(ans);
    }
  }
  return null;
}

export function matchAnswer(raw: string, p: PromptIndex, g: GlobalIndex, dropClubWords = false): Answer | null {
  return matchDetail(raw, p, g, dropClubWords)?.answer ?? null;
}
