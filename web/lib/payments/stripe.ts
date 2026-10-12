// Server-only Stripe client. The secret key comes from STRIPE_SECRET_KEY (Futbol Krillion's own Stripe account);
// without it (or with a test key in production) the payment routes answer 503 and nobody can unlock.
import Stripe from "stripe";

import { stripeKey } from "./unlock.ts";

let client: Stripe | null | undefined;

export function stripe(): Stripe | null {
  if (client === undefined) {
    const key = stripeKey(process.env.STRIPE_SECRET_KEY, process.env.VERCEL_ENV);
    client = key ? new Stripe(key) : null;
  }
  return client;
}

export const NOT_SET_UP = { error: "Checkout isn't switched on yet. Try again soon." };
export const UNREACHABLE = { error: "Couldn't reach checkout. Try again in a moment." };
