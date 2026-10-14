import assert from "node:assert/strict";
import test from "node:test";

import { FLAME } from "./flame-art.ts";

test("the flame art is a clean rectangle and never touches its edges, so it can't look cut off (user, 2026-10-13)", () => {
  const width = FLAME[0].length;
  assert.ok(FLAME.every((row) => row.length === width), "every row has the same width");
  assert.ok(FLAME.every((row) => /^[.royc]*$/.test(row)), "only known colours");
  for (const row of FLAME) {
    assert.equal(row[0], ".", `left edge empty: ${row}`);
    assert.equal(row[width - 1], ".", `right edge empty: ${row}`);
  }
  assert.ok(FLAME[0].includes("r") && FLAME[FLAME.length - 1].includes("r"), "the tip and the base are drawn");
});

test("the flame leans neither way: its left and right gaps differ by at most one pixel", () => {
  const gaps = FLAME.map((row) => [row.search(/[^.]/), row.length - 1 - [...row].map((c, i) => (c === "." ? -1 : i)).reduce((a, b) => Math.max(a, b))]);
  const widest = FLAME.map((row, i) => ({ i, w: [...row].filter((c) => c !== ".").length })).sort((a, b) => b.w - a.w)[0].i;
  const [left, right] = gaps[widest];
  assert.ok(Math.abs(left - right) <= 1, `widest row has gaps ${left} and ${right}`);
});
