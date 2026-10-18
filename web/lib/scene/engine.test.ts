import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { activeFlashes, breathFrame, confettiAt, coverFit, crowdFrame, decodeLedMap, dustAt, fieldState, flareFlicker, LAYER_DEPTH,
         litFlares, paintLeds, PARALLAX, parallax, pickComposition, ribbonOffset, screenFrame, smokeAt, twinkle, WAVE_HALF, waveAt,
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
  assert.equal(coverFit(1920, 1080, meta("wide")).scale, 3);       // 1080p
  assert.equal(coverFit(2880, 1800, meta("wide")).scale, 5);       // a 1440x900 laptop at 2x
  assert.equal(coverFit(1170, 2532, meta("tall")).scale, 4);       // iPhone 13/14
  assert.equal(coverFit(1179, 2556, meta("tall")).scale, 4);       // iPhone 15/16
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

const player = { home: -9, range: 3, speed: 2.6, seed: 4 };

test("players up the pitch jog to a new spot now and then and stay near home, without ever jumping", () => {
  let prev = fieldState(player, 0);
  let moved = 0;
  for (let t = 0.02; t < 120; t += 0.02) {
    const s = fieldState(player, t);
    assert.ok(Math.abs(s.x - player.home) <= player.range + 1e-9, `${t}: ${s.x}`);
    assert.ok(Math.abs(s.x - prev.x) <= 0.2, `${t}: jumped from ${prev.x} to ${s.x}`);       // under 10 m/s
    if (Math.abs(s.x - prev.x) > 1e-6) moved++;
    prev = s;
  }
  assert.ok(moved > 700 && moved < 4800, `${moved} moving steps in 2 minutes`);              // sometimes running, sometimes not
  assert.deepEqual(fieldState(player, 33.3), fieldState(player, 33.3));
});

test("a running player faces where he's going and cycles his legs as he covers ground; a resting one faces the ball", () => {
  const runFrames = new Set<number>();
  for (let t = 0.02; t < 120; t += 0.02) {
    const [prev, s, next] = [fieldState(player, t - 0.02), fieldState(player, t), fieldState(player, t + 0.02)];
    const before = s.x - prev.x, after = next.x - s.x;
    if (Math.abs(before) > 1e-6 && Math.abs(after) > 1e-6) {             // in the middle of a run
      assert.ok(s.frame >= 2 && s.frame <= 5, `${t}: frame ${s.frame}`);
      assert.equal(s.dir, after > 0 ? 1 : -1, `${t}: running ${after} facing ${s.dir}`);
      runFrames.add(s.frame);
    } else if (Math.abs(before) < 1e-6 && Math.abs(after) < 1e-6) {      // standing still
      assert.ok(s.frame === 0 || s.frame === 1, `${t}: resting in frame ${s.frame}`);
      assert.equal(s.dir, 1, "the left team rests facing the ball, to the right");
    }
  }
  assert.equal(runFrames.size, 4);
  assert.equal(fieldState({ ...player, home: 12 }, 0.5).dir, -1);
});

test("LED text scrolls a whole pixel at a time and wraps around its strip, either way", () => {
  for (const [speed, period] of [[9, 212], [-6, 178]] as const) {
    for (const t of [0, 0.37, 5, 123.4]) {
      const o = ribbonOffset(t, speed, period);
      assert.ok(Number.isInteger(o) && o >= 0 && o < period, `${speed} ${t}: ${o}`);
    }
  }
  assert.equal(ribbonOffset(0, 9, 212), 0);
  assert.notEqual(ribbonOffset(1, 9, 212), ribbonOffset(1, -9, 212));
});

test("a Mexican wave travels across the stands now and then, more often after a rare answer, never after a miss", () => {
  const W = 512;
  const seen = (mood: "calm" | "normal" | "hype") => {
    const xs: number[] = [];
    for (let t = 0; t < 120; t += 0.1) { const x = waveAt(mood, t, W); if (x !== null) xs.push(x); }
    return xs;
  };
  assert.equal(seen("calm").length, 0);
  const normal = seen("normal"), hype = seen("hype");
  assert.ok(normal.length > 0 && hype.length > normal.length, `${normal.length} ${hype.length}`);
  assert.ok([...normal, ...hype].every((x) => x >= -WAVE_HALF && x <= W + WAVE_HALF));
  // it moves one way, steadily
  let last = -Infinity;
  for (let t = 0; t < 26; t += 0.1) {
    const x = waveAt("normal", t, W);
    if (x === null) { last = -Infinity; continue; }
    assert.ok(x >= last, `${t}: ${x} after ${last}`);
    last = x;
  }
});

test("stars twinkle, flares flicker and smoke rises from them, all within bounds", () => {
  for (let t = 0; t < 30; t += 0.37) {
    for (let i = 0; i < 20; i++) {
      const b = twinkle(i, t);
      assert.ok(b >= 0.15 && b <= 1, `${i} ${t}: ${b}`);
      const f = flareFlicker(i, t);
      assert.ok(f >= 0.55 && f <= 1, `${i} ${t}: ${f}`);
    }
    for (const p of smokeAt(t, 2, 24)) {
      assert.ok(p.dy <= 0 && p.dy >= -60, `smoke at ${p.dy}`);
      assert.ok(p.size >= 1 && p.size <= 4 && Number.isInteger(p.size));
      assert.ok(p.a >= 0 && p.a <= 0.6);
    }
  }
  assert.equal(smokeAt(3, 1, 24).length, 24);
  assert.deepEqual(litFlares("calm", 5), 2);
  assert.ok(litFlares("normal", 5) < litFlares("hype", 5) && litFlares("hype", 5) === 5);
  assert.equal(litFlares("hype", 0), 0);
});

test("confetti tumbles down inside the picture", () => {
  for (const t of [0, 1.7, 44.4]) {
    const c = confettiAt(t, 90, 512, 328);
    assert.equal(c.length, 90);
    for (const p of c) assert.ok(p.x >= 0 && p.x < 512 && p.y >= 0 && p.y < 328 && p.c >= 0 && p.c < 4);
  }
  // pieces fall: on average they are lower a moment later
  const a = confettiAt(10, 90, 512, 1e6), b = confettiAt(10.5, 90, 512, 1e6);
  assert.ok(b.reduce((s, p) => s + p.y, 0) > a.reduce((s, p) => s + p.y, 0));
});

// A 4x2 LED map: two board pixels, one screen pixel, the rest empty. R, G = texel; B = which (1.. boards, 101.. screens)
const MAP = new Uint8ClampedArray([
  3, 0x20, 1, 255,   0, 0, 0, 255,   250, 0x11, 1, 255,   0, 0, 0, 255,       // u=3 v=2; none; u=250+256 v=1; none
  0, 0, 0, 255,      5, 4, 101, 255, 0, 0, 0, 255,        0, 0, 0, 255,       // screen 0 at u=5 v=4
]);

test("the LED map says which board or screen each LED pixel belongs to, and its texel there", () => {
  const m = decodeLedMap(MAP);
  assert.deepEqual([...m.pix], [0, 2, 5]);
  assert.deepEqual([...m.which], [1, 1, 101]);
  assert.deepEqual([...m.u], [3, 506, 5]);
  assert.deepEqual([...m.v], [2, 1, 4]);
});

test("LEDs are painted from the boards' strips (scrolled round) and the screens' current picture", () => {
  const m = decodeLedMap(MAP);
  // a strips image 520 wide: board 0's strip on rows 0..6 (period 510), screen 0 on rows 7..15 (frames 10 wide)
  const W = 520;
  const strips = new Uint32Array(W * 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < W; x++) strips[y * W + x] = (y << 16) | x;     // encode x, y
  const leds = [{ sy: 0, rows: 7, period: 510, speed: 6 }];
  const screens = [{ sy: 7, w: 10, h: 9, frames: 4 }];
  const out = new Uint32Array(8);
  paintLeds(out, m, { data: strips, width: W }, leds, screens, [0], [0]);
  assert.equal(out[0], (2 << 16) | 3);                      // board texel u=3 v=2
  assert.equal(out[2], (1 << 16) | 506);
  assert.equal(out[5], ((7 + 4) << 16) | 5);                // screen texel u=5 v=4 in frame 0
  assert.equal(out[1], 0);                                   // not an LED: left alone
  paintLeds(out, m, { data: strips, width: W }, leds, screens, [7], [2]);
  assert.equal(out[0], (2 << 16) | 10);                     // scrolled 7 texels on
  assert.equal(out[2], (1 << 16) | 3);                      // 506 + 7 wraps round the 510 period
  assert.equal(out[5], ((7 + 4) << 16) | 25);               // frame 2: 2 * 10 + 5
});

test("the video screens change picture every few seconds, each on its own rhythm", () => {
  const seen = new Set<number>();
  for (let t = 0; t < 40; t += 0.25) {
    const f = screenFrame(t, 0, 4);
    assert.ok(Number.isInteger(f) && f >= 0 && f < 4);
    seen.add(f);
  }
  assert.equal(seen.size, 4);
  assert.notDeepEqual(Array.from({ length: 20 }, (_, i) => screenFrame(i, 0, 4)), Array.from({ length: 20 }, (_, i) => screenFrame(i, 1, 4)));
  assert.equal(screenFrame(3.3, 0, 1), 0);
});
