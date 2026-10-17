// Tunnel 3.0 surfaces (spec: docs/superpowers/specs/2026-10-17-scene-2-design.md): the walls, floor and ceiling of the
// reveal tunnel as textures, baked once when a run starts and sampled per pixel by components/TunnelReveal.tsx.
// Weathered, not pristine: plaster fallen away in patches to show the brick behind, cracks, water stains running down
// from the top, grime near the floor, chipped paint on the lower band, rubble and puddles on the floor, damp patches
// and a sagging cable on the ceiling. Hung on the walls: jerseys in both kits (and the referee's and a keeper's),
// framed team photos, posters, scarves, lit exit signs, fire extinguishers, and a pipe with rusty brackets.
// Everything comes from fixed seeds, so every run looks the same. Units are tunnel units (the tunnel is 2 wide);
// z runs down the tunnel, y down the wall from its centre line.

export type Rgb = [number, number, number];
export const TPU = 40;                   // texels per tunnel unit
export const F_DECAL = 1;                // something hung on the wall: drawn over the steel ribs
export const F_EMISSIVE = 2;             // lights itself (exit signs)
export const F_PATCH = 4;                // bare brick where the plaster fell: no panel seams over it
export const F_PUDDLE = 8;               // standing water on the floor: catches the strip light
export const F_RUBBLE = 16;

export type Surface = { cols: number; rows: number; rgb: Uint32Array; flags: Uint8Array };
export type Surfaces = { walls: [Surface, Surface]; floor: Surface; ceiling: Surface };
export type DecalKind = "jersey" | "frame" | "poster" | "scarf" | "exit" | "extinguisher" | "pipe";
export type Team = "A" | "B" | "REF" | "GK";
export type Decal = { kind: DecalKind; z: number; y: number; team: Team; v: number };
/** Half the width of each kind of decal along the tunnel. */
export const DECAL_HALF: Record<DecalKind, number> = {
  jersey: 0.24, frame: 0.22, poster: 0.15, scarf: 0.29, exit: 0.12, extinguisher: 0.07, pipe: 0,
};

const RIB = 0.75;                        // the steel ribs' spacing (TunnelReveal draws them)
const BLACK: Rgb = [0, 0, 0];
const CONCRETE: Rgb = [62, 68, 90];
const FLOOR: Rgb = [38, 40, 54];
const CEILING: Rgb = [20, 22, 32];
const BRICK: Rgb = [112, 58, 44];
const MORTAR: Rgb = [58, 56, 62];
const STAIN: Rgb = [34, 40, 30];
const RUST: Rgb = [122, 66, 32];
const KITS: Record<Team, { shirt: Rgb; alt: Rgb }> = {
  A: { shirt: [104, 174, 232], alt: [238, 242, 250] },
  B: { shirt: [210, 58, 70], alt: [31, 106, 58] },
  REF: { shirt: [198, 220, 48], alt: [28, 33, 50] },
  GK: { shirt: [232, 128, 40], alt: [24, 26, 34] },
};
const POSTERS: Rgb[] = [[38, 52, 104], [150, 40, 40], [196, 148, 50], [28, 110, 110]];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseGrid(seed: number): Float32Array {
  const r = mulberry32(seed);
  const g = new Float32Array(65536);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return g;
}

