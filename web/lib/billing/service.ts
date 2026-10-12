import 'server-only';
import type Stripe from 'stripe';
import { emailConfigured } from './email.ts';
import { checked, db, rpc, withLock } from './db.ts';
import { APP, billingMode, objectId, priceId, stripe, validatePrice } from './stripe.ts';
import { appUrl, HttpError, uuid } from './security.ts';
import { publicStatus, type Entitlement } from './policy.ts';
import type { Visitor } from './session.ts';

const iso = (seconds: number | null | undefined) => seconds ? new Date(seconds * 1000).toISOString() : null;
export const customerLock = (id: string) => `customer:${billingMode()}:${id}`;
export const configured = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.APP_SECURITY_SECRET);

type SyncOptions = { checkout?: string; session?: string; event?: Stripe.Event };
export async function syncCustomer(customerId: string, options: SyncOptions = {}) {
  return withLock(customerLock(customerId), async owner => {
    const api = stripe();
    const customer = await api.customers.retrieve(customerId);
    const existing = await checked(db().from('fk_customers').select('id').eq('id', customerId).eq('livemode', billingMode()).maybeSingle());
    if (!existing && !('metadata' in customer && customer.metadata.app === APP)) return false;
    const subscriptions: Record<string, unknown>[] = [];
    if (!customer.deleted) {
      for await (const subscription of api.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
        const item = subscription.items.data.find(i => i.price.id === priceId());
        if (!item || subscription.metadata.app !== APP || subscription.livemode !== billingMode()) continue;
        // A subscription period alone is not proof of payment. Failed renewals can
        // advance it. Only a paid invoice for our price extends paid-through access.
        let paidThrough = 0;
        const invoices = await api.invoices.list({ customer: customerId, subscription: subscription.id, status: 'paid', limit: 10 });
        for (const invoice of invoices.data) {
          const lines = invoice.lines.has_more ? await api.invoices.listLineItems(invoice.id, { limit: 100 }).autoPagingToArray({ limit: 1000 }) : invoice.lines.data;
          for (const line of lines) {
            if (line.pricing?.price_details?.price === priceId()) paidThrough = Math.max(paidThrough, line.period.end);
          }
        }
        subscriptions.push({ id: subscription.id, price_id: item.price.id, status: subscription.status,
          paid_through: iso(paidThrough), current_period_end: iso(item.current_period_end),
          cancel_at_period_end: subscription.cancel_at_period_end, cancel_at: iso(subscription.cancel_at) });
      }
    }
    await rpc('fk_sync_customer', { p_customer: customerId, p_livemode: billingMode(),
      p_email: customer.deleted ? null : customer.email?.trim().toLowerCase() ?? null, p_owner: owner,
      p_subscriptions: subscriptions, p_checkout: options.checkout ?? null, p_session: options.session ?? null,
      p_event: options.event?.id ?? null, p_event_type: options.event?.type ?? null });
    return true;
  });
}

export async function entitlements(visitorId: string, refresh = true): Promise<Entitlement[]> {
  const read = () => checked(db().from('fk_entitlements').select('*').eq('visitor_id', visitorId)
    .eq('livemode', billingMode()).eq('price_id', priceId()));
  let rows = await read() as Entitlement[];
  if (refresh) {
    const stale = [...new Set(rows.filter(s => Date.now() - Date.parse(s.synced_at) > 5 * 60000).map(s => s.customer_id))];
    // Fail closed on stale billing state if Stripe is unavailable. The free daily is independent.
    for (const customer of stale) await syncCustomer(customer);
    if (stale.length) rows = await read() as Entitlement[];
  }
  return rows;
}
export async function requirePremium(visitorId: string) {
  const status = publicStatus(await entitlements(visitorId));
  if (!status.premium) throw new HttpError(402, 'Upgrade to Unlimited to play practice puzzles and the archive.');
  return status;
}
export async function status(visitorId: string) {
  return { ...publicStatus(await entitlements(visitorId)), configured: configured(),
    restoreAvailable: emailConfigured() };
}

export async function confirmCheckout(visitorId: string, sessionId: unknown) {
  if (typeof sessionId !== 'string' || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) throw new HttpError(400, 'Invalid checkout.');
  const record = await checked(db().from('fk_checkouts').select('*').eq('stripe_session_id', sessionId)
    .eq('visitor_id', visitorId).eq('livemode', billingMode()).maybeSingle());
  if (!record) throw new HttpError(404, 'This checkout belongs to another browser. Use Restore Purchase.');
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.livemode !== billingMode() || objectId(session.customer) !== record.customer_id ||
      session.client_reference_id !== record.id || session.metadata?.checkout_id !== record.id || session.mode !== 'subscription')
    throw new HttpError(400, 'Checkout verification failed.');
  if (session.status === 'complete' && objectId(session.subscription))
    await syncCustomer(record.customer_id, { checkout: record.id, session: session.id });
  return status(visitorId);
}

