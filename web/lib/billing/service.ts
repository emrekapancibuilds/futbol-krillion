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
    const purchases: Record<string, unknown>[] = [];
    if (!customer.deleted) {
      for await (const session of api.checkout.sessions.list({ customer: customerId, status: 'complete', limit: 100 })) {
        if (session.mode !== 'payment' || session.metadata?.app !== APP || session.livemode !== billingMode()) continue;
        const lines = await api.checkout.sessions.listLineItems(session.id, { limit: 100 });
        const line = lines.data[0];
        // A complete session alone is not proof of payment. Verify exactly our product,
        // its amount, the PaymentIntent and its captured charge before granting access.
        if (lines.has_more || lines.data.length !== 1 || line.price?.id !== priceId() || line.quantity !== 1 ||
            line.amount_subtotal !== 499 || line.currency !== 'usd' || line.amount_discount !== 0) continue;
        const intentId = objectId(session.payment_intent);
        if (!intentId) continue;
        const intent = await api.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
        if (intent.livemode !== billingMode() || objectId(intent.customer) !== customerId || intent.currency !== 'usd') continue;
        const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
        let state = 'unpaid';
        if (session.payment_status === 'paid' && intent.status === 'succeeded' && intent.amount_received === session.amount_total &&
            intent.amount_received >= 499 && charge?.paid && charge.captured && charge.amount_captured === intent.amount_received) {
          state = charge.refunded ? 'refunded' : 'paid';
          if (!charge.refunded && charge.disputed) {
            const disputes = await api.disputes.list({ charge: charge.id, limit: 100 });
            if (!disputes.data.length || disputes.has_more || disputes.data.some(d => !['won', 'warning_closed'].includes(d.status))) state = 'disputed';
          }
        }
        purchases.push({ id: session.id, price_id: priceId(), payment_intent_id: intentId,
          status: state, purchased_at: iso(session.created) });
      }
    }
    await rpc('fk_sync_purchases', { p_customer: customerId, p_livemode: billingMode(),
      p_email: customer.deleted ? null : customer.email?.trim().toLowerCase() ?? null, p_owner: owner,
      p_purchases: purchases, p_checkout: options.checkout ?? null, p_session: options.session ?? null,
      p_event: options.event?.id ?? null, p_event_type: options.event?.type ?? null });
    return true;
  });
}

export async function entitlements(visitorId: string, refresh = true): Promise<Entitlement[]> {
  const read = () => checked(db().from('fk_purchase_entitlements').select('*').eq('visitor_id', visitorId)
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
      session.client_reference_id !== record.id || session.metadata?.app !== APP || session.metadata?.checkout_id !== record.id || session.mode !== 'payment')
    throw new HttpError(400, 'Checkout verification failed.');
  if (session.status === 'complete' && objectId(session.payment_intent))
    await syncCustomer(record.customer_id, { checkout: record.id, session: session.id });
  return status(visitorId);
}

