import { test } from "node:test";
import assert from "node:assert/strict";

import { matchAnswer, matchDetail, normalize, prepareGlobal, preparePrompt, type Answer } from "./match.ts";

const a = (id: string, name: string, tier: number, variants: string[] = [name]): Answer =>
  ({ id, name, tier, points: [0, 5, 10, 20, 30, 60, 100, 200][tier], fact: "", variants });

// Answers are sorted most famous first, as the site's data files are.
const ARSENAL = preparePrompt([
  a("henry", "Thierry Henry", 1, ["Thierry Henry", "Titi"]),
  a("vieira", "Patrick Vieira", 1),
  a("bergkamp", "Dennis Bergkamp", 1),
  a("ozil", "Mesut Özil", 1),
  a("pires", "Robert Pirès", 2),
  a("shevchenko", "Andriy Shevchenko", 1),          // not Arsenal, but handy for the sounds-alike rule
  a("glass", "Hugh Glass", 7),
]);
const MAN_UTD = preparePrompt([a("gary", "Gary Neville", 2), a("phil", "Phil Neville", 3), a("giggs", "Ryan Giggs", 1)]);
const REAL = preparePrompt([a("cr7", "Cristiano Ronaldo", 1), a("r9", "Ronaldo", 1, ["Ronaldo", "Ronaldo Nazário"])]);

const GLOBAL = prepareGlobal([
  ["henry", "Thierry Henry"], ["vieira", "Patrick Vieira"], ["vieira2", "Fábio Vieira"], ["pele", "Pelé"],
  ["hendry", "Colin Hendry"], ["mononym", "Henry"], ["ozil", "Mesut Özil"], ["glass", "Hugh Glass"],
]);

const id = (input: string, prompt = ARSENAL) => matchAnswer(input, prompt, GLOBAL)?.id ?? null;

test("normalize folds case, accents, special letters and punctuation", () => {
  assert.equal(normalize("  Mesut ÖZIL! "), "mesut ozil");
  assert.equal(normalize("Ødegaard"), "odegaard");
  assert.equal(normalize("Oxlade-Chamberlain"), "oxlade chamberlain");
  assert.equal(normalize("O'Shea"), "oshea");
  assert.equal(normalize("Weiß"), "weiss");
});

test("exact names, aliases and initial-plus-surname are accepted", () => {
  assert.equal(id("Thierry Henry"), "henry");
  assert.equal(id("titi"), "henry");
  assert.equal(id("R. Pires"), "pires");
  assert.equal(id("mesut ozil"), "ozil");
});

test("spelling mistakes are accepted within the length rule (spec examples)", () => {
  assert.equal(id("Vierra"), "vieira");
  assert.equal(id("Bergcamp"), "bergkamp");
  assert.equal(id("Ozill"), "ozil");
  assert.equal(id("Thierry Henri"), "henry");
});

test("short or far-off input is not corrected", () => {
  assert.equal(id("Hen"), null);
  assert.equal(id("Bergkampffff"), null);
  assert.equal(id(""), null);
});

test("a real person who is not a valid answer is rejected, never corrected", () => {
  assert.equal(id("Pele"), null);            // exact match on Pelé, who never played for Arsenal
  assert.equal(id("Colin Hendry"), null);
  assert.equal(id("Hendry"), null);          // closer to Colin Hendry than to Henry
});

test("a unique surname is accepted, and a shared surname goes to the least niche player", () => {
  assert.equal(id("Henry"), "henry");        // even though a player known only as 'Henry' exists
  assert.equal(id("Neville", MAN_UTD), "gary");
  assert.equal(id("phil neville", MAN_UTD), "phil");
  assert.equal(id("Gary Nevile", MAN_UTD), "gary");
});

test("a known-as name wins over a surname, and sounds-alike surnames are accepted", () => {
  assert.equal(id("Ronaldo", REAL), "r9");
  assert.equal(id("Cristiano Ronaldo", REAL), "cr7");
  assert.equal(id("Sevchenko"), "shevchenko");
});

