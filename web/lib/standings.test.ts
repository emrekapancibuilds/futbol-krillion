import { test } from "node:test";
import assert from "node:assert/strict";

import { mockStandings } from "./standings.ts";

test("the mock field has 10,000-20,000 players and stays the same for the same game", () => {
  for (const seed of ["daily:1", "daily:2", "unlimited:serie-a:4"]) {
    const s = mockStandings(seed, 300);
    assert.ok(s.players >= 10_000 && s.players <= 20_000, `${s.players}`);
    assert.deepEqual(mockStandings(seed, 300), s);
  }
  assert.notEqual(mockStandings("daily:1", 300).players, mockStandings("daily:2", 300).players);
});

test("a higher score beats more players; nothing is 0% or 100% unless it has to be", () => {
  const p = [0, 60, 150, 300, 450, 700, 1400].map((score) => mockStandings("daily:7", score).percentile);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1], `${p}`);
  assert.ok(p[0] <= 3);                 // a blank card: only the other blanks are behind you
  assert.ok(p[3] > 40 && p[3] < 60);    // 300 is the middle of the field
  assert.equal(p[6], 99);               // never "better than 100%"
});

// User, 2026-10-16: "make the curve a bit stricter: 500 should be about the 95th percentile, and the curve should be
// centered." (It was 252 = 95.8%, a bell piled up on the left of the chart.)
const DAYS = Array.from({ length: 80 }, (_, i) => (i % 2 ? `daily:${i}` : `unlimited:mixed:${i}`));
const pct = (score: number) => DAYS.map((seed) => mockStandings(seed, score).percentile);

test("500 is about the 95th percentile, on every day", () => {
  const p = pct(500);
  assert.ok(Math.min(...p) >= 93 && Math.max(...p) <= 97, `${Math.min(...p)}..${Math.max(...p)}`);
  const mean = p.reduce((a, b) => a + b, 0) / p.length;
  assert.ok(mean >= 94.3 && mean <= 95.8, `mean ${mean}`);
});

test("the middle of the field is 300, with 200 well below and 400 well above", () => {
  const med = (score: number) => pct(score).sort((a, b) => a - b)[40];
  assert.ok(med(300) >= 45 && med(300) <= 55, `${med(300)}`);
  assert.ok(med(200) >= 15 && med(200) <= 27, `${med(200)}`);
  assert.ok(med(400) >= 75 && med(400) <= 87, `${med(400)}`);
});

test("the 99th percentile only starts around 600: never below 550, always from 650", () => {
  for (const seed of DAYS) {
    assert.ok(mockStandings(seed, 550).percentile < 99, `${seed} reached 99 at 550`);
    assert.equal(mockStandings(seed, 650).percentile, 99, `${seed} below 99 at 650`);
  }
});

test("the bell is centered: its peak sits in the middle of the chart and the two sides match", () => {
  for (const seed of DAYS.slice(0, 20)) {
    const { curve } = mockStandings(seed, 300);
    const peak = curve.indexOf(Math.max(...curve));
    assert.ok(peak >= curve.length * 0.42 && peak <= curve.length * 0.58, `${seed}: peak at bin ${peak} of ${curve.length}`);
    let left = peak, right = peak;
    while (left > 0 && curve[left] > 0.5) left--;
    while (right < curve.length - 1 && curve[right] > 0.5) right++;
    const ratio = (right - peak) / Math.max(1, peak - left);
    assert.ok(ratio >= 0.85 && ratio <= 1.18, `${seed}: right/left half-width ${ratio.toFixed(2)}`);
    assert.ok(curve[0] < 0.2 && curve[curve.length - 1] < 0.2, `${seed}: the ends of the curve are low`);
  }
});

test("a typical score keeps the centered axis; only a score beyond it stretches the axis", () => {
  for (const seed of DAYS.slice(0, 10)) {
    assert.ok(mockStandings(seed, 300).max <= 650, `${mockStandings(seed, 300).max}`);
    assert.ok(mockStandings(seed, 300).max >= 550);
  }
  const s = mockStandings("daily:3", 1360);
  assert.ok(s.max >= 1360 && s.max % 50 === 0);
});

test("the curve is drawn with many fine columns, not a few chunky ones (user, 2026-10-14)", () => {
  const { curve } = mockStandings("daily:4", 300);
  assert.ok(curve.length >= 100 && curve.length <= 160, `${curve.length} columns`);
  assert.ok(curve.every((v) => v >= 0 && v <= 1));
});

test("the curve still reaches past 500, so the marker doesn't sit past the end of the curve", () => {
  const s = mockStandings("daily:4", 500);
  const lastTall = s.curve.reduce((acc, v, i) => (v > 0.02 ? i : acc), 0);       // last bar above 2% of the peak
  assert.ok(((lastTall + 1) / s.curve.length) * s.max > 500, `curve ends at ${((lastTall + 1) / s.curve.length) * s.max}`);
});
