import { pickUnlimited, startRound } from "@/lib/game/engine.ts";
import { body, json } from "@/lib/game/http.ts";
import { gameData, gameSecret } from "@/lib/game/server.ts";
import { isUnlocked } from "@/lib/payments/unlock.ts";

export const dynamic = "force-dynamic";

/** Starts an Unlimited round of a round type (`category`) on a prompt the player has not seen (`seen`). Only for
 *  devices holding an unlock token from a paid checkout (`unlock`); everyone else gets 402 and the unlock pop-up. */
export async function POST(req: Request) {
  const { seen, category, set, unlock } = await body(req);
  if (!isUnlocked(unlock, gameSecret())) return json({ error: "locked" }, 402);
  const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(-max) : []);
  const data = gameData();
  const prompt = pickUnlimited(data, ids(seen, 2000), Math.random, typeof category === "string" ? category : "mixed", ids(set, 7));
  const started = prompt ? startRound(data, { prompt }, Date.now(), gameSecret()) : null;
  return started ? json({ ...started, prompt, now: Date.now() }) : json({ error: "Not available" }, 400);
}
