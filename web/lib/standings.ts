// "How you stack up" after a set of 7: a MOCK score distribution until real results are collected (user,
// 2026-10-11: "we can make it real in production"). Replace mockStandings with real counts when there is a backend.
//
// Shape: a few blank cards, then a symmetrical bell of totals, centered on the chart (a skew-normal with shape 0, so
// a plain normal). The user wanted it close to symmetrical (2026-10-11) and centered (2026-10-16).
//
// Calibration (user, 2026-10-16: "a bit stricter: 500 should be about the 95th percentile, and the curve centered"):
// the middle of the field is 300, 500 is the 95th percentile (300 + 1.645 x 121.6), 200 -> 20%, 400 -> 80%, and the
// 99th percentile starts near 583. The x axis runs 0..600 (twice the middle), so the peak sits in the middle of the
// chart; only a score past the axis stretches it. History: 1,260 was 95.8% on the old 10 ... 1,000 ladder, then 252 on
// the 5 ... 200 ladder (2026-10-14); that bell sat on the left of the chart. Each day stretches the bell sideways a
// little (DAY_STRETCH) so days differ without moving those marks far.

export type Standings = {
  players: number;      // field size, 10,000-20,000
  percentile: number;   // share of the field with a lower total, 0-99
  max: number;          // x axis: 0..max points
  curve: number[];      // relative number of players per bin across the axis
};

const BINS = 112;           // columns across the axis (56 looked too chunky: user, 2026-10-14)
const BLANK_SHARE = 0.03;   // players who scored nothing
const SKEW = 0;             // skew-normal shape: 0 is a perfect bell, higher leans right
const LOCATION = 300;       // the middle of the field and its spread, in points, for an average day
const SCALE = 121.6;
const DAY_STRETCH = 0.02;   // each day is this much wider or narrower than average, at most
const STEPS = 600;          // numeric integration steps over 0..TOP
const TOP = 1400;           // integrate over 0..TOP points (the tail beyond is negligible)

/** Same seed (a daily's number, or an Unlimited round type and set), same field. */
export function mockStandings(seed: string, score: number): Standings {
  const rand = mulberry32(hash(seed));
  const players = 10_000 + Math.floor(rand() * 10_001);
  const stretch = 1 + (rand() * 2 - 1) * DAY_STRETCH;   // an easier day shifts the whole bell right, a harder one left
  const density = (x: number) => skewNormal(x, LOCATION * stretch, SCALE * stretch, SKEW);

  // cumulative share of the (non-blank) field below x, by integration
  const dx = TOP / STEPS;
  const cum: number[] = [0];
  for (let i = 1; i <= STEPS; i++) cum.push(cum[i - 1] + density((i - 0.5) * dx) * dx);
  const total = cum[STEPS];
  const below = (x: number) => {
    const k = Math.max(0, Math.min(STEPS, x / dx));
    const i = Math.floor(k);
    const v = i >= STEPS ? cum[STEPS] : cum[i] + (cum[i + 1] - cum[i]) * (k - i);
    return v / total;
  };
  const share = score <= 0 ? 0 : BLANK_SHARE + (1 - BLANK_SHARE) * below(score);
  const percentile = Math.max(0, Math.min(99, Math.floor(share * 100)));

  const centered = Math.round((2 * LOCATION * stretch) / 50) * 50;                // the peak sits in the middle of the chart
  const max = Math.max(centered, Math.ceil((score * 1.12) / 50) * 50);
  const curve = Array.from({ length: BINS }, (_, i) => density(((i + 0.5) / BINS) * max));
  const peak = Math.max(...curve);
  return { players, percentile, max, curve: curve.map((v) => v / peak) };
}

/** Skew-normal density: location xi, scale omega, shape alpha. */
function skewNormal(x: number, xi: number, omega: number, alpha: number): number {
  const z = (x - xi) / omega;
  return (2 / omega) * (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * phi(alpha * z);
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