export async function createCheckout(session: Visitor) {
  await validatePrice();
  return withLock(`checkout:${billingMode()}:${session.id}`, async () => {
    const current = await entitlements(session.id);
    if (publicStatus(current).premium)
      throw new HttpError(409, 'You already have Unlimited. Refresh your purchase status.');
    const api = stripe();
    let record = await checked(db().from('fk_checkouts').select('*').eq('visitor_id', session.id)
      .eq('livemode', billingMode()).eq('state', 'pending').maybeSingle());
    if (record?.stripe_session_id) {
      const existing = await api.checkout.sessions.retrieve(record.stripe_session_id);
      if (existing.status === 'complete' && existing.mode === 'payment') {
        await syncCustomer(record.customer_id, { checkout: record.id, session: existing.id });
        throw new HttpError(409, 'Your purchase has completed. Refresh your purchase status.');
      }
      if (existing.status === 'open' && existing.mode === 'payment' && existing.metadata?.price_id === priceId() && existing.url) return { url: existing.url };
      if (existing.status === 'open') await api.checkout.sessions.expire(existing.id);
      await checked(db().from('fk_checkouts').update({ state: 'expired' }).eq('id', record.id));
      record = null;
    }
    // A crash before saving the Stripe session reuses this record and its idempotency key.
    // Unknown outcomes older than Stripe's 24-hour key window need reconciliation,
    // rather than automatically creating a possibly duplicate purchase.
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
      // Reconcile a payment whose webhook or browser redirect has not arrived yet.
      await syncCustomer(customerId);
      const existingPurchases = await checked(db().from('fk_purchases').select('id').eq('customer_id', customerId)
        .eq('livemode', billingMode()).eq('price_id', priceId()).eq('status', 'paid'));
      if (existingPurchases?.length) throw new HttpError(409, 'A purchase already exists. Use Restore Purchase.');
      record = await checked(db().from('fk_checkouts').insert({ visitor_id: session.id, customer_id: customerId, livemode: billingMode() }).select('*').single());
    }
    const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === 'true';
    const created = await api.checkout.sessions.create({ mode: 'payment', customer: record.customer_id,
      // Keep standard Checkout behavior even when the account defaults to Managed Payments.
      managed_payments: { enabled: false },
      client_reference_id: record.id, metadata: { app: APP, checkout_id: record.id, price_id: priceId() },
      payment_intent_data: { metadata: { app: APP, checkout_id: record.id } },
      line_items: [{ price: priceId(), quantity: 1 }], allowed_payment_method_types: ['card'],
      billing_address_collection: 'auto', customer_update: { address: 'auto', name: 'auto' },
      automatic_tax: { enabled: automaticTax },
      success_url: `${appUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/billing/cancel`,
      custom_text: { submit: { message: '$4.99 USD once for Unlimited practice and the daily archive. No recurring charges. Restore on another device using your payment email.' } },
    }, { idempotencyKey: `fk-checkout-${record.id}` });
    if (!created.url) throw new Error('Stripe did not return a checkout URL');
    await checked(db().from('fk_checkouts').update({ stripe_session_id: created.id, url: created.url, expires_at: iso(created.expires_at) }).eq('id', record.id));
    return { url: created.url };
  });
}

export async function portal(visitorId: string) {
  const rows = await entitlements(visitorId);
  if (!rows.length) throw new HttpError(403, 'Restore Purchase to verify purchase ownership.');
  const selected = rows.find(r => r.active) ?? rows[0];
  const ownership = await checked(db().from('fk_visitor_customers').select('customer_id').eq('visitor_id', visitorId).eq('customer_id', selected.customer_id).maybeSingle());
  if (!ownership) throw new HttpError(403, 'Restore Purchase to verify purchase ownership.');
  const intent = await stripe().paymentIntents.retrieve(selected.payment_intent_id, { expand: ['latest_charge'] });
  if (objectId(intent.customer) !== selected.customer_id || intent.livemode !== billingMode()) throw new Error('Receipt ownership mismatch');
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
  if (!charge?.receipt_url) throw new HttpError(404, 'Your receipt is not available yet.');
  return { url: charge.receipt_url };
}

export const WEBHOOK_EVENTS = ['checkout.session.completed','checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed','charge.refunded','charge.dispute.created','charge.dispute.updated',
  'charge.dispute.closed','customer.updated'] as const;
export async function handleEvent(event: Stripe.Event) {
  if (event.livemode !== billingMode()) throw new HttpError(400, 'Stripe mode mismatch.');
  if (!WEBHOOK_EVENTS.includes(event.type as typeof WEBHOOK_EVENTS[number])) return;
  if (await checked(db().from('fk_webhook_events').select('id').eq('id', event.id).maybeSingle())) return;
  let customerId: string | null = null;
  let checkout: string | undefined, sessionId: string | undefined;
  if (event.type.startsWith('checkout.session.')) {
    // Never rely on event delivery order or its stale object snapshot.
    const session = await stripe().checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
    if (session.metadata?.app !== APP || session.mode !== 'payment' || session.status !== 'complete') return;
    if (!uuid(session.metadata.checkout_id) || session.client_reference_id !== session.metadata.checkout_id) throw new Error('Invalid checkout binding');
    customerId = objectId(session.customer); checkout = session.metadata.checkout_id; sessionId = session.id;
  } else if (event.type === 'customer.updated') customerId = event.data.object.id;
  else if (event.type.startsWith('charge.dispute.')) {
    const dispute = await stripe().disputes.retrieve((event.data.object as Stripe.Dispute).id);
    const intentId = objectId(dispute.payment_intent);
    if (!intentId) return;
    customerId = objectId((await stripe().paymentIntents.retrieve(intentId)).customer);
  } else customerId = objectId((event.data.object as Stripe.Charge).customer);
  if (!customerId) throw new Error('Missing Stripe customer');
  await syncCustomer(customerId, { event, checkout, session: sessionId });
}
