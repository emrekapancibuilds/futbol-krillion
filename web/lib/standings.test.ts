import { test } from "node:test";
import assert from "node:assert/strict";

import { mockStandings } from "./standings.ts";

test("the mock field has 10,000-20,000 players and stays the same for the same game", () => {
  for (const seed of ["daily:1", "daily:2", "unlimited:serie-a:4"]) {
    const s = mockStandings(seed, 600);
    assert.ok(s.players >= 10_000 && s.players <= 20_000, `${s.players}`);
    assert.deepEqual(mockStandings(seed, 600), s);
  }
  assert.notEqual(mockStandings("daily:1", 600).players, mockStandings("daily:2", 600).players);
});

test("a higher score beats more players; nothing is 0% or 100% unless it has to be", () => {
  const p = [0, 100, 300, 600, 1200, 2500, 7000].map((score) => mockStandings("daily:7", score).percentile);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1], `${p}`);
  assert.ok(p[0] <= 3);                 // a blank card: only the other blanks are behind you
  assert.ok(p[3] > 30 && p[3] < 85);    // 600 is a decent, not outstanding, score
  assert.equal(p[6], 99);               // never "better than 100%"
});

test("the curve is close to a bell: the two sides of the peak are about as wide (user, 2026-10-11)", () => {
  for (const seed of ["daily:1", "daily:3", "unlimited:la-liga:2"]) {
    const { curve } = mockStandings(seed, 400);
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
  const s = mockStandings("daily:3", 400);
  assert.ok(s.max >= 1000 && s.max % 250 === 0);
  assert.ok(mockStandings("daily:3", 6800).max >= 6800);
});
