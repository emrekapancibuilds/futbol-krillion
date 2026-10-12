import { startRound } from "@/lib/game/engine.ts";
import { body, isToday, json } from "@/lib/game/http.ts";
import { roundContext } from "@/lib/game/premium.ts";
import { assertSameOrigin, HttpError } from "@/lib/billing/security.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
  assertSameOrigin(req);
  const b = await body(req);
  const { day, round } = b;
  if (b.prompt !== undefined || (!b.gameId && !isToday(day)) || typeof day !== "number" || typeof round !== "number") return json({ error: "Not available" }, 400);
  const context = await roundContext(req, b);
  const started = startRound(context.data, { day, round }, Date.now(), context.secret);
  return started ? json({ ...started, now: Date.now() }) : json({ error: "Not available" }, 400);
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : "Unable to load this round.", status: "invalid" }, error instanceof HttpError ? error.status : 503);
  }
}
