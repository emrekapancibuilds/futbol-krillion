import { endpoint } from '@/lib/billing/http.ts';
import { confirmCheckout } from '@/lib/billing/service.ts';
import { rateLimit } from '@/lib/billing/session.ts';
import { HttpError } from '@/lib/billing/security.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = endpoint(async (_req, session, body) => {
  if (!await rateLimit('checkout-confirm', session.id, 60, 3600)) throw new HttpError(429, 'Please try again later.');
  return confirmCheckout(session.id, body.sessionId);
});
