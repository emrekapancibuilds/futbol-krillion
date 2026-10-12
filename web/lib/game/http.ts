import { dayFor, type Slot } from "./engine.ts";
import { gameData } from "./server.ts";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The round a request is about: `{ day, round }` for the daily, `{ prompt }` for Unlimited. */
export function slotFrom(b: Record<string, unknown>): Slot | null {
  if (typeof b.prompt === "string") return { prompt: b.prompt };
  if (typeof b.day === "number" && typeof b.round === "number") return { day: b.day, round: b.round };
  return null;
}

/** Only today's daily (by UTC date) can be started. */
export function isToday(day: unknown): day is number {
  return typeof day === "number" && dayFor(gameData(), new Date())?.number === day;
}
