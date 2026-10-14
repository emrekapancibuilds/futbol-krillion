// The game's server rules (spec §7, §9), as pure functions of the data and the current time.
// Prompt text is only revealed when a round starts, the clock lives in a signed token, and answer lists
// are only revealed once the round is over (answered, passed, or time is up).
// A round is a slot: round `round` of daily `day`, or one prompt from the Unlimited list.
import { matchDetail, prepareGlobal, preparePrompt, type Answer, type GlobalIndex, type NameRow, type PromptIndex } from "../matching/match.ts";
import { sign, verify } from "./tokens.ts";

export const ROUNDS = 7;
export const PREVIEW_MS = 3_000;
export const ANSWER_MS = 30_000;      // was 25 s; 5 s longer (user, 2026-10-11)
export const GRACE_MS = 2_000;
export const TOP_ANSWERS = 10;      // per tier in the answer list; the full list is never sent (user, 2026-10-11)

export type Day = { number: number; date: string; prompts: string[] };
export type PromptData = { id: string; text: string; entityType: string; answers: Answer[] };
export type GameData = {
  days: Day[];
  unlimited: string[];                       // prompt ids playable in Unlimited (never an unaired daily)
  categories: Record<string, string[]>;      // Unlimited round types: "premier-league", "champions-league", ...
  subjects: Record<string, string>;          // what each Unlimited prompt is about: "club:Q64", "league:la-liga", ...
  prompt: (id: string) => PromptData;
  names: (entityType: string) => NameRow[];
};
export type Slot = { day: number; round: number } | { prompt: string };

type SlotFields = { day?: number; round?: number; prompt?: string };
type RoundToken = SlotFields & { deadline: number };
type ProofToken = SlotFields & { done: true };

export type StartResult = { text: string; previewMs: number; answerMs: number; deadline: number; token: string };
export type AnswerResult =
  | { status: "accepted"; name: string; tier: number; points: number; fact: string; proof: string }
  | { status: "confirm"; suggestion: string }
  | { status: "rejected" }
  | { status: "expired"; proof: string }
  | { status: "invalid" };
export type Reveal = { text: string; total: number; tiers: { tier: number; points: number; count: number; top: { name: string; fact: string }[] }[] };

export function dayFor(data: GameData, now: Date): Day | null {
  const date = now.toISOString().slice(0, 10);
  return data.days.find((d) => d.date === date) ?? null;
}

const fields = (s: Slot): SlotFields => ("prompt" in s ? { prompt: s.prompt } : { day: s.day, round: s.round });
const sameSlot = (t: SlotFields, s: Slot) =>
  "prompt" in s ? t.prompt === s.prompt && t.day === undefined : t.prompt === undefined && t.day === s.day && t.round === s.round;

function promptFor(data: GameData, slot: Slot): PromptData | null {
  if ("prompt" in slot) return data.unlimited.includes(slot.prompt) ? data.prompt(slot.prompt) : null;
  const day = data.days.find((d) => d.number === slot.day);
  if (!day || !Number.isInteger(slot.round) || slot.round < 0 || slot.round >= ROUNDS) return null;
  return data.prompt(day.prompts[slot.round]);
}

/** A random Unlimited prompt of the round type (`mixed` or none: any) the player has not seen, and not about a
 *  club, league or national team already in this set (`set`: the set's prompt ids so far). The limits are dropped
 *  one at a time when nothing is left. An unknown round type has no prompts. */
export function pickUnlimited(data: GameData, seen: string[], rand: () => number = Math.random,
                              category = "mixed", set: string[] = []): string | null {
  const pool = category === "mixed" ? data.unlimited : data.categories[category] ?? [];
  const done = new Set(seen);
  const taken = new Set(set.map((id) => data.subjects[id] ?? id));
  const freshNew = pool.filter((id) => !done.has(id) && !taken.has(data.subjects[id] ?? id));
  const fresh = pool.filter((id) => !done.has(id));
  const from = freshNew.length ? freshNew : fresh.length ? fresh : pool;
  return from.length ? from[Math.min(from.length - 1, Math.floor(rand() * from.length))] : null;
}

const prepared = new Map<string, PromptIndex>();
const globals = new Map<string, GlobalIndex>();

function indexes(data: GameData, prompt: PromptData): [PromptIndex, GlobalIndex] {
  const club = prompt.entityType === "club";
  if (!prepared.has(prompt.id)) prepared.set(prompt.id, preparePrompt(prompt.answers, club));
  if (!globals.has(prompt.entityType)) globals.set(prompt.entityType, prepareGlobal(data.names(prompt.entityType)));
  return [prepared.get(prompt.id)!, globals.get(prompt.entityType)!];
}

export function startRound(data: GameData, slot: Slot, now: number, secret: string): StartResult | null {
  const prompt = promptFor(data, slot);
  if (!prompt) return null;
  const deadline = now + PREVIEW_MS + ANSWER_MS;
  const token = sign({ ...fields(slot), deadline } satisfies RoundToken, secret);
  return { text: prompt.text, previewMs: PREVIEW_MS, answerMs: ANSWER_MS, deadline, token };
}

export function answerRound(data: GameData, slot: Slot, input: string, token: string, now: number, secret: string): AnswerResult {
  const t = verify<RoundToken>(token, secret);
  const prompt = promptFor(data, slot);
  if (!t || !prompt || !sameSlot(t, slot) || typeof t.deadline !== "number") return { status: "invalid" };
  const proof = sign({ ...fields(slot), done: true } satisfies ProofToken, secret);
  if (now > t.deadline + GRACE_MS) return { status: "expired", proof };
  const [p, g] = indexes(data, prompt);
  const hit = matchDetail(String(input ?? "").slice(0, 120), p, g, prompt.entityType === "club");
  if (!hit) return { status: "rejected" };
  if (!hit.exact) return { status: "confirm", suggestion: hit.answer.name };
  const a = hit.answer;
  return { status: "accepted", name: a.name, tier: a.tier, points: a.points, fact: a.fact, proof };
}

/** Giving up on a round: no points, and the proof unlocks its answer list like an answer or a timeout would. */
export function passRound(data: GameData, slot: Slot, token: string, secret: string): { status: "passed"; proof: string } | { status: "invalid" } {
  const t = verify<RoundToken>(token, secret);
  if (!t || !promptFor(data, slot) || !sameSlot(t, slot)) return { status: "invalid" };
  return { status: "passed", proof: sign({ ...fields(slot), done: true } satisfies ProofToken, secret) };
}

/** `token` is either the round token (allowed once its deadline has passed) or a proof from answerRound/passRound.
 *  Each tier shows its count and only its TOP_ANSWERS best-known answers. */
export function revealRound(data: GameData, slot: Slot, token: string, now: number, secret: string): Reveal | null {
  const t = verify<Partial<RoundToken & ProofToken>>(token, secret);
  const prompt = promptFor(data, slot);
  if (!t || !prompt || !sameSlot(t, slot)) return null;
  const over = t.done === true || (typeof t.deadline === "number" && now > t.deadline);
  if (!over) return null;
  const tiers = [1, 2, 3, 4, 5, 6, 7].map((tier) => {
    const list = prompt.answers.filter((a) => a.tier === tier);
    return { tier, points: list[0]?.points ?? 0, count: list.length,
             top: list.slice(0, TOP_ANSWERS).map((a) => ({ name: a.name, fact: a.fact })) };
  });
  return { text: prompt.text, total: prompt.answers.length, tiers };
}
