import { body, json } from "@/lib/game/http.ts";
import { gameSecret } from "@/lib/game/server.ts";
import { NOT_SET_UP, stripe, UNREACHABLE } from "@/lib/payments/stripe.ts";
import { isUnlimitedPurchase, unlockToken } from "@/lib/payments/unlock.ts";

export const dynamic = "force-dynamic";

/** After checkout: checks with Stripe that the session was paid, then hands the device its unlock token. */
export async function POST(req: Request) {
  const { session } = await body(req);
  if (typeof session !== "string" || !/^cs_[A-Za-z0-9_]{10,200}$/.test(session)) return json({ error: "No checkout to check." }, 400);
  const s = stripe();
  if (!s) return json(NOT_SET_UP, 503);
  try {
    const paid = await s.checkout.sessions.retrieve(session, { expand: ["payment_intent.latest_charge"] });
    if (!isUnlimitedPurchase(paid)) return json({ error: "That checkout hasn't been paid." }, 402);
    return json({ unlock: unlockToken(paid.id, gameSecret()) });
  } catch (e) {
    console.error("unlock_check_failed", e instanceof Error ? e.message : e);   // Stripe's message only, never the key
    return json(UNREACHABLE, 502);
  }
}
