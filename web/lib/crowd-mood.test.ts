import { test } from "node:test";
import assert from "node:assert/strict";

import { crowdReaction } from "./crowd-mood.ts";

test("a pass, a timeout or a Bandwagon / Glory Hunter answer is a missed chance: the crowd groans and calms", () => {
  for (const [status, tier] of [["passed", null], ["missed", null], ["accepted", 1], ["accepted", 2]] as const) {
    const r = crowdReaction(status, tier);
    assert.equal(r.mood, "calm", `${status} ${tier}`);
    assert.equal(r.sound, "groan");
  }
});

test("Part-Time Fan and up get a cheer that grows with every tier, and the crowd gets more excited", () => {
  const rs = [3, 4, 5, 6, 7].map((tier) => crowdReaction("accepted", tier));
  for (const r of rs) assert.deepEqual([r.mood, r.sound], ["hype", "cheer"]);
  for (let i = 1; i < rs.length; i++) {
    assert.ok(rs[i].strength > rs[i - 1].strength, "louder each tier");
    assert.ok(rs[i].beatMs < rs[i - 1].beatMs, "faster each tier");
  }
  assert.equal(rs[4].strength, 1);
});
