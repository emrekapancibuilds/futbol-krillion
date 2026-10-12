import 'server-only';
import Stripe from 'stripe';
import { HttpError } from './security.ts';

export const APP = 'futbol-krillion';
export function billingMode() { return process.env.STRIPE_MODE === 'live'; }
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Unlimited purchases are being set up. Daily play is available.');
  if (billingMode() ? !key.startsWith('sk_live_') : !key.startsWith('sk_test_')) throw new Error('Stripe mode/key mismatch');
  return new Stripe(key, { apiVersion: '2026-09-30.endive', timeout: 10000, maxNetworkRetries: 1 });
}
export function priceId() {
  if (!process.env.STRIPE_PRICE_ID) throw new HttpError(503, 'Unlimited purchases are being set up. Daily play is available.');
  return process.env.STRIPE_PRICE_ID;
}
export function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id ?? null; }
export async function validatePrice() {
  const p = await stripe().prices.retrieve(priceId());
  if (!p.active || p.livemode !== billingMode() || p.currency !== 'usd' || p.unit_amount !== 499 ||
      p.type !== 'one_time' || p.recurring !== null)
    throw new Error('Configured Stripe price must be an active $4.99 USD one-time price in the configured mode');
}
