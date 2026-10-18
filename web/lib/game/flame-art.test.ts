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

test("neither side is a flat wall: the outline curves in, so the flame doesn't look sliced off (user, 2026-10-13, again)", () => {
  const edge = (pick: (row: string) => number) => FLAME.map(pick).filter((x) => x >= 0);
  const left = edge((row) => row.search(/[^.]/));
  const right = edge((row) => row.length - 1 - [...row].map((c, i) => (c === "." ? -1 : i)).reduce((a, b) => Math.max(a, b)) );
  const longestRun = (xs: number[]) => xs.reduce((best, x, i) => { const run = i > 0 && xs[i - 1] === x ? best.run + 1 : 1; return { run, max: Math.max(best.max, run) }; }, { run: 0, max: 0 }).max;
  assert.ok(longestRun(left) <= 5, `left edge is straight for ${longestRun(left)} rows`);
  assert.ok(longestRun(right) <= 5, `right edge is straight for ${longestRun(right)} rows`);
});
