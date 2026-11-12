import { gameData } from '@/lib/game/server.ts';
import { json } from '@/lib/server/security.ts';
export const dynamic = 'force-dynamic';

/** Every previous daily, newest first. Free for everyone (owner, 2026-11-12). */
export function GET() {
  return json({ days: gameData().days.filter(d => d.date < new Date().toISOString().slice(0,10)).map(d => ({ number: d.number, date: d.date })).reverse() });
}
