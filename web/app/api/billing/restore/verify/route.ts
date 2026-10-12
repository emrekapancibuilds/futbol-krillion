import { endpoint } from '@/lib/billing/http.ts';
import { restore } from '@/lib/billing/restore.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = endpoint(async (req, session, body) => {
  return restore(req, session, body.token, body.accessToken);
});
