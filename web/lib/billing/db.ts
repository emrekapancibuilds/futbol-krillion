import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { HttpError } from './security.ts';

export function db() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Subscriptions are being set up. Daily play is available.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000), cache: 'no-store' }) } });
}
export async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`Database operation failed: ${error.message}`);
  return data;
}
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return await checked(db().rpc(name, args)) as T;
}
export async function withLock<T>(key: string, fn: (owner: string) => Promise<T>): Promise<T> {
  const owner = randomUUID();
  if (!await rpc<boolean>('fk_acquire_lock', { p_key: key, p_owner: owner }))
    throw new HttpError(409, 'Another request is in progress. Please try again in a moment.');
  try { return await fn(owner); }
  finally { await rpc('fk_release_lock', { p_key: key, p_owner: owner }).catch(() => undefined); }
}
