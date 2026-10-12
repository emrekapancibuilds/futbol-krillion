import 'server-only';
import { createHmac, randomInt } from 'node:crypto';
import { checked, db, withLock } from '../billing/db.ts';
import { requirePremium } from '../billing/service.ts';
import { visitor } from '../billing/session.ts';
import { HttpError, uuid } from '../billing/security.ts';
import { gameData, gameSecret, promptIds, snapshotDate } from './server.ts';
import { dayFor, type Day, type GameData } from './engine.ts';

export function selectPractice(pool: string[], recent: string[], count = 7) {
  const fresh = pool.filter(p => !recent.includes(p));
  const options = fresh.length >= count ? fresh : [...new Set([...fresh, ...pool])];
  if (options.length < count) throw new Error('Not enough prompts');
  const result: string[] = [];
  while (result.length < count) result.push(options.splice(randomInt(options.length), 1)[0]);
  return result;
}
export async function createGame(visitorId: string, mode: unknown, day: unknown) {
  await requirePremium(visitorId);
  return withLock(`game:${visitorId}`, async () => {
    const data = gameData();
    let selection: Day;
    if (mode === 'archive') {
      const selected = data.days.find(d => d.number === day && d.date < new Date().toISOString().slice(0, 10));
      if (!selected) throw new HttpError(404, 'This daily puzzle is not in the archive yet.');
      selection = selected;
    } else if (mode === 'practice') {
      const recent = await checked(db().from('fk_games').select('prompts').eq('visitor_id', visitorId).order('created_at', { ascending: false }).limit(5));
      selection = { number: 0, date: new Date().toISOString().slice(0,10), prompts: selectPractice(promptIds(),
        [...(recent ?? []).flatMap(r => r.prompts as string[]), ...(dayFor(data, new Date())?.prompts ?? [])]) };
    } else throw new HttpError(400, 'Unknown game mode.');
    const row = await checked(db().from('fk_games').insert({ visitor_id: visitorId, mode, day_number: selection.number, prompts: selection.prompts }).select('id').single());
    return { number: selection.number, date: selection.date, rounds: 7, nextAt: new Date(Date.now()+86400000).toISOString(),
      snapshot: snapshotDate(), gameId: row!.id, mode };
  });
}
export async function roundContext(req: Request, body: Record<string, unknown>): Promise<{ data: GameData; secret: string }> {
  if (typeof body.prompt === 'string') {
    if (body.gameId != null || body.day != null || body.round != null) throw new HttpError(400, 'Ambiguous round.');
    return unlimitedContext(req);
  }
  if (body.gameId === undefined || body.gameId === null) return { data: gameData(), secret: gameSecret() };
  if (!uuid(body.gameId)) throw new HttpError(400, 'Invalid game.');
  const session = await visitor(req, false);
  if (!session) throw new HttpError(402, 'Restore Purchase or upgrade to Unlimited.');
  await requirePremium(session.id);
  const row = await checked(db().from('fk_games').select('*').eq('id', body.gameId).eq('visitor_id', session.id).maybeSingle());
  if (!row || row.day_number !== body.day) throw new HttpError(404, 'Game not found in this browser.');
  const data = gameData();
  return { data: { ...data, days: [{ number: row.day_number, date: '', prompts: row.prompts }] },
    secret: createHmac('sha256', gameSecret()).update(`premium:${session.id}:${row.id}`).digest('hex') };
}

/** Every prompt-based operation verifies current access and signs for this browser owner. */
export async function unlimitedContext(req: Request) {
  const session = await visitor(req, false);
  if (!session) throw new HttpError(402, 'Restore Purchase or upgrade to Unlimited.');
  await requirePremium(session.id);
  return { data: gameData(), secret: createHmac('sha256', gameSecret()).update(`unlimited:${session.id}`).digest('hex') };
}
