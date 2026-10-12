import { answerRound } from "@/lib/game/engine.ts";
import { body, json, slotFrom } from "@/lib/game/http.ts";
import { gameData, gameSecret } from "@/lib/game/server.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body(req);
  const slot = slotFrom(b);
  if (!slot || typeof b.input !== "string" || typeof b.token !== "string") return json({ status: "invalid" }, 400);
  const result = answerRound(gameData(), slot, b.input, b.token, Date.now(), gameSecret());
  return json(result, result.status === "invalid" ? 400 : 200);
}
