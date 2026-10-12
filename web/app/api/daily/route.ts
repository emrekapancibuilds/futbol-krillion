import { dayFor, ROUNDS } from "@/lib/game/engine.ts";
import { json } from "@/lib/game/http.ts";
import { gameData, snapshotDate } from "@/lib/game/server.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const day = dayFor(gameData(), new Date());
  if (!day) return json({ error: "No daily today. Check back soon." }, 404);
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return json({ number: day.number, date: day.date, rounds: ROUNDS, nextAt: next.toISOString(), snapshot: snapshotDate() });
}
