import { startRound } from "@/lib/game/engine.ts";
import { body, isToday, json } from "@/lib/game/http.ts";
import { gameData, gameSecret } from "@/lib/game/server.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { day, round } = await body(req);
  if (!isToday(day) || typeof round !== "number") return json({ error: "Not available" }, 400);
  const started = startRound(gameData(), { day, round }, Date.now(), gameSecret());
  return started ? json({ ...started, now: Date.now() }) : json({ error: "Not available" }, 400);
}
