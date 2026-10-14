import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { MAX_STREAK_BONUS } from "./game/streak.ts";
import { MAX_SCORE, TIERS } from "./tiers.ts";

test("the points ladder is 5, 10, 20, 30, 60, 100, 200 (user, 2026-10-14)", () => {
  assert.deepEqual(TIERS.map((t) => t.points), [5, 10, 20, 30, 60, 100, 200]);
});

test("a perfect set is seven Jobless answers plus the best streak", () => {
  assert.equal(MAX_SCORE, 7 * 200 + MAX_STREAK_BONUS);
  assert.equal(MAX_SCORE, 1_610);
});

test("every answer in the shipped prompt files carries its tier's points, so no stale value can reach a player", () => {
  const dir = new URL("../data/prompts/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 100, `${files.length} prompt files`);
  let checked = 0;
  for (const f of files) {
    const prompt = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as { answers: { tier: number; points: number }[] };
    for (const a of prompt.answers) {
      assert.equal(a.points, TIERS[a.tier - 1].points, `${f}: tier ${a.tier} has ${a.points} points`);
      checked++;
    }
  }
  assert.ok(checked > 10_000, `${checked} answers checked`);
});
