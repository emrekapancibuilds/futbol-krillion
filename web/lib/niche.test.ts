import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { betterKnownLine, buildSearchIndex, moreNichePercent, NICHE_CAP, nicheLabel, nicheScore, NOT_FOUND_MESSAGE, searchNames,
         type NicheData, type NichePlayer } from "./niche.ts";

const player = (rank: number, fame = 0.3, depth = 0): NichePlayer => [rank, fame, "", depth];

test("the score follows the game's tier boundaries on a log scale", () => {
  assert.equal(nicheScore(player(1)), 1);
  assert.equal(nicheScore(player(300)), 15);
  assert.equal(nicheScore(player(1_000)), 28);
  assert.equal(nicheScore(player(5_000)), 50);
  assert.equal(nicheScore(player(12_000)), 64);
  assert.equal(nicheScore(player(32_000)), 78);
  assert.ok(nicheScore(player(100)) > 1 && nicheScore(player(100)) < 15);
});

test("the score never goes down as a player gets less famous, and stays between 1 and 96 for anyone with fame", () => {
  let last = 0;
  for (const rank of [1, 2, 5, 19, 97, 300, 664, 1_000, 3_000, 5_000, 12_000, 32_000, 60_000, 100_000, 150_000, 172_000]) {
    const s = nicheScore(player(rank));
    assert.ok(s >= last && s >= 1 && s <= NICHE_CAP, `rank ${rank} -> ${s}`);
    last = s;
  }
  for (const rank of [172_421, 178_258, 1_000_000, 10 ** 9]) assert.ok(nicheScore(player(rank)) <= NICHE_CAP, `rank ${rank}`);
  assert.equal(NICHE_CAP, 96);
});

test("97 or more is only for players with no fame at all, spread by depth", () => {
  assert.equal(nicheScore(player(178_000, 0, 0)), 97);
  assert.equal(nicheScore(player(178_000, 0, 100)), 100);
  for (const depth of [0, 17, 40, 41, 77, 100]) {
    const s = nicheScore(player(178_000, 0, depth));
    assert.ok(Number.isInteger(s) && s >= 97 && s <= 100, `${depth} -> ${s}`);
  }
  assert.ok(nicheScore(player(178_000, 0, 20)) <= nicheScore(player(178_000, 0, 90)));
  assert.equal(nicheScore(player(178_000, 0.0001, 100)), NICHE_CAP);        // a sliver of fame is still fame
});

test("the guarantee holds for every real player in the shipped data (a test over all 178,258)", () => {
  const data = JSON.parse(readFileSync(new URL("../data/niche-players.json", import.meta.url), "utf8")) as NicheData;
  let zero = 0, high = 0, total = 0;
  for (const p of Object.values(data.p)) {
    const s = nicheScore(p);
    total++;
    if (p[1] <= 0) zero++;
    if (s >= 97) high++;
    assert.ok(p[1] > 0 ? s <= NICHE_CAP : s >= 97, `${JSON.stringify(p)} -> ${s}`);
    assert.ok(Number.isInteger(s) && s >= 1 && s <= 100);
  }
  assert.equal(total, data.n);
  assert.equal(high, zero);                                // exactly the players with no fame score 97 or more
  assert.ok(zero / total < 0.05, `${zero} of ${total}`);   // and they are a small group
});

test("the label gets more extreme with the score, and the last one is only for 97 and up", () => {
  assert.equal(nicheLabel(1), "Everyone has heard of them");
  assert.equal(nicheLabel(96), "Basically a secret");
  assert.equal(nicheLabel(97), "Nobody on earth knows them");
  assert.equal(new Set([1, 11, 26, 46, 66, 85, 97].map(nicheLabel)).size, 7);
});

test("'more niche than' is the share of players who are better known, and never reads 100", () => {
  assert.equal(moreNichePercent(1, 178_258), 0);
  assert.equal(moreNichePercent(89_130, 178_258), 50);
  assert.equal(moreNichePercent(178_258, 178_258), 99);
});

test("the line under the score talks about the few who are better known for stars, and about a share for the rest", () => {
  assert.equal(betterKnownLine(1, 178_258), "Nobody we track is better known.");
  assert.equal(betterKnownLine(2, 178_258), "Only 1 player we track is better known.");
  assert.equal(betterKnownLine(97, 178_258), "Only 96 of the 178,258 players we track are better known.");
  assert.equal(betterKnownLine(89_130, 178_258), "More niche than 50% of the 178,258 players we track.");
  assert.equal(betterKnownLine(178_258, 178_258), "More niche than 99% of the 178,258 players we track.");
});

test("the not-found message is the one the user asked for", () => {
  assert.equal(NOT_FOUND_MESSAGE, "Even we don't know who that is");
});

const rows: [string, string][] = [
  ["Q1", "Cristiano Ronaldo"], ["Q1", "CR7"], ["Q2", "Ronaldo Nazário"], ["Q3", "İlkay Gündoğan"],
  ["Q4", "Álvaro Odriozola"], ["Q5", "Ronaldo Silva"], ["Q6", "Marco Ronaldo Reus"], ["Q7", "Roberto Carlos"],
];
const rank: Record<string, number> = { Q1: 2, Q2: 400, Q3: 300, Q4: 664, Q5: 90_000, Q6: 50_000, Q7: 500 };
const idx = buildSearchIndex(rows);
const find = (q: string, limit = 6) => searchNames(idx, q, (id) => rank[id] ?? 10 ** 9, limit);

test("search ignores accents and capitals and finds a player by any word of the name", () => {
  assert.deepEqual(find("gundogan"), ["Q3"]);
  assert.deepEqual(find("ODRIOZOLA"), ["Q4"]);
  assert.deepEqual(find("alvaro odri"), ["Q4"]);
  assert.deepEqual(find("cr7"), ["Q1"]);
});

test("search puts the most famous first among real name matches", () => {
  const r = find("ronaldo");
  assert.equal(r[0], "Q1");                                 // Cristiano: the most famous Ronaldo, even though his surname is second
  assert.ok(r.indexOf("Q2") < r.indexOf("Q5") && r.indexOf("Q6") < r.indexOf("Q5"));     // then by fame
  assert.equal(r.length, 4);
});

test("typing a whole name finds exactly that player before more famous players who merely start with it", () => {
  const idx2 = buildSearchIndex([["A", "Rodri"], ["B", "Rodrigo Moreno"]]);
  assert.deepEqual(searchNames(idx2, "rodri", (id) => (id === "A" ? 5_000 : 10), 6), ["A", "B"]);
});

test("a nickname only counts after the real names: 'Haaland of temu' must not beat Erling Haaland", () => {
  const idx3 = buildSearchIndex([["QH", "Erling Haaland"], ["QR", "Rasmus Højlund"], ["QR", "Haaland of temu"], ["QH", "EBH"]]);
  const r3 = searchNames(idx3, "haaland", (id) => (id === "QH" ? 19 : 1_264), 6);
  assert.deepEqual(r3, ["QH", "QR"]);                       // both found, the real name first
  assert.deepEqual(searchNames(idx3, "ebh", () => 1, 6), ["QH"]);          // but a nickname still finds its player
});

test("each player appears once, the list is capped, and tiny or empty queries return nothing", () => {
  assert.equal(new Set(find("ronaldo")).size, find("ronaldo").length);
  assert.equal(find("ronaldo", 2).length, 2);
  assert.deepEqual(find(""), []);
  assert.deepEqual(find("r"), []);
  assert.deepEqual(find("zzzzzz"), []);
  assert.deepEqual(find("   "), []);
});
