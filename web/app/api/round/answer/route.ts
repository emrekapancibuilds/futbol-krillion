import { answerRound } from "@/lib/game/engine.ts";
import { body, json, slotFrom } from "@/lib/game/http.ts";
import { roundContext } from "@/lib/game/premium.ts";
import { assertSameOrigin, HttpError } from "@/lib/billing/security.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
  assertSameOrigin(req);
  const b = await body(req);
  const slot = slotFrom(b);
  if (!slot || typeof b.input !== "string" || typeof b.token !== "string") return json({ status: "invalid" }, 400);
  const context = await roundContext(req, b);
  const result = answerRound(context.data, slot, b.input, b.token, Date.now(), context.secret);
  return json(result, result.status === "invalid" ? 400 : 200);
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : "Unable to load this round.", status: "invalid" }, error instanceof HttpError ? error.status : 503);
  }
}
