import { pickUnlimited, startRound } from "@/lib/game/engine.ts";
import { body, json } from "@/lib/game/http.ts";
import { unlimitedContext } from "@/lib/game/premium.ts";
import { assertSameOrigin, HttpError } from "@/lib/billing/security.ts";

export const dynamic = "force-dynamic";

/** Starts an Unlimited round of a round type (`category`) on a prompt the player has not seen (`seen`). */
export async function POST(req: Request) {
  try {
  assertSameOrigin(req);
  const { seen, category, set } = await body(req);
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(-max) : []);
  const {data, secret} = await unlimitedContext(req);
  const prompt = pickUnlimited(data, ids(seen, 2000), Math.random, typeof category === "string" ? category : "mixed", ids(set, 7));
  const started = prompt ? startRound(data, { prompt }, Date.now(), secret) : null;
  return started ? json({ ...started, prompt, now: Date.now() }) : json({ error: "Not available" }, 400);
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : "Unable to load this round." }, error instanceof HttpError ? error.status : 503);
  }
}
