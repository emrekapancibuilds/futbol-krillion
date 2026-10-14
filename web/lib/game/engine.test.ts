import { test } from "node:test";
import assert from "node:assert/strict";

import { answerRound, ANSWER_MS, dayFor, GRACE_MS, passRound, pickUnlimited, PREVIEW_MS, revealRound, startRound, TOP_ANSWERS, type GameData } from "./engine.ts";

const SECRET = "s";
const answers = Array.from({ length: 30 }, (_, i) => ({
  id: `p${i}`, name: i === 0 ? "Thierry Henry" : `Player ${String.fromCharCode(65 + (i % 26))}${i}`,
  tier: 1 + (i % 7), points: [5, 10, 20, 30, 60, 100, 200][i % 7], fact: `fact ${i}`, variants: [] as string[],
}));
answers[0].variants = ["Thierry Henry"];
const DATA: GameData = {
  days: [{ number: 1, date: "2026-10-11", prompts: ["pA", "pA", "pA", "pA", "pA", "pA", "pA"] },
         { number: 2, date: "2026-10-12", prompts: ["pA", "pA", "pA", "pA", "pA", "pA", "pA"] }],
  prompt: (id) => ({ id: "pA", text: id === "pU1" ? "Name a player who played for Hull" : "Name a player who played for Arsenal",
                      entityType: "player", answers }),
  unlimited: ["pU1", "pU2"],
  categories: { "premier-league": ["pU2"] },
  subjects: {},
  names: () => [["p0", "Thierry Henry"], ["x", "Colin Hendry"]],
};

test("dayFor picks the daily for the UTC date and returns null outside the schedule", () => {
  assert.equal(dayFor(DATA, new Date("2026-10-12T23:30:00Z"))?.number, 2);
  assert.equal(dayFor(DATA, new Date("2026-12-01T00:00:00Z")), null);
});

test("players get 30 seconds to answer (user, 2026-10-11: 5 seconds longer than 25)", () => {
  assert.equal(ANSWER_MS, 30_000);
  assert.equal(startRound(DATA, { day: 1, round: 0 }, 0, SECRET)?.deadline, PREVIEW_MS + 30_000);
});

test("starting a round returns the text and a deadline after the preview and answer time", () => {
  const r = startRound(DATA, { day: 1, round: 0 }, 1_000, SECRET);
  assert.equal(r?.text, "Name a player who played for Arsenal");
  assert.equal(r?.deadline, 1_000 + PREVIEW_MS + ANSWER_MS);
  assert.equal(startRound(DATA, { day: 1, round: 7 }, 1_000, SECRET), null);       // only rounds 0-6
  assert.equal(startRound(DATA, { day: 9, round: 0 }, 1_000, SECRET), null);       // unknown day
});

test("an answer in time is checked; a wrong one is rejected; a late one expires", () => {
  const r = startRound(DATA, { day: 1, round: 0 }, 0, SECRET)!;
  const ok = answerRound(DATA, { day: 1, round: 0 }, "Thierry Henry", r.token, 10_000, SECRET);
  assert.equal(ok.status, "accepted");
  assert.equal(ok.status === "accepted" && ok.name, "Thierry Henry");
  assert.equal(ok.status === "accepted" && ok.points, 5);
  assert.equal(answerRound(DATA, { day: 1, round: 0 }, "Colin Hendry", r.token, 10_000, SECRET).status, "rejected");
  assert.equal(answerRound(DATA, { day: 1, round: 0 }, "Thierry Henry", r.token, r.deadline + GRACE_MS + 1, SECRET).status, "expired");
});

test("a token only works for its own day and round", () => {
  const r = startRound(DATA, { day: 1, round: 0 }, 0, SECRET)!;
  assert.equal(answerRound(DATA, { day: 1, round: 1 }, "Thierry Henry", r.token, 10_000, SECRET).status, "invalid");
  assert.equal(answerRound(DATA, { day: 2, round: 0 }, "Thierry Henry", r.token, 10_000, SECRET).status, "invalid");
  assert.equal(answerRound(DATA, { day: 1, round: 0 }, "Thierry Henry", "forged.token", 10_000, SECRET).status, "invalid");
});

test("the answer list stays hidden until the round is over", () => {
  const r = startRound(DATA, { day: 1, round: 0 }, 0, SECRET)!;
  assert.equal(revealRound(DATA, { day: 1, round: 0 }, r.token, 10_000, SECRET), null);              // still running
  const done = answerRound(DATA, { day: 1, round: 0 }, "Thierry Henry", r.token, 10_000, SECRET);
  const proof = done.status === "accepted" ? done.proof : "";
  const early = revealRound(DATA, { day: 1, round: 0 }, proof, 10_000, SECRET)!;                       // answered: allowed
  assert.equal(early.total, 30);
  assert.equal(early.text, "Name a player who played for Arsenal");        // the answer pop-up shows the question at the top
  assert.equal(early.tiers.length, 7);
  assert.equal(early.tiers[0].tier, 1);
  assert.ok(early.tiers.every((t) => t.top.length <= 10));
  assert.ok(revealRound(DATA, { day: 1, round: 0 }, r.token, r.deadline + 1, SECRET));                   // time is up: allowed
});

