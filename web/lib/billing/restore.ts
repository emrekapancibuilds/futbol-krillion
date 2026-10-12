import 'server-only';
import type Stripe from 'stripe';
import { checked, db, rpc } from './db.ts';
import { APP, billingMode, stripe } from './stripe.ts';
import { appUrl, clientIp, credential, hash, HttpError, normalizeEmail, sessionCookie, validCredential } from './security.ts';
import { rateLimit, type Visitor } from './session.ts';
import { status, syncCustomer } from './service.ts';
import { emailConfigured, sendVerification, verifiedEmail } from './email.ts';

export const RESTORE_MESSAGE = 'If this email can receive messages, a verification link will arrive shortly. Check your spam folder too.';
export async function requestRestore(req: Request, emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  if (!emailConfigured()) throw new HttpError(503, 'Purchase restoration is being set up. Please try again later.');
  const ipAllowed = await rateLimit('restore-ip', clientIp(req), 10, 3600);
  const emailAllowed = await rateLimit('restore-email', email, 3, 3600);
  if (!ipAllowed || !emailAllowed) return { message: RESTORE_MESSAGE };
  // Send the same message whether or not this address has purchased. No customer lookup
  // happens until Supabase verifies ownership. The request nonce alone grants no access.
  const token = credential();
  await checked(db().from('fk_recovery_tokens').insert({ token_hash: hash(token), email, livemode: billingMode() }));
  const link = `${appUrl()}/billing/restore?request=${token}`;
  try { await sendVerification(email, link); }
  catch (error) {
    await checked(db().from('fk_recovery_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', hash(token)));
    throw error;
  }
  return { message: RESTORE_MESSAGE };
}
export async function restore(req: Request, session: Visitor, raw: unknown, accessToken: unknown) {
  if (!await rateLimit('restore-verify', clientIp(req), 30, 3600)) throw new HttpError(429, 'Please try again later.');
  if (!validCredential(raw)) throw new HttpError(400, 'This verification link is invalid or expired. Request a new one.');
  const token = await checked(db().from('fk_recovery_tokens').select('email').eq('token_hash', hash(raw))
    .eq('livemode', billingMode()).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle());
  if (!token) throw new HttpError(400, 'This verification link is invalid or expired. Request a new one.');
  const email = await verifiedEmail(accessToken);
  if (email !== token.email) throw new HttpError(400, 'This verification link does not match the requested email. Request a new one.');
  const ids: string[] = [];
  const api = stripe();
  const candidates = new Map<string, Stripe.Customer | Stripe.DeletedCustomer>();
  const known = await checked(db().from('fk_customers').select('id').eq('email', token.email).eq('livemode', billingMode()));
  for (const row of known ?? []) candidates.set(row.id, await api.customers.retrieve(row.id));
  // Query the current Stripe email rather than a stale local billing email.
  for await (const customer of api.customers.list({ email: token.email, limit: 100 })) candidates.set(customer.id, customer);
  for (const customer of candidates.values()) {
    if (customer.deleted) continue;
    if (customer.email?.trim().toLowerCase() !== token.email || customer.livemode !== billingMode() || customer.metadata.app !== APP) continue;
    if (await syncCustomer(customer.id)) ids.push(customer.id);
  }
  const fresh = credential();
  const restored = await rpc<boolean>('fk_restore', { p_token_hash: hash(raw), p_email: token.email, p_livemode: billingMode(),
    p_old_hash: session.hash, p_new_hash: hash(fresh), p_customers: ids });
  if (!restored) throw new HttpError(400, 'This verification link has already been used or expired. Request a new one.');
  session.cookie = sessionCookie(fresh); session.hash = hash(fresh);
  return { ...await status(session.id), message: ids.length ? 'Welcome back! Your purchase is restored to this browser.' : 'Email verified. No Futbol Krillion subscription was found for this email.' };
}
