import { body, json } from "@/lib/game/http.ts";
import { gameSecret } from "@/lib/game/server.ts";
import { NOT_SET_UP, stripe, UNREACHABLE } from "@/lib/payments/stripe.ts";
import { emailVariants, findPurchase, unlockToken } from "@/lib/payments/unlock.ts";

export const dynamic = "force-dynamic";

/** Restore by email (user's choice, 2026-10-12): finds a paid Unlimited checkout made with that email in Stripe.
 *  The email is only used for the lookup and is not stored. */
export async function POST(req: Request) {
  const { email } = await body(req);
  if (!emailVariants(email).length) return json({ error: "That doesn't look like an email address." }, 400);
  const s = stripe();
  if (!s) return json(NOT_SET_UP, 503);
  try {
    const hit = await findPurchase(email as string, async (e) =>
      (await s.checkout.sessions.list({ customer_details: { email: e }, status: "complete", limit: 100,
                                     expand: ["data.payment_intent.latest_charge"] })).data);
    if (!hit) return json({ error: "We couldn't find an Unlimited purchase for that email." }, 404);
    return json({ unlock: unlockToken(hit.id, gameSecret()) });
  } catch (e) {
    console.error("restore_lookup_failed", e instanceof Error ? e.message : e);   // Stripe's message only, never the key
    return json(UNREACHABLE, 502);
  }
}
