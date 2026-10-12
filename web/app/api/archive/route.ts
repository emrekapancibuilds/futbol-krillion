import { endpoint } from '@/lib/billing/http.ts';
import { requirePremium } from '@/lib/billing/service.ts';
import { gameData } from '@/lib/game/server.ts';
export const dynamic = 'force-dynamic';
export const GET = endpoint(async (_req, session) => {
  await requirePremium(session.id);
  return { days: gameData().days.filter(d => d.date < new Date().toISOString().slice(0,10)).map(d => ({ number: d.number, date: d.date })).reverse() };
});
