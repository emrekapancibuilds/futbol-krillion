import { test } from "node:test";
import assert from "node:assert/strict";

import { columnLevel, withYou } from "./columns.ts";

test("a column is as tall as the tier: 0 for a miss or pass, 1-7 for a tier", () => {
  assert.equal(columnLevel({ status: "missed", tier: null }), 0);
  assert.equal(columnLevel({ status: "passed", tier: null }), 0);
  assert.equal(columnLevel({ status: "accepted", tier: 1 }), 1);
  assert.equal(columnLevel({ status: "accepted", tier: 7 }), 7);
});

const tiers = [
  { tier: 1, points: 5, count: 40, top: [{ name: "Wayne Rooney", fact: "Man Utd" }] },
  { tier: 5, points: 60, count: 30, top: [{ name: "Ilkay Gundogan", fact: "Man City" }] },
  { tier: 6, points: 100, count: 0, top: [] },
];

test("the player's answer is marked where it already is in the list", () => {
  const out = withYou(tiers, { name: "Wayne Rooney", tier: 1, fact: "Man Utd" });
  assert.equal(out[0].top.filter((a) => a.you).length, 1);
  assert.equal(out[0].top.length, 1);                      // not added twice
  assert.equal(out[1].top.some((a) => a.you), false);
});

test("an answer outside the top of its tier is added to that tier so the player can always find it", () => {
  const out = withYou(tiers, { name: "Erling Haaland", tier: 5, fact: "Man City" });
  const you = out[1].top.find((a) => a.you);
  assert.equal(you?.name, "Erling Haaland");
  assert.equal(you?.fact, "Man City");
  assert.equal(out[1].top.length, 2);
});

test("a name match ignores case and accents, and rounds without an answer are left alone", () => {
  assert.equal(withYou(tiers, { name: "ilkay gundogan", tier: 5, fact: "" })[1].top.filter((a) => a.you).length, 1);
  const none = withYou(tiers, { name: undefined, tier: null, fact: undefined });
  assert.ok(none.every((t) => t.top.every((a) => !a.you)));
});
