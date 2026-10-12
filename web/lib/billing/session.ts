import 'server-only';
import { checked, db, rpc } from './db.ts';
import { clientIp, credential, hash, HttpError, rateKey, readCredential, sessionCookie, validCredential } from './security.ts';

export type Visitor = { id: string; hash: string; cookie?: string };
export async function rateLimit(scope: string, value: string, limit: number, seconds: number) {
  return rpc<boolean>('fk_rate_limit', { p_key: rateKey(scope, value), p_limit: limit, p_seconds: seconds });
}
export async function visitor(req: Request, create = true): Promise<Visitor | null> {
  const raw = readCredential(req);
  if (validCredential(raw)) {
    const digest = hash(raw);
    const row = await checked(db().from('fk_sessions').select('visitor_id,created_at')
      .eq('credential_hash', digest).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle());
    if (row) {
      if (create && Date.now() - Date.parse(row.created_at) > 30 * 86400000) {
        const token = credential();
        if (await rpc<boolean>('fk_rotate_session', { p_old_hash: digest, p_new_hash: hash(token) }))
          return { id: row.visitor_id, hash: hash(token), cookie: sessionCookie(token) };
        throw new HttpError(409, 'Your browser session was refreshed. Please try again.');
      }
      return { id: row.visitor_id, hash: digest };
    }
  }
  if (!create) return null;
  if (!await rateLimit('new-session', clientIp(req), 40, 3600)) throw new HttpError(429, 'Please try again later.');
  const token = credential();
  const id = await rpc<string>('fk_new_session', { p_hash: hash(token) });
  return { id, hash: hash(token), cookie: sessionCookie(token) };
}
