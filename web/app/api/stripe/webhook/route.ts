import { stripe } from '@/lib/billing/stripe.ts';
import { handleEvent } from '@/lib/billing/service.ts';
import { HttpError, json } from '@/lib/billing/security.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook not configured' }, 503);
  if (!signature) return json({ error: 'Invalid signature' }, 400);
  if (Number(req.headers.get('content-length') ?? 0) > 1024 * 1024) return json({ error: 'Payload too large' }, 413);
  const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (!reader) return json({ error: 'Empty payload' }, 400);
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 1024 * 1024) { await reader.cancel(); return json({ error: 'Payload too large' }, 413); }
    chunks.push(part.value);
  }
  let event;
  try { event = stripe().webhooks.constructEvent(Buffer.concat(chunks), signature, secret); }
  catch { return json({ error: 'Invalid signature' }, 400); }
  try { await handleEvent(event); return json({ received: true }); }
  catch (error) {
    console.error('stripe_webhook_failed', { eventId: event.id, type: event.type });
    // Non-2xx requests Stripe retries. No event is marked processed before its DB commit.
    return json({ error: 'Webhook processing failed' }, error instanceof HttpError && error.status === 400 ? 400 : 503);
  }
}
