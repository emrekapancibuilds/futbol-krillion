/** Time left as HH:MM:SS, e.g. until the next daily. Never below zero. */
export function countdown(ms: number): string {
  const left = Math.max(0, ms);
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return `${pad(left / 3_600_000)}:${pad((left % 3_600_000) / 60_000)}:${pad((left % 60_000) / 1000)}`;
}
