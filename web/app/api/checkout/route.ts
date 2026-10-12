import { json } from "@/lib/game/http.ts";
import { NOT_SET_UP, stripe, UNREACHABLE } from "@/lib/payments/stripe.ts";
import { checkoutParams } from "@/lib/payments/unlock.ts";

export const dynamic = "force-dynamic";

/** Opens a Stripe Checkout page for Unlimited. Paying sends the player to /unlimited/unlocked; backing out, home. */
export async function POST(req: Request) {
  const s = stripe();
  if (!s) return json(NOT_SET_UP, 503);
  const origin = new URL(req.url).origin;
  try {
    const session = await s.checkout.sessions.create(checkoutParams(origin));
    return session.url ? json({ url: session.url }) : json(UNREACHABLE, 502);
  } catch (e) {
    console.error("checkout_failed", e instanceof Error ? e.message : e);   // Stripe's message only, never the key
    return json(UNREACHABLE, 502);
  }
}
