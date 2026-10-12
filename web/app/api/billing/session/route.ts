import { endpoint } from '@/lib/billing/http.ts';
import { status } from '@/lib/billing/service.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const GET = endpoint(async (_req, session, _body) => {
  return status(session.id);
});
