import assert from "node:assert/strict";
import test from "node:test";

import { MAX_STREAK_BONUS, bonusForStreak, roundScore, scoreRound } from "./streak.ts";

const run = (statuses: ("accepted" | "missed" | "passed")[]) => {
  const done: { status: "accepted" | "missed" | "passed" }[] = [];
  return statuses.map((status) => { const s = scoreRound(done, status); done.push({ status }); return s; });
};

test("the bonus is 10 for the 2nd correct answer in a row, then 20, 30, 40, 50, 60 (user, 2026-10-13)", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(bonusForStreak), [0, 0, 10, 20, 30, 40, 50, 60]);
  assert.equal(MAX_STREAK_BONUS, 10 + 20 + 30 + 40 + 50 + 60);            // a perfect set of 7 earns 210 extra
});

test("any accepted answer builds the streak, whatever its tier", () => {
  assert.deepEqual(run(["accepted", "accepted", "accepted", "accepted", "accepted", "accepted", "accepted"]).map((s) => s.bonus),
                   [0, 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(run(["accepted", "accepted", "accepted"]).map((s) => s.streak), [1, 2, 3]);
});

test("a pass or a round that ends on the timer breaks the streak, and the next correct answer starts over", () => {
  const r = run(["accepted", "accepted", "passed", "accepted", "missed", "accepted", "accepted"]);
  assert.deepEqual(r.map((s) => s.streak), [1, 2, 0, 1, 0, 1, 2]);
  assert.deepEqual(r.map((s) => s.bonus), [0, 10, 0, 0, 0, 0, 10]);
  assert.deepEqual(r.map((s) => s.lost), [0, 0, 2, 0, 1, 0, 0]);          // how long the streak was when it broke
});

test("missing the very first rounds loses nothing, because there was no streak", () => {
  assert.deepEqual(run(["missed", "passed", "accepted"]).map((s) => s.lost), [0, 0, 0]);
});

test("a round's score is its points plus its bonus, and old saved rounds without a bonus still count", () => {
  assert.equal(roundScore({ points: 160, bonus: 20 }), 180);
  assert.equal(roundScore({ points: 160 }), 160);
});
