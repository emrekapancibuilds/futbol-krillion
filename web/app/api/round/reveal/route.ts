import { revealRound } from "@/lib/game/engine.ts";
import { body, json, slotFrom } from "@/lib/game/http.ts";
import { gameData, gameSecret } from "@/lib/game/server.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body(req);
  const slot = slotFrom(b);
  if (!slot || typeof b.token !== "string") return json({ error: "Bad request" }, 400);
  const reveal = revealRound(gameData(), slot, b.token, Date.now(), gameSecret());
  return reveal ? json(reveal) : json({ error: "Finish the round first" }, 403);
}
