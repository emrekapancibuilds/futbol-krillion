import { test } from "node:test";
import assert from "node:assert/strict";

import { depthAt, FIRST_GATE_MS, PAUSE_MS, revealTimeline, SPEEDUP, TEMPO } from "./timeline.ts";

const intervals = (gates: number[]) => gates.map((g, i) => g - (i ? gates[i - 1] : 0));

test("tier N smashes exactly N gates, in order, and lands on the last one", () => {
  for (let tier = 1; tier <= 7; tier++) {
    const tl = revealTimeline(tier);
    assert.equal(tl.gates.length, tier);
    tl.gates.forEach((g, i) => assert.ok(i === 0 ? g > 0 : g > tl.gates[i - 1]));
    assert.equal(tl.landAt, tl.gates[tier - 1]);
  }
});

test("the ball speeds up with every gate it breaks", () => {
  const gaps = intervals(revealTimeline(4).gates);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] < gaps[i - 1], `gate ${i + 1} should come quicker`);
});

test("True Analyst and up hang just before the last gate; lower tiers do not", () => {
  for (const tier of [5, 6, 7]) {
    const gaps = intervals(revealTimeline(tier).gates);
    const usual = FIRST_GATE_MS * SPEEDUP ** (tier - 1);       // the last stretch without the pause
    assert.ok(gaps[tier - 1] > usual + PAUSE_MS * 0.9, `tier ${tier} pauses`);
  }
  const four = intervals(revealTimeline(4).gates);
  assert.ok(four[3] < four[2]);
});

test("the run plays at 80% of the original speed: Bandwagon about 0.7 s, Jobless about 3.4 s", () => {
  assert.equal(TEMPO, 0.8);
  assert.ok(Math.abs(revealTimeline(1).landAt - 560 / TEMPO) < 1);
  const jobless = revealTimeline(7).landAt;
  assert.ok(jobless > 3200 && jobless < 3700, `jobless took ${jobless} ms`);
});

test("depth runs from 0 to the tier, passes gate k at its smash time and never goes backwards", () => {
  const tl = revealTimeline(6);
  assert.equal(depthAt(tl, 0), 0);
  tl.gates.forEach((g, i) => assert.ok(Math.abs(depthAt(tl, g) - (i + 1)) < 1e-9));
  assert.equal(depthAt(tl, tl.landAt + 5000), 6);
  let prev = -1;
  for (let t = 0; t <= tl.landAt + 50; t += 5) {
    const d = depthAt(tl, t);
    assert.ok(d >= prev, `depth went backwards at ${t} ms`);
    prev = d;
  }
});

test("out-of-range tiers are clamped", () => {
  assert.equal(revealTimeline(0).tier, 1);
  assert.equal(revealTimeline(9).tier, 7);
});
