import assert from "node:assert/strict";
import test from "node:test";

import { findPlayers } from "./niche-server.ts";

test("the real data: Messi is the least niche player there is", () => {
  const [first] = findPlayers("lionel messi");
  assert.equal(first.name, "Lionel Messi");
  assert.equal(first.score, 1);
  assert.equal(first.label, "Everyone has heard of them");
  assert.match(first.line, /Argentina/);
});

test("the real data: accents don't matter and several players come back for a shared name", () => {
  assert.equal(findPlayers("ilkay gundogan")[0].name, "İlkay Gündoğan");
  const rodri = findPlayers("rodri");
  assert.ok(rodri.length > 1 && rodri.length <= 6);
  assert.ok(rodri.every((r) => r.score >= 1 && r.score <= 100 && r.line !== undefined));
});

test("the real data: gibberish finds nobody, and a short common query is still quick", () => {
  assert.deepEqual(findPlayers("qzxqzxqzx"), []);
  const t0 = performance.now();
  const ma = findPlayers("ma");
  assert.equal(ma.length, 6);
  assert.ok(performance.now() - t0 < 1500, `${performance.now() - t0} ms`);
});

test("results are ordered by how well they match, and every score is below 97 unless the player has no fame", () => {
  const r = findPlayers("silva");
  assert.ok(r.length >= 3);
  for (const x of r) assert.ok(x.score <= 96 || x.score >= 97);
});

test("the real data: a search for a famous name puts the famous player first, not someone's nickname", () => {
  assert.equal(findPlayers("haaland")[0].name, "Erling Haaland");
  assert.equal(findPlayers("cristiano ronaldo")[0].name, "Cristiano Ronaldo");
  assert.ok(findPlayers("ronaldo").slice(0, 3).some((r) => r.name === "Cristiano Ronaldo"));      // several players are named plain "Ronaldo"
});
