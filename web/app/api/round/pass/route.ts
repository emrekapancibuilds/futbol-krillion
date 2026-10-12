import { passRound } from "@/lib/game/engine.ts";
import { body, json, slotFrom } from "@/lib/game/http.ts";
import { roundContext } from "@/lib/game/premium.ts";
import { assertSameOrigin, HttpError } from "@/lib/billing/security.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
  assertSameOrigin(req);
  const b = await body(req);
  const slot = slotFrom(b);
  if (!slot || typeof b.token !== "string") return json({ status: "invalid" }, 400);
  const context = await roundContext(req, b);
  const result = passRound(context.data, slot, b.token, context.secret);
  return json(result, result.status === "invalid" ? 400 : 200);
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : "Unable to load this round.", status: "invalid" }, error instanceof HttpError ? error.status : 503);
  }
}
