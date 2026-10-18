import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSurfaces, DECAL_HALF, F_DECAL, F_EMISSIVE, F_PATCH, F_PUDDLE, placeDecals, TPU, type Rgb } from "./walls.ts";

const GAP = 3;
const pal = (): { wall: Rgb; stripe: Rgb; light: Rgb } => ({ wall: [110, 97, 82], stripe: [84, 74, 63], light: [201, 162, 122] });

test("things hang on both tunnel walls, never on top of each other or across a gate's door frame", () => {
  for (const side of [0, 1] as const) {
    const ds = placeDecals(side, 7 * GAP + 1.4, 0.625, GAP);
    assert.ok(ds.length >= 14, `${ds.length} on side ${side}`);
    assert.deepEqual(ds, placeDecals(side, 7 * GAP + 1.4, 0.625, GAP));
    const sorted = [...ds].sort((a, b) => a.z - b.z);
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      assert.ok(b.z - a.z >= DECAL_HALF[a.kind] + DECAL_HALF[b.kind] || a.kind === "pipe" || b.kind === "pipe", `${a.kind}@${a.z} hits ${b.kind}@${b.z}`);
    }
    for (const d of ds) {
      if (d.kind === "pipe") continue;
      const toGate = Math.abs(d.z - Math.round(d.z / GAP) * GAP);
      assert.ok(toGate >= DECAL_HALF[d.kind] + 0.06, `${d.kind} at ${d.z} crosses a door frame`);
    }
  }
  const all = [...placeDecals(0, 22.4, 0.625, GAP), ...placeDecals(1, 22.4, 0.625, GAP)];
  const kinds = new Set(all.map((d) => d.kind));
  for (const k of ["jersey", "frame", "poster", "scarf", "exit", "extinguisher", "pipe"]) assert.ok(kinds.has(k as never), `no ${k}`);
  const teams = new Set(all.filter((d) => d.kind === "jersey").map((d) => d.team));
  assert.ok(teams.has("A") && teams.has("B"), `jerseys of ${[...teams]}`);
});

test("the tunnel's surfaces are weathered: plaster gone to brick in patches, puddles on the floor, lit exit signs", () => {
  const len = 7 * GAP + 1.4, hh = 0.625;
  const s = buildSurfaces({ length: len, hh, gap: GAP, palette: pal });
  for (const w of s.walls) {
    assert.equal(w.cols, Math.ceil(len * TPU));
    assert.equal(w.rows, Math.ceil(2 * hh * TPU));
    assert.equal(w.rgb.length, w.cols * w.rows);
  }
  assert.equal(s.floor.rows, 2 * TPU);
  const count = (flags: Uint8Array, bit: number) => flags.reduce((n, f) => n + ((f & bit) ? 1 : 0), 0);
  const walls = s.walls[0].flags.length + s.walls[1].flags.length;
  const patches = count(s.walls[0].flags, F_PATCH) + count(s.walls[1].flags, F_PATCH);
  assert.ok(patches > walls * 0.02 && patches < walls * 0.3, `${patches} of ${walls} wall texels show brick`);
  assert.ok(count(s.walls[0].flags, F_DECAL) + count(s.walls[1].flags, F_DECAL) > 0);
  assert.ok(count(s.walls[0].flags, F_EMISSIVE) + count(s.walls[1].flags, F_EMISSIVE) > 0, "no lit exit sign");
  assert.ok(count(s.floor.flags, F_PUDDLE) > 0, "no puddles");
  for (const t of [...s.walls, s.floor, s.ceiling]) {
    for (let i = 0; i < t.rgb.length; i += 97) assert.equal(t.rgb[i] >>> 24, 0xff, "every texel is opaque");
  }
  // the same run always looks the same
  const again = buildSurfaces({ length: len, hh, gap: GAP, palette: pal });
  assert.deepEqual(again.walls[1].rgb.slice(0, 4000), s.walls[1].rgb.slice(0, 4000));
});

test("building the surfaces for the longest run on a tall phone is quick enough to do as the reveal starts", () => {
  const t0 = performance.now();
  buildSurfaces({ length: 7 * GAP + 1.4, hh: 2.17, gap: GAP, palette: pal });
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${ms.toFixed(0)} ms`);
});
