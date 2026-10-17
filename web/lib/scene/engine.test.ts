import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { activeFlashes, breathFrame, coverFit, crowdFrame, dustAt, LAYER_DEPTH, PARALLAX, parallax, pickComposition,
         type SceneMeta } from "./engine.ts";

const meta = (name: "wide" | "tall"): SceneMeta =>
  JSON.parse(readFileSync(new URL(`../../public/art/scene/${name}.json`, import.meta.url), "utf8")) as SceneMeta;

test("landscape screens get the wide scene, portrait phones the tall one", () => {
  assert.equal(pickComposition(1920, 1080), "wide");
  assert.equal(pickComposition(1024, 1024), "wide");
  assert.equal(pickComposition(390, 844), "tall");
  assert.equal(pickComposition(768, 1024), "tall");
});

test("the scene covers the screen at a whole-number scale, so every art pixel is a crisp square", () => {
  for (const [w, h, name] of [[1920, 1080, "wide"], [2880, 1800, "wide"], [1366, 768, "wide"], [3840, 1600, "wide"],
                              [2560, 1440, "wide"], [1170, 2532, "tall"], [1179, 2556, "tall"], [750, 1334, "tall"],
                              [1536, 2048, "tall"], [1080, 2400, "tall"]] as const) {
    const m = meta(name);
    const f = coverFit(w, h, m);
    assert.ok(Number.isInteger(f.scale) && f.scale >= 1, `${w}x${h}: scale ${f.scale}`);
    const [vx, vy, vw, vh] = m.view;
    // it fills the screen, and only ever shows the art's window plus the part of its margin parallax doesn't need
    const sx = m.margin[0] - PARALLAX.x, sy = m.margin[1] - PARALLAX.y;
    assert.ok(f.dx <= -(vx - sx) * f.scale && f.dx + (vx + vw + sx) * f.scale >= w, `${w}x${h}: x ${f.dx} at ${f.scale}`);
    assert.ok(f.dy <= -(vy - sy) * f.scale && f.dy + (vy + vh + sy) * f.scale >= h, `${w}x${h}: y ${f.dy} at ${f.scale}`);
    assert.ok(Number.isInteger(f.dx) && Number.isInteger(f.dy));
  }
});

test("common screens get the smallest scale that covers them, so little of the scene is cropped away", () => {
  assert.equal(coverFit(1920, 1080, meta("wide")).scale, 4);       // 1080p
  assert.equal(coverFit(2880, 1800, meta("wide")).scale, 6);       // a 1440x900 laptop at 2x
  assert.equal(coverFit(1170, 2532, meta("tall")).scale, 5);       // iPhone 13/14
  assert.equal(coverFit(1179, 2556, meta("tall")).scale, 5);       // iPhone 15/16
});

test("parallax never moves a layer further than the art's margin, at any pointer position or time", () => {
  const s = 4;
  for (const depth of Object.values(LAYER_DEPTH)) {
    for (const px of [-1, -0.3, 0, 0.7, 1]) {
      for (const t of [0, 1.3, 7.9, 60]) {
        const o = parallax(depth, px, -px, t, s);
        assert.ok(Math.abs(o.x) <= PARALLAX.x * s && Math.abs(o.y) <= PARALLAX.y * s, `${depth} ${px} ${t}: ${o.x},${o.y}`);
        assert.ok(Number.isInteger(o.x) && Number.isInteger(o.y));
      }
    }
  }
  // nearer layers move more than the stands behind them
  assert.ok(Math.abs(parallax(LAYER_DEPTH.front, 1, 0, 0, s).x) > Math.abs(parallax(LAYER_DEPTH.back, 1, 0, 0, s).x));
});

const frames = (mood: "calm" | "normal" | "hype", beat = 0) =>
  Array.from({ length: 300 }, (_, i) => crowdFrame(mood, beat, i * 0.01));      // 3 seconds at 100 fps
const changes = (xs: number[]) => xs.filter((x, i) => i > 0 && x !== xs[i - 1]).length;

test("the crowd sits still after a missed chance, sways normally, and bounces faster after a rare answer", () => {
  assert.deepEqual(new Set(frames("calm")), new Set([0]));
  const normal = frames("normal");
  assert.ok(new Set(normal).size >= 3, `${[...new Set(normal)]}`);
  assert.ok(normal.every((f) => f >= 0 && f <= 3));
  assert.ok(changes(frames("hype", 400)) > changes(normal) * 1.5, `${changes(frames("hype", 400))} vs ${changes(normal)}`);
});

test("camera flashes pop in the stands: more after a rare answer, fewer after a miss, always the same for the same time", () => {
  const seats = Array.from({ length: 400 }, (_, i) => [i % 480, 80 + (i % 60), 2] as [number, number, number]);
  const count = (mood: "calm" | "normal" | "hype") => {
    let n = 0;
    for (let t = 0; t < 10; t += 0.05) n += activeFlashes(mood, t, seats).length;
    return n;
  };
  assert.ok(count("hype") > count("normal") * 2 && count("normal") > count("calm") * 2, `${count("hype")} ${count("normal")} ${count("calm")}`);
  assert.deepEqual(activeFlashes("normal", 4.2, seats), activeFlashes("normal", 4.2, seats));
  for (let t = 0; t < 10; t += 0.07) {
    for (const f of activeFlashes("hype", t, seats)) {
      assert.ok(f.age >= 0 && f.age <= 1 && f.seat >= 0 && f.seat < seats.length);
    }
    assert.ok(activeFlashes("hype", t, seats).length <= 12);
  }
});

test("the players breathe in and out slowly, and dust drifts inside the picture", () => {
  const b = Array.from({ length: 80 }, (_, i) => breathFrame(i * 0.1));
  assert.ok(b.every((x) => x === 0 || x === 1));
  assert.ok(changes(b) >= 3 && changes(b) <= 8, `${changes(b)} breaths in 8 s`);
  for (const t of [0, 3.3, 99.9]) {
    for (const d of dustAt(t, 40, 496, 282)) {
      assert.ok(d.x >= 0 && d.x < 496 && d.y >= 0 && d.y < 282 && d.a >= 0 && d.a <= 1);
    }
  }
});
