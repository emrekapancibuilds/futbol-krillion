import { createHash, createHmac, randomBytes } from 'node:crypto';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const credential = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const validCredential = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{43}$/.test(value);
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
    throw new HttpError(400, 'Enter a valid email address.');
  return value.trim().toLowerCase();
}
export function appUrl(): string {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('HTTPS APP_URL required');
  return url.origin;
}
export function assertSameOrigin(req: Request) {
  if (req.headers.get('origin') !== appUrl()) throw new HttpError(403, 'Request origin not allowed.');
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Request origin not allowed.');
}
export async function readBody(req: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'JSON required.');
  if (Number(req.headers.get('content-length') ?? 0) > maxBytes) throw new HttpError(413, 'Request too large.');
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, 'Request too large.'); }
    chunks.push(part.value);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new HttpError(400, 'Invalid JSON.'); }
}
export function rateKey(scope: string, value: string) {
  const secret = process.env.APP_SECURITY_SECRET;
  if (!secret || secret.length < 32) throw new Error('APP_SECURITY_SECRET must have at least 32 characters');
  return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex');
}
export function clientIp(req: Request) {
  // Vercel overwrites this header; arbitrary X-Forwarded-For values are not trusted.
  return process.env.VERCEL ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown' : 'local';
}
export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === 'production';
  return `${secure ? '__Host-fk_session' : 'fk_session'}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000${secure ? '; Secure' : ''}`;
}
export function readCredential(req: Request) {
  const name = process.env.NODE_ENV === 'production' ? '__Host-fk_session' : 'fk_session';
  return req.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(`${name}=`))?.slice(name.length + 1);
}
export function json(value: unknown, status = 200, cookie?: string) {
  const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'Referrer-Policy': 'no-referrer' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return Response.json(value, { status, headers });
}
