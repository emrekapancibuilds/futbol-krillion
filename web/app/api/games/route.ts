import { endpoint } from '@/lib/server/http.ts';
import { createGame } from '@/lib/game/modes.ts';
export const dynamic = 'force-dynamic';
export const POST = endpoint(async (_req, session, body) => createGame(session.id, body.mode, body.day));
