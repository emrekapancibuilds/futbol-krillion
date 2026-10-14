import { test } from "node:test";
import assert from "node:assert/strict";

import { mockStandings } from "./standings.ts";

test("the mock field has 10,000-20,000 players and stays the same for the same game", () => {
  for (const seed of ["daily:1", "daily:2", "unlimited:serie-a:4"]) {
    const s = mockStandings(seed, 120);
    assert.ok(s.players >= 10_000 && s.players <= 20_000, `${s.players}`);
    assert.deepEqual(mockStandings(seed, 120), s);
  }
  assert.notEqual(mockStandings("daily:1", 120).players, mockStandings("daily:2", 120).players);
});

test("a higher score beats more players; nothing is 0% or 100% unless it has to be", () => {
  const p = [0, 20, 60, 120, 240, 500, 1400].map((score) => mockStandings("daily:7", score).percentile);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1], `${p}`);
  assert.ok(p[0] <= 3);                 // a blank card: only the other blanks are behind you
  assert.ok(p[3] > 30 && p[3] < 85);    // 120 is a decent, not outstanding, score
  assert.equal(p[6], 99);               // never "better than 100%"
});

test("the curve is close to a bell: the two sides of the peak are about as wide (user, 2026-10-11)", () => {
  for (const seed of ["daily:1", "daily:3", "unlimited:la-liga:2"]) {
    const { curve } = mockStandings(seed, 80);
    const peak = curve.indexOf(Math.max(...curve));
    let left = peak, right = peak;
    while (left > 0 && curve[left] > 0.5) left--;
    while (right < curve.length - 1 && curve[right] > 0.5) right++;
    const ratio = (right - peak) / Math.max(1, peak - left);
    assert.ok(ratio >= 0.8 && ratio <= 1.45, `${seed}: right/left half-width ${ratio.toFixed(2)}`);
    assert.ok(peak > curve.length * 0.25 && peak < curve.length * 0.6, `${seed}: peak at bin ${peak}`);
  }
});

test("the axis hugs the curve and always fits the player's score", () => {
  const s = mockStandings("daily:3", 80);
  assert.ok(s.max >= 200 && s.max % 50 === 0);
  assert.ok(mockStandings("daily:3", 1360).max >= 1360);
});

// User, 2026-10-13: 1,260 on a daily showed "better than 99%". It should be about 95-96%, and 99% should only start
// around 1,500. The points ladder then changed to 5 ... 200 (2026-10-14), about a fifth of the old one, so the same
// marks are 252 and 300 now (the mock curve was rescaled by 0.2 to keep them).
const DAYS = Array.from({ length: 80 }, (_, i) => (i % 2 ? `daily:${i}` : `unlimited:mixed:${i}`));

test("252 (the old 1,260) is about the 95th-96th percentile, on every day", () => {
  const p = DAYS.map((seed) => mockStandings(seed, 252).percentile);
  assert.ok(Math.min(...p) >= 94 && Math.max(...p) <= 97, `${Math.min(...p)}..${Math.max(...p)}`);
  const mean = p.reduce((a, b) => a + b, 0) / p.length;
  assert.ok(mean >= 95 && mean <= 96.5, `mean ${mean}`);
});

test("the 99th percentile only starts around 300: never below 290, always from 360", () => {
  for (const seed of DAYS) {
    assert.ok(mockStandings(seed, 290).percentile < 99, `${seed} reached 99 at 290`);
    assert.equal(mockStandings(seed, 360).percentile, 99, `${seed} below 99 at 360`);
  }
  const at300 = DAYS.map((seed) => mockStandings(seed, 300).percentile);
  assert.ok(Math.min(...at300) >= 98, `${Math.min(...at300)}`);          // 300 is 98 or 99, never lower
});

test("the middle of the field: 100 is a bit below half, 200 is about 86-88", () => {
  const mid = (score: number) => DAYS.map((s) => mockStandings(s, score).percentile).sort((a, b) => a - b)[40];
  assert.ok(mid(100) >= 33 && mid(100) <= 47, `${mid(100)}`);
  assert.ok(mid(200) >= 83 && mid(200) <= 90, `${mid(200)}`);
});

test("the curve has a visible tail past 252, so the marker doesn't sit past the end of the curve", () => {
  const s = mockStandings("daily:4", 252);
  const lastTall = s.curve.reduce((acc, v, i) => (v > 0.02 ? i : acc), 0);       // last bar above 2% of the peak
  assert.ok((lastTall / s.curve.length) * s.max > 252, `curve ends at ${(lastTall / s.curve.length) * s.max}`);
});

test("the curve is drawn with many fine columns, not a few chunky ones (user, 2026-10-14)", () => {
  const { curve } = mockStandings("daily:4", 120);
  assert.ok(curve.length >= 100 && curve.length <= 160, `${curve.length} columns`);
  assert.ok(curve.every((v) => v >= 0 && v <= 1));
});
