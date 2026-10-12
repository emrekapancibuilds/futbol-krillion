import { json } from "@/lib/game/http.ts";
import { NOT_SET_UP, stripe, UNREACHABLE } from "@/lib/payments/stripe.ts";
import { PRICE_CENTS, PRODUCT } from "@/lib/payments/unlock.ts";

export const dynamic = "force-dynamic";

/** Opens a Stripe Checkout page for Unlimited. Paying sends the player to /unlimited/unlocked; backing out, home. */
export async function POST(req: Request) {
  const s = stripe();
  if (!s) return json(NOT_SET_UP, 503);
  const origin = new URL(req.url).origin;
  try {
    const session = await s.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: { currency: "usd", unit_amount: PRICE_CENTS,
                      product_data: { name: "Futbol Krillion Unlimited", description: "One-time unlock. No subscription." } },
      }],
      customer_creation: "always",                 // keeps the buyer's email on a Customer, for receipts and restores
      metadata: { product: PRODUCT },
      payment_intent_data: { metadata: { product: PRODUCT } },
      success_url: `${origin}/unlimited/unlocked?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    });
    return session.url ? json({ url: session.url }) : json(UNREACHABLE, 502);
  } catch {
    return json(UNREACHABLE, 502);
  }
}
