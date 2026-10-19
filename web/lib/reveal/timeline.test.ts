import { test } from "node:test";
import assert from "node:assert/strict";

import { BREAK_CHANCE, camBack, clockRate, crackAt, depthAt, FIRST_GATE_MS, revealTimeline, SPEEDUP, strainAt, STRAIN_RATE,
         teaseOutcome, TEMPO, type Outcome, type Timeline } from "./timeline.ts";

const intervals = (gates: number[]) => gates.map((g, i) => g - (i ? gates[i - 1] : 0));
const OUTCOMES: Outcome[] = ["break", "hold"];
/** How long the run takes on the wall clock: the strain runs slow. */
const realMs = (tl: Timeline, t = tl.landAt) =>
  t + Math.max(0, Math.min(t, tl.strain[1]) - tl.strain[0]) * (1 / STRAIN_RATE - 1);
const maxDepth = (tl: Timeline, until: number) => {
  let m = 0;
  for (let t = 0; t <= until; t += 2) m = Math.max(m, depthAt(tl, t));
  return m;
};

test("tier N smashes exactly N gates, in order, whatever happens at the tease", () => {
  for (const outcome of OUTCOMES) {
    for (let tier = 1; tier <= 7; tier++) {
      const tl = revealTimeline(tier, outcome);
      assert.equal(tl.gates.length, tier);
      tl.gates.forEach((g, i) => assert.ok(i === 0 ? g > 0 : g > tl.gates[i - 1]));
      assert.ok(tl.landAt >= tl.gates[tier - 1]);
    }
  }
});

test("Jobless always breaks through; every other tier breaks on 30% of rolls and holds on the rest", () => {
  assert.equal(BREAK_CHANCE, 0.3);
  for (const roll of [0, 0.5, 0.999]) assert.equal(teaseOutcome(7, roll), "break");
  for (let tier = 1; tier <= 6; tier++) {
    let breaks = 0;
    for (let k = 0; k < 1000; k++) if (teaseOutcome(tier, (k + 0.5) / 1000) === "break") breaks++;
    assert.equal(breaks, 300, `tier ${tier}`);
  }
  assert.equal(revealTimeline(7, "hold").outcome, "break");       // there is no gate past Jobless to fail at
});

test("the ball rams the tease gate twice without breaking it, backing off in between", () => {
  for (const outcome of OUTCOMES) {
    for (let tier = 1; tier <= 6; tier++) {
      const tl = revealTimeline(tier, outcome);
      const G = tl.teaseGate;
      assert.equal(tl.rams.length, 2);
      assert.ok(tl.rams[0] < tl.rams[1]);
      assert.equal(tl.strain[0], tl.rams[1]);                    // the second ram turns into the push
      assert.ok(tl.strain[1] > tl.strain[0]);
      for (const r of tl.rams) {
        const d = depthAt(tl, r);
        assert.ok(d < G && d > G - 0.1, `${outcome} ${tier}: touching gate ${G} at ${d}`);
      }
      const between = depthAt(tl, (tl.rams[0] + tl.rams[1]) / 2);
      assert.ok(between < depthAt(tl, tl.rams[0]) - 0.05, "it bounces back off the first ram");
      assert.ok(maxDepth(tl, tl.strain[1]) < G, "nothing gets through until the push is over");
    }
  }
});

test("when it breaks, the tease is at the answer's own gate and the smash comes right after the push", () => {
  for (let tier = 1; tier <= 7; tier++) {
    const tl = revealTimeline(tier, "break");
    assert.equal(tl.teaseGate, tier);
    assert.equal(tl.bounceAt, null);
    assert.ok(tl.rams[0] > (tier > 1 ? tl.gates[tier - 2] : 0));
    assert.ok(tl.gates[tier - 1] > tl.strain[1] && tl.gates[tier - 1] - tl.strain[1] < 150);
    assert.equal(tl.landAt, tl.gates[tier - 1]);
    assert.ok(Math.abs(depthAt(tl, tl.gates[tier - 1]) - tier) < 1e-9);
  }
});

test("when it holds, it smashes the answer's gate first, rams the next tier's gate and bounces off it", () => {
  for (let tier = 1; tier <= 6; tier++) {
    const tl = revealTimeline(tier, "hold");
    assert.equal(tl.teaseGate, tier + 1);
    assert.ok(tl.gates[tier - 1] < tl.rams[0]);
    assert.equal(tl.bounceAt, tl.strain[1]);
    assert.ok(tl.landAt > tl.bounceAt!);
    assert.ok(maxDepth(tl, tl.landAt + 3000) < tier + 1, "it never gets through");
    assert.ok(depthAt(tl, tl.landAt) < depthAt(tl, tl.strain[1]) - 0.15, "it rebounds off the gate");
    assert.equal(depthAt(tl, tl.landAt + 5000), depthAt(tl, tl.landAt));     // and stays there
  }
});

test("the push lasts longer for rarer tiers", () => {
  const push = (tier: number, o: Outcome) => { const tl = revealTimeline(tier, o); return tl.strain[1] - tl.strain[0]; };
  for (let tier = 2; tier <= 7; tier++) assert.ok(push(tier, "break") > push(tier - 1, "break"));
  assert.equal(push(3, "hold"), push(3, "break"));
});

