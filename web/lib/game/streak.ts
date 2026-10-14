// The streak inside one set of 7 (user, 2026-10-13): every correct answer in a row after the first earns a bonus that
// grows by 10 each time: 10 for the 2nd, 20 for the 3rd ... 60 for the 7th. Any accepted answer counts, whatever its
// tier. A pass, or a round that ends on the timer (nothing accepted), breaks it; wrong guesses that don't end the
// round don't. Not to be confused with the daily streak (days played in a row) in lib/share.ts.

export const STREAK_STEP = 10;
export const SET_ROUNDS = 7;
/** What a perfect set of 7 earns on top of its points: 10 + 20 + 30 + 40 + 50 + 60. */
export const MAX_STREAK_BONUS = (STREAK_STEP * (SET_ROUNDS - 1) * SET_ROUNDS) / 2;

type Status = "accepted" | "missed" | "passed";

/** Bonus for the `n`th correct answer in a row (n = 1 is the first: no bonus yet). */
export const bonusForStreak = (n: number) => (n < 2 ? 0 : STREAK_STEP * (n - 1));

/** Correct answers in a row at the end of `results`. */
export function currentStreak(results: { status: Status }[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i].status === "accepted"; i--) n++;
  return n;
}

/** What finishing a round with `status` does to the streak: the new streak, its bonus, and how long the streak was
 *  if this round just broke it (0 when there was none to lose). */
export function scoreRound(before: { status: Status }[], status: Status) {
  const run = currentStreak(before);
  const streak = status === "accepted" ? run + 1 : 0;
  return { streak, bonus: bonusForStreak(streak), lost: status === "accepted" ? 0 : run };
}

/** A round's score: its points plus its streak bonus (rounds saved before streaks existed have none). */
export const roundScore = (r: { points: number; bonus?: number }) => r.points + (r.bonus ?? 0);
