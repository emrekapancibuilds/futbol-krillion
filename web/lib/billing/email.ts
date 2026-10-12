import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { HttpError, normalizeEmail } from './security.ts';

export const emailConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
function auth() {
  if (!emailConfigured()) throw new HttpError(503, 'Email verification is being set up. Please try again later.');
  // A separate, non-persistent public client prevents an Auth session from replacing
  // the service-role database client's authorization. Never persist refresh tokens.
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000), cache: 'no-store' }) },
  }).auth;
}

export async function sendVerification(email: string, redirectTo: string) {
  const { error } = await auth().signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: redirectTo } });
  if (error) {
    console.error('verification_email_failed', { code: error.code });
    throw new HttpError(503, 'Email delivery is temporarily unavailable. Please try again later.');
  }
}

export async function verifiedEmail(accessToken: unknown) {
  if (typeof accessToken !== 'string' || accessToken.length > 6000 || accessToken.split('.').length !== 3)
    throw new HttpError(400, 'This verification link is invalid or expired. Request a new one.');
  // getUser verifies the bearer token with Supabase. Never authorize from client
  // session objects, decoded JWT claims, or editable user_metadata.
  const { data, error } = await auth().getUser(accessToken);
  if (error || !data.user?.email || !data.user.email_confirmed_at)
    throw new HttpError(400, 'This verification link is invalid or expired. Request a new one.');
  return normalizeEmail(data.user.email);
}
