import { endpoint } from '@/lib/billing/http.ts';
import { createGame } from '@/lib/game/premium.ts';
export const dynamic = 'force-dynamic';
export const POST = endpoint(async (_req, session, body) => createGame(session.id, body.mode, body.day));
