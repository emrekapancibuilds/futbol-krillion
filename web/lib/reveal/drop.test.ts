import { test } from "node:test";
import assert from "node:assert/strict";

import { ballAt, dropPlan, levelShade, START } from "./drop.ts";

test("the rarer the answer, the further and longer the ball drops", () => {
  const plans = [1, 2, 3, 4, 5, 6, 7].map(dropPlan);
  for (let i = 1; i < plans.length; i++) assert.ok(plans[i].impactMs > plans[i - 1].impactMs, `tier ${i + 1}`);
  assert.ok(plans[0].impactMs >= 700 && plans[6].impactMs <= 2600, `${plans[0].impactMs} .. ${plans[6].impactMs}`);
  for (const p of plans) assert.equal(p.floor, p.tier);                  // the floor of its own level
});

test("the ball falls from above the first level, hits its floor, never goes through it, and bounces lower each time", () => {
  for (let tier = 1; tier <= 7; tier++) {
    const p = dropPlan(tier);
    assert.ok(Math.abs(ballAt(p, 0).y - START) < 1e-9);
    assert.ok(START < 0);
    let prev = -Infinity;
    for (let ms = 0; ms < p.impactMs; ms += 10) {                         // only ever falls until it lands
      const { y } = ballAt(p, ms);
      assert.ok(y >= prev - 1e-9, `tier ${tier} at ${ms}: ${y} after ${prev}`);
      prev = y;
    }
    assert.ok(Math.abs(ballAt(p, p.impactMs).y - p.floor) < 1e-6);
    for (let ms = 0; ms < p.settleMs + 500; ms += 7) assert.ok(ballAt(p, ms).y <= p.floor + 1e-9, `below the floor at ${ms}`);
    assert.equal(p.bounces.length, 2);
    assert.ok(p.bounces[0].height > p.bounces[1].height && p.bounces[1].height > 0);
    assert.ok(p.bounces[0].height <= 0.2);                                  // a bounce, not a second drop
    assert.ok(p.settleMs - p.impactMs <= 650, `bounces last ${p.settleMs - p.impactMs} ms`);   // snappy, not floaty
    const top = ballAt(p, (p.bounces[0].start + p.bounces[0].end) / 2).y;   // the top of the first bounce
    assert.ok(Math.abs(p.floor - top - p.bounces[0].height) < 1e-6);
  }
});

test("it squashes on impact, then settles on the floor and stays there", () => {
  const p = dropPlan(4);
  assert.equal(ballAt(p, p.impactMs - 200).squash, 0);
  assert.ok(ballAt(p, p.impactMs + 20).squash > 0.5);
  assert.equal(ballAt(p, p.impactMs - 1).landed, false);
  assert.equal(ballAt(p, p.impactMs).landed, true);                       // the moment it hits the floor
  const rest = ballAt(p, p.settleMs + 100);
  assert.equal(rest.y, p.floor);
  assert.equal(rest.squash, 0);
  assert.deepEqual(dropPlan(0).tier, 1);
  assert.deepEqual(dropPlan(9).tier, 7);
});

test("each level is darker than the one above it, from nearly white to navy", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let l = 2; l <= 7; l++) assert.ok(lum(levelShade(l)) < lum(levelShade(l - 1)), `level ${l}`);
  assert.ok(lum(levelShade(1)) > 225);
  assert.equal(levelShade(7).toLowerCase(), "#0f1f4b");
});
