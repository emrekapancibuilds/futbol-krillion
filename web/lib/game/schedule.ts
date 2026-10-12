import { createHash } from 'node:crypto';
import type { Day } from './engine.ts';
const DAY_MS = 86_400_000;
/** Keep the original published schedule; continue using a frozen, versioned prompt pool.
 * SHA-256 ordering is stable on every instance and never uses a browser's local clock.
 */
export function extendSchedule(published: Day[], frozenPool: string[], now: Date): Day[] {
  if (!published.length || frozenPool.length < 7) return published;
  const last = published[published.length - 1];
  const count = Math.max(0, Math.floor((Date.parse(now.toISOString().slice(0,10)) - Date.parse(last.date)) / DAY_MS));
  const days = [...published];
  for (let offset = 1; offset <= count; offset++) {
    const date = new Date(Date.parse(last.date) + offset * DAY_MS).toISOString().slice(0,10);
    const ranked = frozenPool.map(id => ({ id, rank: createHash('sha256').update(`fk-daily-v1:${date}:${id}`).digest('hex') }))
      .sort((a,b) => a.rank.localeCompare(b.rank));
    days.push({ number: last.number + offset, date, prompts: ranked.slice(0,7).map(p => p.id) });
  }
  return days;
}