test("a surname or misspelling asks to confirm the full name before it counts", () => {
  const r = startRound(DATA, { day: 1, round: 0 }, 0, SECRET)!;
  for (const input of ["Henry", "thierry henri"]) {
    const res = answerRound(DATA, { day: 1, round: 0 }, input, r.token, 10_000, SECRET);
    assert.deepEqual(res, { status: "confirm", suggestion: "Thierry Henry" });
  }
  assert.equal(answerRound(DATA, { day: 1, round: 0 }, "Thierry Henry", r.token, 10_000, SECRET).status, "accepted");
});

test("passing ends the round with a proof that unlocks the answer list", () => {
  const r = startRound(DATA, { day: 1, round: 0 }, 0, SECRET)!;
  const passed = passRound(DATA, { day: 1, round: 0 }, r.token, SECRET);
  assert.equal(passed.status, "passed");
  assert.ok(passed.status === "passed" && revealRound(DATA, { day: 1, round: 0 }, passed.proof, 10_000, SECRET));
  assert.equal(passRound(DATA, { day: 1, round: 0 }, "forged.token", SECRET).status, "invalid");
  assert.equal(passRound(DATA, { day: 1, round: 1 }, r.token, SECRET).status, "invalid");
});

test("an Unlimited round is keyed by its prompt and works like a daily round", () => {
  const r = startRound(DATA, { prompt: "pU1" }, 0, SECRET)!;
  assert.equal(r.text, "Name a player who played for Hull");
  const ok = answerRound(DATA, { prompt: "pU1" }, "Thierry Henry", r.token, 10_000, SECRET);
  assert.equal(ok.status, "accepted");
  assert.ok(ok.status === "accepted" && revealRound(DATA, { prompt: "pU1" }, ok.proof, 10_000, SECRET));
  assert.equal(passRound(DATA, { prompt: "pU1" }, r.token, SECRET).status, "passed");
});

test("Unlimited tokens and daily tokens do not mix, and dailies cannot be played as Unlimited prompts", () => {
  const u = startRound(DATA, { prompt: "pU1" }, 0, SECRET)!;
  assert.equal(answerRound(DATA, { day: 1, round: 0 }, "Thierry Henry", u.token, 10_000, SECRET).status, "invalid");
  assert.equal(answerRound(DATA, { prompt: "pU2" }, "Thierry Henry", u.token, 10_000, SECRET).status, "invalid");
  const d = startRound(DATA, { day: 1, round: 0 }, 0, SECRET)!;
  assert.equal(answerRound(DATA, { prompt: "pU1" }, "Thierry Henry", d.token, 10_000, SECRET).status, "invalid");
  assert.equal(startRound(DATA, { prompt: "pA" }, 0, SECRET), null);           // a daily's id is not in the Unlimited list
});

test("the next Unlimited prompt is one not seen yet, falling back to any once all are seen", () => {
  assert.equal(pickUnlimited(DATA, ["pU1"], () => 0), "pU2");
  assert.equal(pickUnlimited(DATA, ["pU2"], () => 0.99), "pU1");
  assert.ok(["pU1", "pU2"].includes(pickUnlimited(DATA, ["pU1", "pU2"], () => 0.5)!));
});

test("the answer list only ever shows the top answers of each tier, never the whole list", () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ id: `m${i}`, name: `Many ${i}`, tier: 1, points: 5, fact: "", variants: [] as string[] }));
  const BIG: GameData = { ...DATA, prompt: () => ({ id: "pBig", text: "t", entityType: "player", answers: many }) };
  const r = startRound(BIG, { day: 1, round: 0 }, 0, SECRET)!;
  const passed = passRound(BIG, { day: 1, round: 0 }, r.token, SECRET);
  const proof = passed.status === "passed" ? passed.proof : "";
  const asAll = (revealRound as (...a: unknown[]) => ReturnType<typeof revealRound>)(BIG, { day: 1, round: 0 }, proof, 10_000, SECRET, true)!;
  assert.equal(asAll.tiers[0].count, 25);
  assert.equal(asAll.tiers[0].top.length, TOP_ANSWERS);
});

test("an Unlimited round type only serves its own prompts; an unknown type serves nothing", () => {
  for (let i = 0; i < 5; i++) assert.equal(pickUnlimited(DATA, [], Math.random, "premier-league"), "pU2");
  assert.equal(pickUnlimited(DATA, ["pU2"], () => 0, "premier-league"), "pU2");     // all seen: repeats within the type
  assert.equal(pickUnlimited(DATA, [], Math.random, "bundesliga"), null);
  assert.ok(["pU1", "pU2"].includes(pickUnlimited(DATA, [], Math.random, "mixed")!));
});

test("a set avoids a second prompt about the same club, league or national team", () => {
  const D: GameData = { ...DATA, unlimited: ["a1", "a2", "b1"], categories: {},
                        subjects: { a1: "club:Q1", a2: "club:Q1", b1: "club:Q2" } };
  for (let i = 0; i < 5; i++) assert.equal(pickUnlimited(D, ["a1"], Math.random, "mixed", ["a1"]), "b1");
  assert.ok(["a2", "b1"].includes(pickUnlimited(D, ["a1"], Math.random, "mixed", [])!));     // a new set: no limit
  assert.equal(pickUnlimited(D, ["a1", "b1"], () => 0, "mixed", ["a1", "b1"]), "a2");         // nothing else left
});
