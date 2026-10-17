import { test } from "node:test";
import assert from "node:assert/strict";

import { castTunnel, EXIT, exitCover, GAP, HW, hitStopMs, LEAD, settleCam } from "./tunnel.ts";

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
