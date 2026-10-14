import { test } from "node:test";
import assert from "node:assert/strict";

import { shareText, streakAfter } from "./share.ts";

test("share text is plain: number, total, points per round, best pick, link (spec §7, no emojis)", () => {
  const text = shareText(12, [10, 30, 0, 60, 100, 20, 5], [2, 4, null, 5, 6, 3, 1], "https://example.app");
  assert.equal(text, "Futkrill #12 · 225 / 1,610\n10 · 30 · 0 · 60 · 100 · 20 · 5\nBest pick: Insane Ball Knowledge\nhttps://example.app");
  assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test("a day with no correct answers says so", () => {
  assert.match(shareText(1, [0, 0, 0, 0, 0, 0, 0], [null, null, null, null, null, null, null], "x"), /Best pick: none/);
});

test("the streak continues only from yesterday's daily", () => {
  assert.equal(streakAfter({ last: 4, streak: 3 }, 5), 4);
  assert.equal(streakAfter({ last: 2, streak: 3 }, 5), 1);
  assert.equal(streakAfter(null, 5), 1);
  assert.equal(streakAfter({ last: 5, streak: 3 }, 5), 3);   // replaying today doesn't add
});

test("an Unlimited set shares its round type instead of a daily number", () => {
  const text = shareText("Unlimited · Premier League", [10, 30, 0, 60, 100, 20, 5], [2, 4, null, 5, 6, 3, 1], "x");
  assert.equal(text.split("\n")[0], "Futkrill Unlimited · Premier League · 225 / 1,610");
});
