// Unlimited is a one-time $4.99 purchase (user, 2026-10-12). There is no database: Stripe holds the purchase, and
// the buyer's device holds a signed unlock token that the server checks before every Unlimited round. A buyer on a
// new device restores by typing the email they paid with; the server finds the paid checkout in Stripe.
import { sign, verify } from "../game/tokens.ts";

export const PRODUCT = "unlimited";       // Checkout Session metadata.product
export const PRICE_CENTS = 499;           // USD

type UnlockPayload = { kind: "unlock"; ref: string };
type ChargeLike = { refunded?: boolean };
type PaymentLike = { latest_charge?: string | ChargeLike | null };
export type CheckoutLike = {
  id: string; status?: string | null; payment_status?: string | null; metadata?: Record<string, string> | null;
  payment_intent?: string | PaymentLike | null;      // expand "payment_intent.latest_charge" to see refunds
};

/** The token a paid checkout (`ref`: its Checkout Session id) earns. */
export function unlockToken(ref: string, secret: string): string {
  return sign({ kind: "unlock", ref } satisfies UnlockPayload, secret);
}

export function isUnlocked(token: unknown, secret: string): boolean {
  if (typeof token !== "string" || !token) return false;
  const t = verify<Partial<UnlockPayload>>(token, secret);
  return t?.kind === "unlock" && typeof t.ref === "string" && t.ref.length > 0;
}

/** A paid, complete Unlimited checkout that hasn't been fully refunded (a Checkout Session stays "paid" after a
 *  refund, so the refund is read from its expanded charge; see /refunds). */
export function isUnlimitedPurchase(s: CheckoutLike): boolean {
  const charge = typeof s.payment_intent === "object" ? s.payment_intent?.latest_charge : null;
  const refunded = typeof charge === "object" && charge?.refunded === true;
  return s.status === "complete" && s.payment_status === "paid" && s.metadata?.product === PRODUCT && !refunded;
}

/** The spellings to look an email up under: as typed (trimmed), then in lower case. Empty when it isn't an email. */
export function emailVariants(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [];
  return [...new Set([email, email.toLowerCase()])];
}

/** Restore: the first paid Unlimited checkout made with this email, if any. `list` returns an email's checkouts. */
export async function findPurchase(email: string, list: (email: string) => Promise<CheckoutLike[]>): Promise<CheckoutLike | null> {
  for (const e of emailVariants(email)) {
    const hit = (await list(e)).find(isUnlimitedPurchase);
    if (hit) return hit;
  }
  return null;
}

/** The Stripe key to use, or null. Production (`VERCEL_ENV`) never takes a test key: Stripe's public test cards would
 *  then unlock Unlimited for free. */
export function stripeKey(key: string | undefined, vercelEnv: string | undefined): string | null {
  if (!key) return null;
  if (vercelEnv === "production" && /^(sk|rk)_test_/.test(key)) return null;
  return key;
}

/** The Stripe Checkout Session for one Unlimited unlock. Standard Stripe payments: the account defaults to Managed
 *  Payments (Stripe as merchant of record), which needs a product tax code; that's off until it's set up on purpose. */
export function checkoutParams(origin: string) {
  return {
    mode: "payment" as const,
    managed_payments: { enabled: false },
    line_items: [{
      quantity: 1,
      price_data: { currency: "usd", unit_amount: PRICE_CENTS,
                    product_data: { name: "Futbol Krillion Unlimited", description: "One-time unlock. No subscription." } },
    }],
    customer_creation: "always" as const,       // keeps the buyer's email on a Customer, for receipts and restores
    metadata: { product: PRODUCT },
    payment_intent_data: { metadata: { product: PRODUCT } },
    success_url: `${origin}/unlimited/unlocked?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  };
}
