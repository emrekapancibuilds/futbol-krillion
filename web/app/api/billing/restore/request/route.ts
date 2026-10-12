import { endpoint } from '@/lib/billing/http.ts';
import { requestRestore } from '@/lib/billing/restore.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = endpoint(async (req, _session, body) => {
  return requestRestore(req, body.email);
});