/** Smooth value noise in 0..1. */
function vnoise(g: Float32Array, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pack = (r: number, g: number, b: number) =>
  (0xff000000 | (clampByte(b) << 16) | (clampByte(g) << 8) | clampByte(r)) >>> 0;
const clampByte = (v: number) => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

/** What hangs on one wall: one thing (or nothing) between each pair of ribs, and on the right wall an exit sign just
 *  before every gate; along the top of the left wall, a pipe. */
export function placeDecals(side: 0 | 1, length: number, hh: number, gap: number): Decal[] {
  const rnd = mulberry32(side ? 9187 : 4242);
  const out: Decal[] = [];
  for (let z = RIB * 1.5; z < length - 0.3; z += RIB) {
    const r = rnd(), t = rnd(), v = rnd();
    const toGate = Math.abs(z - Math.round(z / gap) * gap);
    const beforeGate = z % gap > gap / 2 && toGate < 0.5;
    let kind: DecalKind | null =
      side === 1 && beforeGate ? "exit"
        : r < 0.36 ? "jersey" : r < 0.5 ? "frame" : r < 0.64 ? "poster" : r < 0.74 ? "scarf"
          : r < 0.82 ? "extinguisher" : r < 0.86 ? "exit" : null;
    if (kind && toGate < DECAL_HALF[kind] + 0.06) kind = null;
    if (!kind) continue;
    const team: Team = kind === "jersey" ? (t < 0.42 ? "A" : t < 0.84 ? "B" : t < 0.93 ? "REF" : "GK") : t < 0.5 ? "A" : "B";
    const y = { jersey: -0.06, frame: -0.3, poster: -0.2, scarf: -0.36, exit: -hh * 0.6, extinguisher: hh - 0.19, pipe: 0 }[kind];
    out.push({ kind, z, y, team, v });
  }
  if (side === 0) out.push({ kind: "pipe", z: 0, y: -hh + 0.045, team: "A", v: 0 });
  return out;
}

type Ctx = { tex: Surface; hh: number; side: 0 | 1 };

/** Paint one decal into a wall texture, texel by texel over its bounding box. */
function paintDecal(ctx: Ctx, d: Decal, length: number) {
  const { tex, hh, side } = ctx;
  const put = (c: number, r: number, col: Rgb, flags = F_DECAL) => {
    const i = r * tex.cols + c;
    tex.rgb[i] = pack(col[0], col[1], col[2]);
    tex.flags[i] = (tex.flags[i] & ~F_PATCH) | flags;
  };
  const box = (z0: number, z1: number, y0: number, y1: number, f: (lz: number, ly: number, c: number, r: number) => void) => {
    const c0 = Math.max(0, Math.floor(z0 * TPU)), c1 = Math.min(tex.cols, Math.ceil(z1 * TPU));
    const r0 = Math.max(0, Math.floor((y0 + hh) * TPU)), r1 = Math.min(tex.rows, Math.ceil((y1 + hh) * TPU));
    for (let r = r0; r < r1; r++) {
      const ly = -hh + (r + 0.5) / TPU - d.y;
      for (let c = c0; c < c1; c++) {
        const lz = ((c + 0.5) / TPU - d.z) * (side ? -1 : 1);          // as seen from inside the tunnel
        f(lz, ly, c, r);
      }
    }
  };
  const kit = KITS[d.team];
  const H = DECAL_HALF[d.kind];
  switch (d.kind) {
    case "jersey":
      box(d.z - H, d.z + H, d.y - 0.22, d.y + 0.24, (lz, ly, c, r) => {
        const a = Math.abs(lz);
        if (a < 0.0125 && ly >= -0.215 && ly < -0.15) return put(c, r, [70, 72, 80]);       // the hook
        if (ly >= -0.165 && ly < -0.145 && a < 0.13) return put(c, r, [96, 72, 48]);         // the hanger
        const top = -0.15 + Math.max(0, a - 0.06) * 0.45;
        const body = a <= 0.14 && ly >= top && ly <= 0.22;
        const sleeve = a > 0.14 && a <= 0.235 && ly >= top && ly <= top + 0.1;
        if (!body && !sleeve) return;
        const vee = a < 0.055 && ly < -0.15 + 0.075 - a * 1.3;
        if (vee) return;
        const trim = (a < 0.075 && ly < -0.15 + 0.1 - a * 1.3) || a > 0.205 || (sleeve && ly > top + 0.08);
        const shade = 0.8 + 0.25 * Math.cos((lz / 0.25) * Math.PI / 2) + (ly > 0.2 ? -0.15 : 0) + 0.06 * Math.sin(lz * 70) * (ly > 0 ? 1 : 0);
        put(c, r, scale(trim ? kit.alt : kit.shirt, shade));
      });
      break;
    case "frame":
      box(d.z - H, d.z + H, d.y - 0.15, d.y + 0.15, (lz, ly, c, r) => {
        const a = Math.abs(lz);
        if (a > 0.19 || Math.abs(ly) > 0.12) {
          const lit = lz < 0 || ly < -0.12 ? 1.1 : 0.75;
          return put(c, r, scale([170, 132, 60], lit * (a > 0.21 || Math.abs(ly) > 0.14 ? 0.6 : 1)));
        }
        let col: Rgb = ly < 0.03 ? [44, 58, 96] : [40, 96, 52];
        for (const row of [-0.035, 0.045]) {                                // two rows of a team, lined up
          const k = Math.round((lz + 0.15) / 0.06);
          if (Math.abs(lz + 0.15 - k * 0.06) < 0.016 && k >= 0 && k <= 5) {
            if (ly >= row - 0.04 && ly < row - 0.018) col = [214, 168, 130];
            else if (ly >= row - 0.018 && ly < row + 0.03) col = kit.shirt;
          }
        }
        if (lz + ly > 0.04 && lz + ly < 0.075) col = mix(col, [255, 255, 255], 0.3);     // glare on the glass
        put(c, r, col);
      });
      break;
    case "poster": {
      const bg = POSTERS[Math.floor(d.v * POSTERS.length) % POSTERS.length];
      box(d.z - H, d.z + H, d.y - 0.21, d.y + 0.21, (lz, ly, c, r) => {
        if (lz > 0.07 && ly > 0.13 && (lz - 0.07) + (ly - 0.13) > 0.05) return;        // a torn corner
        let col: Rgb = Math.abs(lz) > 0.135 || Math.abs(ly) > 0.195 ? mix(bg, [255, 255, 255], 0.25) : bg;
        const bx = lz, by = ly + 0.08;
        if (bx * bx + by * by < 0.0064) {                                               // a football
          const patch = Math.abs(bx) < 0.025 && Math.abs(by) < 0.025 || (bx + 0.05) ** 2 + (by + 0.02) ** 2 < 0.0003;
          col = patch ? [30, 32, 40] : [236, 236, 228];
        }
        for (const [k, yy] of [[0, 0.04], [1, 0.085], [2, 0.13]]) {                   // lines of (unreadable) print
          if (Math.abs(ly - yy) < 0.012 && Math.abs(lz) < 0.11 - k * 0.025) col = [232, 222, 200];
        }
        put(c, r, scale(col, 0.92 + 0.12 * (lz < 0 ? 1 : 0) - (ly > 0.15 ? 0.12 : 0)));
      });
      break;
    }
    case "scarf":
      box(d.z - H, d.z + H, d.y - 0.06, d.y + 0.2, (lz, ly, c, r) => {
        const sag = 0.06 * Math.sin((Math.PI * (lz + 0.28)) / 0.56);
        const a = Math.abs(lz);
        if (a <= 0.28 && Math.abs(ly - sag) < 0.03) {
          const stripe = Math.floor((lz + 0.28) / 0.05) % 2 === 1;
          const edge = Math.abs(ly - sag) > 0.02;
          return put(c, r, scale(stripe ? kit.alt : kit.shirt, edge ? 0.7 : 1));
        }
        if (a > 0.25 && a <= 0.28 && ly > sag && ly < sag + 0.11 && c % 2 === 0) put(c, r, scale(kit.shirt, 0.75));   // fringe
        if (a > 0.265 && a <= 0.28 && ly < sag - 0.02 && ly > sag - 0.045) put(c, r, [60, 62, 70]);                    // pins
      });
      break;
    case "exit":
      box(d.z - H, d.z + H, d.y - 0.05, d.y + 0.05, (lz, ly, c, r) => {
        let col: Rgb = Math.abs(lz) > 0.105 || Math.abs(ly) > 0.035 ? [12, 70, 40] : [28, 150, 84];
        const W: Rgb = [235, 255, 240];
        const fig = (Math.abs(lz + 0.06) < 0.013 && Math.abs(ly + 0.018) < 0.013)               // head
          || (Math.abs(lz + 0.055) < 0.012 && ly > -0.005 && ly < 0.02)                          // body
          || (Math.abs(lz + 0.04 + (ly - 0.02) * 0.6) < 0.01 && ly >= 0.02 && ly < 0.035)        // legs, running
          || (Math.abs(lz + 0.075 - (ly - 0.02) * 0.6) < 0.01 && ly >= 0.02 && ly < 0.035);
        const arrow = (lz > 0.0 && lz < 0.07 && Math.abs(ly) < 0.008) || (lz >= 0.05 && lz < 0.085 && Math.abs(ly) < 0.085 - lz);
        if (fig || arrow) col = W;
        put(c, r, col, F_DECAL | F_EMISSIVE);
      });
      break;
    case "extinguisher":
      box(d.z - 0.08, d.z + 0.08, d.y - 0.32, d.y + 0.17, (lz, ly, c, r) => {
        const a = Math.abs(lz);
        if (ly < -0.2) {                                                                       // its sign above
          if (a < 0.04 && ly > -0.3 && ly < -0.22) put(c, r, a < 0.012 && ly > -0.275 && ly < -0.245 ? [240, 236, 230] : [186, 30, 30]);
          return;
        }
        if (ly >= -0.15 && ly < -0.12 && a < 0.03) return put(c, r, [24, 24, 28]);           // the head
        if (lz > 0.035 && lz < 0.065 && ly >= -0.14 && ly < 0.03) return put(c, r, [20, 20, 24]);   // the hose
        if (a < 0.045 && ly >= -0.12 && ly <= 0.16) {
          const shade = 0.55 + 0.5 * Math.cos((lz / 0.045) * Math.PI / 2 + 0.35);
          const label = ly > 0.0 && ly < 0.05;
          put(c, r, scale(label ? [220, 210, 190] : ly > 0.14 ? [120, 24, 24] : [190, 40, 36], shade));
        }
      });
      break;
    case "pipe": {
      const pipes = hh > 1 ? [[d.y, 0.028], [d.y + 0.085, 0.034]] : [[d.y, 0.028]];
      for (const [py, pr] of pipes) {
        box(0, length, py - pr - 0.02, py + 0.6, (lz, ly, c, r) => {
          const z = (c + 0.5) / TPU;
          const rib = Math.abs(z - Math.round(z / RIB) * RIB);
          const ry = ly - (py - d.y);
          if (Math.abs(ry) <= pr + (rib < 0.02 ? 0.012 : 0)) {
            if (rib < 0.02) return put(c, r, [30, 32, 36]);                                  // a bracket
            return put(c, r, scale([84, 96, 90], 0.55 + 0.5 * Math.cos(((ry + pr * 0.4) / pr) * Math.PI / 2)));
          }
          const k = Math.round(z / RIB);
          if (ry > pr && rib < 0.012 && hash2(k, side + 7) < 0.55) {                          // rust running down from it
            const len = 0.18 + 0.4 * hash2(k, 99);
            if (ry - pr < len) {
              const i = r * tex.cols + c;
              const base: Rgb = [tex.rgb[i] & 255, (tex.rgb[i] >>> 8) & 255, (tex.rgb[i] >>> 16) & 255];
              const col = mix(base, RUST, 0.7 * (1 - (ry - pr) / len));
              tex.rgb[i] = pack(col[0], col[1], col[2]);
            }
          }
        });
      }
      break;
    }
  }
}

/** Bake the tunnel's surfaces for a run `length` units long whose walls are 2*hh high. `palette(z)` gives the tier
 *  colours at each depth (the tunnel takes each gate's colour). */
export function buildSurfaces(o: { length: number; hh: number; gap: number; palette: (z: number) => { wall: Rgb; stripe: Rgb; light: Rgb } }): Surfaces {
  const { length, hh, gap, palette } = o;
  const cols = Math.ceil(length * TPU);
  const g = noiseGrid(1337);
  const pal = Array.from({ length: cols }, (_, c) => palette((c + 0.5) / TPU));
  const make = (rows: number): Surface => ({ cols, rows, rgb: new Uint32Array(cols * rows), flags: new Uint8Array(cols * rows) });

  const walls = ([0, 1] as const).map((side) => {
    const rows = Math.ceil(2 * hh * TPU);
    const tex = make(rows);
    const off = side * 57.3;
    for (let c = 0; c < cols; c++) {
      const z = (c + 0.5) / TPU;
      const p = pal[c];
      const concrete = mix(CONCRETE, p.wall, 0.18 + 0.06 * hash2(Math.floor(z / 1.5), side));
      const paint = mix(p.wall, BLACK, 0.12);
      const trim = mix(p.light, BLACK, 0.25);
      const streak = vnoise(g, z * 5.3 + 101 + off, 0.5);
      const stainLen = streak > 0.58 ? ((streak - 0.58) / 0.42) * 1.5 : 0;            // in u: from the top down
      for (let r = 0; r < rows; r++) {
        const wy = -hh + (r + 0.5) / TPU;
        const u = wy / hh;
        const blot = vnoise(g, z * 0.9 + 77 + off, wy * 0.9 + 3);
        let col: Rgb;
        let flags = 0;
        if (u > 0.42) {                                                                 // the painted lower band and its trim
          const chip = vnoise(g, z * 6 + 13 + off, wy * 6 + 50);
          if (chip > 0.74) col = scale(mix(CONCRETE, [120, 120, 124], 0.25), chip < 0.76 ? 0.6 : 1);
          else if (u <= 0.5) col = trim;
          else {
            col = scale(paint, (0.9 + 0.2 * blot) * (1 - 0.25 * (u - 0.5) / 0.5));
            if (vnoise(g, z * 0.7 + off, wy * 28) > 0.8) col = scale(col, 0.78);        // scuffs from boots and kit bags
          }
        } else {
          col = scale(concrete, 0.8 + 0.32 * blot);
          const loss = vnoise(g, z * 1.7 + off, wy * 1.7 + 20) * 0.6 + vnoise(g, z * 4.1 + 31 + off, wy * 4.1) * 0.4;
          if (loss > 0.66) {                                                            // the plaster has gone: brick
            flags |= F_PATCH;
            const bh = 0.075, bw = 0.19;
            const row = Math.floor((wy + 10) / bh);
            const yin = wy + 10 - row * bh;
            const sz = z + (row % 2 ? bw / 2 : 0);
            const bc = Math.floor(sz / bw);
            const xin = sz - bc * bw;
            col = yin < 0.025 || xin < 0.025 ? MORTAR : scale(BRICK, 0.72 + 0.4 * hash2(row, bc + side * 1000));
            const above = vnoise(g, z * 1.7 + off, (wy - 0.05) * 1.7 + 20) * 0.6 + vnoise(g, z * 4.1 + 31 + off, (wy - 0.05) * 4.1) * 0.4;
            if (above <= 0.66) col = scale(col, 0.55);                                  // in the shadow of the plaster's edge
          } else if (loss > 0.63) {
            col = scale(mix(concrete, [160, 160, 168], 0.35), 1.1);                       // the broken edge of the plaster
          } else if (vnoise(g, z * 0.8 + 3 + off, wy * 0.8 + 1) > 0.55 && Math.abs(vnoise(g, z * 3.2 + 5 + off, wy * 3.2 + 9) - 0.5) < 0.016) {
            col = scale(col, 0.45);                                                     // a crack
          }
        }
        if (stainLen > 0 && u + 1 < stainLen && !(flags & F_PATCH)) {                  // water running down from the top
          col = mix(col, STAIN, 0.55 * (1 - (u + 1) / stainLen));
        }
        if (u > 0.72) col = scale(col, 1 - 0.4 * ((u - 0.72) / 0.28) * (0.6 + 0.4 * blot));   // grime near the floor
        const i = r * cols + c;
        tex.rgb[i] = pack(col[0], col[1], col[2]);
        tex.flags[i] = flags;
      }
    }
    const ctx: Ctx = { tex, hh, side };
    const decals = placeDecals(side, length, hh, gap);
    for (const d of decals.filter((x) => x.kind !== "pipe")) paintDecal(ctx, d, length);
    for (const d of decals.filter((x) => x.kind === "pipe")) paintDecal(ctx, d, length);    // pipes run in front
    return tex;
  }) as [Surface, Surface];

  const floor = make(2 * TPU);
  const ceiling = make(2 * TPU);
  for (let c = 0; c < cols; c++) {
    const z = (c + 0.5) / TPU;
    const base = mix(FLOOR, pal[c].stripe, 0.35);
    for (let r = 0; r < 2 * TPU; r++) {
      const x = -1 + (r + 0.5) / TPU;
      const blot = vnoise(g, z * 1.1 + 200, x * 1.1 + 40);
      let col = scale(base, 0.82 + 0.3 * blot);
      let flags = 0;
      if (Math.abs(x) < 0.86 && vnoise(g, z * 1.4 + 300, x * 2.2 + 11) > 0.72) {       // a puddle
        flags |= F_PUDDLE;
        col = mix(col, [20, 26, 40], 0.5);
      } else if (Math.abs(vnoise(g, z * 2.6 + 400, x * 2.6) - 0.5) < 0.014 && vnoise(g, z + 500, x + 9) > 0.5) {
        col = scale(col, 0.5);                                                          // cracks in the concrete
      }
      if (Math.abs(x) > 0.62 && hash2(c, r + 7777) > 0.975) {                            // bits of plaster that fell
        flags |= F_RUBBLE;
        col = scale([128, 124, 118], 0.7 + 0.4 * hash2(c + 1, r));
      }
      const i = r * cols + c;
      floor.rgb[i] = pack(col[0], col[1], col[2]);
      floor.flags[i] = flags;

      const damp = vnoise(g, z * 0.9 + 600, x * 0.9 + 70);
      let cc = scale(CEILING, 0.75 + 0.45 * damp);
      if (damp > 0.72) cc = mix(cc, STAIN, 0.35 + 0.35 * Math.abs(Math.sin(damp * 40)));   // damp patches, ringed
      if (Math.abs(x - 0.55 - 0.035 * Math.sin(z * 4.2)) < 0.016) cc = [10, 10, 14];        // a sagging cable
      ceiling.rgb[i] = pack(cc[0], cc[1], cc[2]);
    }
  }
  return { walls, floor, ceiling };
}