test("only a full name or alias is exact; surnames, initials, typos and sounds-alike need a confirm", () => {
  const exact = (input: string, prompt = ARSENAL) => matchDetail(input, prompt, GLOBAL)?.exact;
  assert.equal(exact("Thierry Henry"), true);
  assert.equal(exact("titi"), true);
  assert.equal(exact("mesut ozil"), true);
  assert.equal(exact("Ronaldo", REAL), true);       // the known-as name of Ronaldo Nazário
  assert.equal(exact("Henry"), false);              // surname only -> "Henry -> Thierry Henry?"
  assert.equal(exact("R. Pires"), false);
  assert.equal(exact("Vierra"), false);
  assert.equal(exact("Thierry Henri"), false);
  assert.equal(exact("Sevchenko"), false);
  assert.equal(matchDetail("Pele", ARSENAL, GLOBAL), null);
});

const MORE = preparePrompt([a("bale", "Gareth Bale", 1), a("wij", "Georginio Wijnaldum", 1), a("griez", "Antoine Griezmann", 1)]);
const NONE = prepareGlobal([]);
const more = (input: string) => matchAnswer(input, MORE, NONE)?.id ?? null;

test("spelling is forgiven a little more (user, 2026-10-11)", () => {
  assert.equal(more("Bail"), "bale");            // one slip in a short name
  assert.equal(more("Vynaldom"), "wij");         // three slips in a long one
  assert.equal(more("Grizmen"), "griez");
});

test("but a half-typed name is never filled in", () => {
  assert.equal(more("Bal"), null);
  assert.equal(more("Griezm"), null);
  assert.equal(more("Wijnal"), null);
  assert.equal(more("Gareth"), null);            // a first name alone is not the player
});

// ---- team prompts: players type clubs as answers, and usually by the first word ("Bayern", "Leicester")

const CLUBS = preparePrompt([
  a("bayern", "Bayern Munich", 1, ["Bayern Munich", "Bayern München"]),
  a("leicester", "Leicester City", 2),
  a("psg", "Paris Saint-Germain", 2, ["Paris Saint-Germain", "PSG"]),
  a("real", "Real Madrid", 1), a("betis", "Real Betis Balompié", 4),
  a("dortmund", "Borussia Dortmund", 2),
], true);
const CLUB_GLOBAL = prepareGlobal([["bayern", "Bayern Munich"], ["leicester", "Leicester City"], ["psg", "Paris Saint-Germain"],
                                   ["real", "Real Madrid"], ["betis", "Real Betis Balompié"], ["dortmund", "Borussia Dortmund"],
                                   ["hendry", "Colin Hendry"]]);
const club = (input: string) => matchDetail(input, CLUBS, CLUB_GLOBAL, true);

test("a club is suggested from its first word, as most clubs are shortened", () => {
  assert.deepEqual([club("Bayern")?.answer.id, club("Bayern")?.exact], ["bayern", false]);       // confirm, never silent
  assert.equal(club("Leicester")?.answer.id, "leicester");
  assert.equal(club("Dortmund")?.answer.id, "dortmund");                                         // last word still works
  assert.equal(club("Real")?.answer.id, "real");                                                 // shared first word: the better known club
  assert.deepEqual([club("PSG")?.answer.id, club("PSG")?.exact], ["psg", true]);                 // an alias is exact
  assert.equal(club("Borussia")?.answer.id, "dortmund");
});

test("a first name is not a surname: player prompts never match on the first word", () => {
  const players = preparePrompt([a("bale", "Gareth Bale", 1), a("henry", "Thierry Henry", 1)]);
  assert.equal(matchDetail("Gareth", players, GLOBAL)?.answer.id ?? null, null);
  assert.equal(matchDetail("Bale", players, GLOBAL)?.answer.id, "bale");
});

test("a half-typed club name is still not completed", () => {
  assert.equal(club("Leices"), null);
  assert.equal(club("Bay"), null);
});