test("the ball speeds up with every gate it breaks", () => {
  const gaps = intervals(revealTimeline(4, "hold").gates);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] < gaps[i - 1], `gate ${i + 1} should come quicker`);
  const before = intervals(revealTimeline(4, "break").gates).slice(0, 3);   // the last one includes the tease
  for (let i = 1; i < before.length; i++) assert.ok(before[i] < before[i - 1]);
  assert.ok(Math.abs(gaps[0] - FIRST_GATE_MS) < 1e-9 && Math.abs(gaps[1] - FIRST_GATE_MS * SPEEDUP) < 1e-9);
});

test("time runs slow only during the push", () => {
  const tl = revealTimeline(5, "hold");
  assert.equal(clockRate(tl, tl.strain[0] - 1), 1);
  assert.equal(clockRate(tl, (tl.strain[0] + tl.strain[1]) / 2), STRAIN_RATE);
  assert.equal(clockRate(tl, tl.strain[1] + 1), 1);
  assert.equal(clockRate(tl, 0), 1);
  assert.ok(STRAIN_RATE > 0.3 && STRAIN_RATE < 1);
});

test("the strain builds through the push, then ends with the smash or fades after the bounce", () => {
  for (const outcome of OUTCOMES) {
    const tl = revealTimeline(4, outcome);
    assert.equal(strainAt(tl, tl.strain[0] - 1), 0);
    const mid = strainAt(tl, (tl.strain[0] + tl.strain[1]) / 2);
    assert.ok(mid > 0.3 && mid < 0.7, `${mid}`);
    assert.ok(strainAt(tl, tl.strain[1]) > 0.99);
    assert.equal(strainAt(tl, tl.landAt + 1000), 0);
  }
  const brk = revealTimeline(4, "break");
  assert.equal(strainAt(brk, brk.gates[3] + 1), 0);              // the smash releases it at once
  const hold = revealTimeline(4, "hold");
  const after = strainAt(hold, hold.bounceAt! + 60);
  assert.ok(after > 0 && after < 1, `fading, not cut: ${after}`);
});

test("the tease gate cracks a little on the first ram, more on the second, almost through by the end, and never heals", () => {
  for (const outcome of OUTCOMES) {
    const tl = revealTimeline(3, outcome);
    assert.equal(crackAt(tl, tl.rams[0] - 1), 0);
    const first = crackAt(tl, tl.rams[0] + 1), second = crackAt(tl, tl.rams[1] + 1), end = crackAt(tl, tl.strain[1]);
    assert.ok(first >= 0.3 && first < 0.5, `${first}`);
    assert.ok(second > first + 0.1, `${second}`);
    assert.ok(end >= 0.9, `${end}`);
    let prev = 0;
    for (let t = 0; t < tl.landAt + 2000; t += 3) {
      const c = crackAt(tl, t);
      assert.ok(c >= prev && c <= 1, `cracks shrank at ${t}`);
      prev = c;
    }
  }
});

test("after a hold the camera backs off further than the ball, so the ball comes to rest in view", () => {
  const tl = revealTimeline(2, "hold");
  assert.equal(camBack(tl, tl.bounceAt! - 1), 0);
  assert.ok(camBack(tl, tl.landAt) > 0.1);
  assert.equal(camBack(tl, tl.landAt + 2000), camBack(tl, tl.landAt));
  const brk = revealTimeline(2, "break");
  for (let t = 0; t < brk.landAt + 2000; t += 50) assert.equal(camBack(brk, t), 0);
});

test("depth starts at 0, passes gate k at its smash time and only goes backwards when bouncing off the tease gate", () => {
  for (const outcome of OUTCOMES) {
    const tl = revealTimeline(6, outcome);
    assert.equal(depthAt(tl, 0), 0);
    tl.gates.forEach((g, i) => assert.ok(Math.abs(depthAt(tl, g) - (i + 1)) < 1e-9));
    let prev = -1;
    for (let t = 0; t <= tl.rams[0]; t += 5) {
      const d = depthAt(tl, t);
      assert.ok(d >= prev, `depth went backwards at ${t} ms, before the tease`);
      prev = d;
    }
  }
});

test("on the clock: Bandwagon about 2 s when it breaks and 3 s when it holds, Jobless under 5 s", () => {
  assert.equal(TEMPO, 0.8);
  const b1 = realMs(revealTimeline(1, "break")), h1 = realMs(revealTimeline(1, "hold")), j = realMs(revealTimeline(7, "break"));
  assert.ok(b1 > 1500 && b1 < 2300, `bandwagon break ${b1}`);
  assert.ok(h1 > 2300 && h1 < 3300, `bandwagon hold ${h1}`);
  assert.ok(j > 3800 && j < 5000, `jobless ${j}`);
  for (let tier = 1; tier <= 6; tier++) assert.ok(realMs(revealTimeline(tier, "hold")) < 5200, `tier ${tier} hold`);
});

test("out-of-range tiers are clamped", () => {
  assert.equal(revealTimeline(0, "break").tier, 1);
  assert.equal(revealTimeline(9, "hold").tier, 7);
});
