import { test } from "node:test";
import assert from "node:assert/strict";

import { revealTimeline } from "./timeline.ts";
import { bolt, castTunnel, EXIT, exitCover, GAP, HW, hitStopMs, LEAD, settleCam, slowMo, slowSpan, slowWindow, tierEffects } from "./tunnel.ts";

test("a ray through the middle of the screen runs down the tunnel; one near an edge hits the nearest wall", () => {
  const W = 320, H = 200, F = 0.4375 * W, HH = (HW * H) / W;
  const mid = castTunnel(W / 2 + 0.5, H / 2 + 0.5, W / 2, H / 2, F, HH);
  assert.ok(mid.t > 50, `${mid.t}`);
  const left = castTunnel(2, H / 2, W / 2, H / 2, F, HH);
  assert.equal(left.surface, "wall");
  assert.ok(Math.abs(left.u) < 0.1);                          // halfway up the wall
  const top = castTunnel(W / 2, 3, W / 2, H / 2, F, HH);
  assert.equal(top.surface, "ceiling");
  const bottom = castTunnel(W / 2 + 20, H - 3, W / 2, H / 2, F, HH);
  assert.equal(bottom.surface, "floor");
  assert.ok(bottom.u > 0 && bottom.u < 1);                    // right of the guide line, inside the tunnel
  // the hit distance agrees with the wall it hit
  assert.ok(Math.abs(left.t * Math.abs((2 - W / 2) / F) - HW) < 1e-9);
});

test("every smash freezes the picture for a beat, longer for deeper gates and longest for the final one", () => {
  for (let g = 2; g <= 7; g++) assert.ok(hitStopMs(g, false) >= hitStopMs(g - 1, false));
  assert.ok(hitStopMs(7, true) > hitStopMs(7, false));
  assert.ok(hitStopMs(1, false) >= 30 && hitStopMs(7, true) <= 160);
});

test("after the last gate the camera glides out of the tunnel until the stadium fills the screen", () => {
  const tier = 4;
  const before = settleCam(tier, 0);
  const after = settleCam(tier, 1);
  assert.equal(before, tier * GAP - LEAD);
  assert.ok(after > before);
  const exitAt = tier * GAP + EXIT;
  assert.ok(exitCover(exitAt - after) >= 1.08, `the opening covers ${exitCover(exitAt - after)} of the screen`);   // with room for the shake
  assert.ok(exitCover(exitAt - before) < 0.5);              // far off at first: a bright doorway at the end
  assert.ok(settleCam(tier, 0.5) > before && settleCam(tier, 0.5) < after);
});

test("time slows right before the final gate, more for rarer tiers, and never anywhere else", () => {
  for (const tier of [1, 3, 5, 7]) {
    const finalAt = 2000;
    assert.equal(slowMo(tier, 0, finalAt), 1);
    assert.equal(slowMo(tier, finalAt, finalAt), 1);
    assert.equal(slowMo(tier, finalAt + 50, finalAt), 1);
    const r = slowMo(tier, finalAt - 20, finalAt);
    assert.ok(r > 0.15 && r < 1, `tier ${tier}: ${r}`);
  }
  assert.ok(slowMo(7, 1980, 2000) < slowMo(1, 1980, 2000));
  assert.ok(slowWindow(7) > slowWindow(1));
});

test("when the run already hangs before the last gate, time only slows for the final rush, not during the hang", () => {
  const tl = revealTimeline(7);
  const finalAt = tl.gates[6];
  const w = slowSpan(tl);
  assert.ok(w > 0 && w < slowWindow(7), `${w}`);
  const pauseEnd = tl.segments[tl.segments.length - 1].t0;
  assert.ok(Math.abs(finalAt - w - pauseEnd) < 1e-9, "slow motion starts where the rush starts");
  assert.equal(slowMo(7, pauseEnd - 10, finalAt, w), 1);
  assert.ok(slowMo(7, pauseEnd + 1, finalAt, w) < 1);
  assert.equal(slowSpan(revealTimeline(3)), slowWindow(3));               // no hang below True Analyst: the full window
});

test("the deeper gates bring their own fireworks: arcs from 5, embers from 6, gold lightning and confetti at 7", () => {
  for (const g of [1, 2, 3, 4]) {
    const e = tierEffects(g, true);
    assert.equal(e.arcs + e.embers, 0);
    assert.equal(e.gold, false);
  }
  assert.ok(tierEffects(5, true).arcs > 0 && tierEffects(5, true).embers === 0);
  assert.ok(tierEffects(6, true).embers > 0 && tierEffects(6, true).arcs > 0);
  assert.ok(tierEffects(7, true).gold && tierEffects(7, true).confetti);
  assert.ok(tierEffects(7, false).arcs < tierEffects(7, true).arcs);     // on the way through, a smaller show
  assert.ok(tierEffects(3, true).shards > tierEffects(1, true).shards);
});

test("a lightning bolt runs from its start to its end, zig-zagging but never wandering far", () => {
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 20; k++) {
    const pts = bolt(10, 20, 90, 60, 0.2, rand);
    assert.deepEqual(pts[0], [10, 20]);
    assert.deepEqual(pts[pts.length - 1], [90, 60]);
    assert.ok(pts.length >= 9);
    const L = Math.hypot(80, 40);
    for (const [x, y] of pts) {
      const off = Math.abs((x - 10) * 40 - (y - 20) * 80) / L;      // distance from the straight line
      assert.ok(off <= 0.2 * L + 1e-9, `${off}`);
    }
  }
});
