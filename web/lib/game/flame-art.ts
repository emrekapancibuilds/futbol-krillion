// The streak flame as pixel art (components/Streak.tsx draws it). 12 x 16, with one empty column on each side: the
// art must never touch the left or right edge, or the SVG's own clipping makes the flame look cut off.
// r = red outer flame, o = orange, y = yellow core.
export const FLAME = [
  "......r.....",
  ".....rr.....",
  ".....rrr....",
  "....rrrr....",
  "....rroor...",
  "...rrooor...",
  "...rrooyor..",
  "..rrooyyor..",
  "..rrooyyor..",
  ".rrooyyoorr.",
  ".rrooyyoorr.",
  ".rrooyyoorr.",
  "..rroyyorr..",
  "..rroooorr..",
  "...rroorr...",
  "....rrrr....",
];
