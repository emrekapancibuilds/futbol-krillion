export type DayInfo = { number: number; date: string; rounds: number; nextAt: string; snapshot: string;
  mode?: 'daily' | 'practice' | 'archive'; gameId?: string };
export const gameLabel = (day: DayInfo) => day.mode === 'practice' ? 'Practice' : `${day.mode === 'archive' ? 'Archive' : 'Daily'} #${day.number}`;
export const progressKey = (day: DayInfo) => day.gameId ? `fk:game:${day.gameId}` : `fk:day:${day.number}`;