export async function createCheckout(session: Visitor) {
  await validatePrice();
  return withLock(`checkout:${billingMode()}:${session.id}`, async () => {
    const current = await entitlements(session.id);
    // Also prevent another purchase while a subscription needs its payment method fixed.
    if (current.some(s => ['active','trialing','past_due','unpaid','paused','incomplete'].includes(s.status)))
      throw new HttpError(409, 'You already have a subscription. Use Manage Subscription.');
    const api = stripe();
    let record = await checked(db().from('fk_checkouts').select('*').eq('visitor_id', session.id)
      .eq('livemode', billingMode()).eq('state', 'pending').maybeSingle());
    if (record?.stripe_session_id) {
      const existing = await api.checkout.sessions.retrieve(record.stripe_session_id);
      if (existing.status === 'complete') {
        await syncCustomer(record.customer_id, { checkout: record.id, session: existing.id });
        throw new HttpError(409, 'Your purchase has completed. Refresh your subscription status.');
      }
      if (existing.status === 'open' && existing.url) return { url: existing.url };
      await checked(db().from('fk_checkouts').update({ state: 'expired' }).eq('id', record.id));
      record = null;
    }
    // A crash before saving the Stripe session reuses this record and its idempotency key.
    // Unknown outcomes older than Stripe's 24-hour key window need reconciliation,
    // rather than automatically creating a possibly duplicate subscription.
    if (record && Date.now() - Date.parse(record.created_at) > 23 * 3600000)
      throw new HttpError(409, 'A previous checkout needs verification. Please use Restore Purchase or contact support.');
    if (!record) {
      let customerId = current[0]?.customer_id;
      if (!customerId) {
        const customer = await api.customers.create({ metadata: { app: APP, visitor_id: session.id } },
          { idempotencyKey: `fk-customer-${billingMode()}-${session.id}` });
        customerId = customer.id;
        await checked(db().from('fk_customers').upsert({ id: customerId, livemode: billingMode() }, { onConflict: 'id' }));
      }
      // Read Stripe before opening a second subscription, including a webhook that is still pending.
      for await (const sub of api.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
        if (sub.items.data.some(i => i.price.id === priceId()) && ['active','trialing','past_due','unpaid','paused','incomplete'].includes(sub.status))
          throw new HttpError(409, 'A subscription already exists. Restore Purchase to manage it.');
      }
      record = await checked(db().from('fk_checkouts').insert({ visitor_id: session.id, customer_id: customerId, livemode: billingMode() }).select('*').single());
    }
    const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === 'true';
    const created = await api.checkout.sessions.create({ mode: 'subscription', customer: record.customer_id,
      // Keep standard Billing behavior even when the account defaults to Managed Payments.
      managed_payments: { enabled: false },
      client_reference_id: record.id, metadata: { app: APP, checkout_id: record.id },
      subscription_data: { billing_mode: { type: 'flexible' }, metadata: { app: APP, checkout_id: record.id } },
      line_items: [{ price: priceId(), quantity: 1 }], allowed_payment_method_types: ['card'],
      billing_address_collection: 'auto', customer_update: { address: 'auto', name: 'auto' },
      automatic_tax: { enabled: automaticTax },
      success_url: `${appUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/billing/cancel`,
      custom_text: { submit: { message: '$4.99 USD per month, renewing automatically until canceled. Cancel anytime in Manage Subscription; access continues through the paid period.' } },
    }, { idempotencyKey: `fk-checkout-${record.id}` });
    if (!created.url) throw new Error('Stripe did not return a checkout URL');
    await checked(db().from('fk_checkouts').update({ stripe_session_id: created.id, url: created.url, expires_at: iso(created.expires_at) }).eq('id', record.id));
    return { url: created.url };
  });
}

export async function portal(visitorId: string) {
  const rows = await entitlements(visitorId);
  if (!rows.length) throw new HttpError(403, 'Restore Purchase to verify subscription ownership.');
  const selected = rows.find(r => r.active) ?? rows[0];
  const ownership = await checked(db().from('fk_visitor_customers').select('customer_id').eq('visitor_id', visitorId).eq('customer_id', selected.customer_id).maybeSingle());
  if (!ownership) throw new HttpError(403, 'Restore Purchase to verify subscription ownership.');
  const result = await stripe().billingPortal.sessions.create({ customer: selected.customer_id, return_url: appUrl(),
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}) });
  return { url: result.url };
}

export const WEBHOOK_EVENTS = ['checkout.session.completed','checkout.session.async_payment_succeeded',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted',
  'invoice.paid','invoice.payment_failed','customer.updated'] as const;
export async function handleEvent(event: Stripe.Event) {
  if (event.livemode !== billingMode()) throw new HttpError(400, 'Stripe mode mismatch.');
  if (!WEBHOOK_EVENTS.includes(event.type as typeof WEBHOOK_EVENTS[number])) return;
  if (await checked(db().from('fk_webhook_events').select('id').eq('id', event.id).maybeSingle())) return;
  let customerId: string | null = null;
  let checkout: string | undefined, sessionId: string | undefined;
  if (event.type.startsWith('checkout.session.')) {
    // Never rely on event delivery order or its stale object snapshot.
    const session = await stripe().checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
    if (session.metadata?.app !== APP || session.mode !== 'subscription' || session.status !== 'complete') return;
    if (!uuid(session.metadata.checkout_id) || session.client_reference_id !== session.metadata.checkout_id) throw new Error('Invalid checkout binding');
    customerId = objectId(session.customer); checkout = session.metadata.checkout_id; sessionId = session.id;
  } else if (event.type === 'customer.updated') customerId = event.data.object.id;
  else customerId = objectId((event.data.object as Stripe.Subscription | Stripe.Invoice).customer);
  if (!customerId) throw new Error('Missing Stripe customer');
  await syncCustomer(customerId, { event, checkout, session: sessionId });
}
