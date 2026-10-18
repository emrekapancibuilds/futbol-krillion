"use client";

// The live matchday scene behind every page (specs: docs/superpowers/specs/2026-10-16-matchday-scene-design.md,
// 2026-10-17-scene-2-design.md and 2026-10-18-scene-3-design.md). Draws the layers made by art/scene.py on one
// canvas, at a whole-number scale of the device pixels so the pixel art stays crisp, and animates them: twinkling
// stars and drifting clouds, scrolling LED boards and changing video screens, the crowd (its mood comes from the game,
// on <body data-crowd>) with a Mexican wave now and then, camera flashes, flares and their smoke, floodlight flicker
// and breathing light shafts, the players up the pitch jogging about, the two in front breathing, dust in the light,
// confetti after a rare answer, the grass swaying, a slow camera drift and pointer parallax. Pauses while the tab is
// hidden; with Reduced Motion it draws one still frame.

import { useEffect, useRef } from "react";

import { activeFlashes, breathFrame, confettiAt, coverFit, crowdFrame, dustAt, FIELD_FRAMES, fieldState, flareFlicker,
         decodeLedMap, LAYER_DEPTH, litFlares, paintLeds, parallax, pickComposition, ribbonOffset, screenFrame, smokeAt,
         swayFrame, twinkle, WAVE_HALF, waveAt,
         type Composition, type Mood, type SceneMeta } from "@/lib/scene/engine.ts";

const LAYERS = ["sky", "clouds", "strips", "ledmap", "back", "crowd-1", "crowd-2", "crowd-3", "crowd-4", "pitch", "field",
                "players-1", "players-2", "front-1", "front-2", "glow", "beams"];
const FRAME_MS = 1000 / 30;
const STAR_COLOURS = ["#7d88b8", "#c4ccf0", "#ffffff"];
const CONFETTI = ["#ffd24a", "#f4f6ff", "#3aa8c8", "#e0483c"];
const CLOUD_SPEED = 1.2;      // art pixels a second

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

export default function Scene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let comp: Composition | null = null;
    let meta: SceneMeta | null = null;
    let images: Record<string, HTMLImageElement> = {};
    // the LEDs: painted into their own small canvas from the strips through the LED map, whenever a board scrolls on
    // or a screen changes picture
    let leds: { map: ReturnType<typeof decodeLedMap>; strips: { data: Uint32Array; width: number };
                canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData; out: Uint32Array; key: string } | null = null;
    let raf = 0;
    let lastDraw = -Infinity;
    let loading = 0;
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    const seconds = () => (performance.now() - start) / 1000;

    async function load(next: Composition) {
      const token = ++loading;
      try {
        const [m, ...ims] = await Promise.all([
          fetch(`/art/scene/${next}.json`).then((r) => r.json() as Promise<SceneMeta>),
          ...LAYERS.map((l) => loadImage(`/art/scene/${next}-${l}.png`)),
        ]);
        if (token !== loading) return;
        meta = m;
        images = Object.fromEntries(LAYERS.map((l, i) => [l, ims[i]]));
        leds = prepareLeds(m, images);
        comp = next;
        canvas!.dataset.ready = next;
        draw(seconds());
      } catch {
        /* the plain background colour stays: the site works without the scene */
      }
    }

    function pixels(im: HTMLImageElement) {
      const cv = document.createElement("canvas");
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const g = cv.getContext("2d", { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(im, 0, 0);
      return g.getImageData(0, 0, cv.width, cv.height);
    }

    function prepareLeds(m: SceneMeta, ims: Record<string, HTMLImageElement>) {
      const map = pixels(ims.ledmap), strips = pixels(ims.strips);
      const cv = document.createElement("canvas");
      cv.width = m.w; cv.height = m.h;
      const g = cv.getContext("2d");
      if (!map || !strips || !g) return null;
      const image = g.createImageData(m.w, m.h);
      return { map: decodeLedMap(map.data), strips: { data: new Uint32Array(strips.data.buffer), width: strips.width },
               canvas: cv, ctx: g, image, out: new Uint32Array(image.data.buffer), key: "" };
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
      const next = pickComposition(rect.width, rect.height);
      if (next !== comp) void load(next);
      else draw(seconds());
    }

    function draw(t: number) {
      if (!meta || !ctx) return;
      const m = meta;
      const { scale, dx, dy } = coverFit(canvas!.width, canvas!.height, m);
      const time = still ? 0 : t;
      const body = document.body;
      const mood = (["calm", "hype"].includes(body.dataset.crowd ?? "") ? body.dataset.crowd : "normal") as Mood;
      const beat = parseFloat(body.style.getPropertyValue("--crowd-beat")) || 0;
      pointer.x += (target.x - pointer.x) * 0.06;
      pointer.y += (target.y - pointer.y) * 0.06;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#070a18";
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);

      const offset = (depth: number) => parallax(depth, pointer.x, pointer.y, time, scale);
      const layer = (name: string, depth: number, alpha = 1, mode: GlobalCompositeOperation = "source-over") => {
        const im = images[name];
        if (!im) return;
        const o = offset(depth);
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = mode;
        ctx.drawImage(im, dx + o.x, dy + o.y, m.w * scale, m.h * scale);
      };

      const at = (o: { x: number; y: number }, x: number, y: number) => [dx + o.x + x * scale, dy + o.y + y * scale] as const;
      const px = (o: { x: number; y: number }, x: number, y: number, w = 1, h = 1) => {
        const [X, Y] = at(o, x, y);
        ctx.fillRect(X, Y, w * scale, h * scale);
      };

      // the sky: gradient, twinkling stars, clouds drifting by (wrapping around)
      layer("sky", LAYER_DEPTH.sky);
      {
        const o = offset(LAYER_DEPTH.sky);
        m.stars.forEach(([x, y, b], i) => {
          ctx.globalAlpha = (still ? 0.7 : twinkle(i, time)) * (0.55 + 0.225 * b);
          ctx.fillStyle = STAR_COLOURS[b];
          px(o, x, y);
        });
        ctx.globalAlpha = 1;
        const off = still ? 0 : ribbonOffset(time, CLOUD_SPEED, m.w);
        for (const k of [0, -1]) {
          const [X, Y] = at(o, off + k * m.w, 0);
          ctx.drawImage(images.clouds, X, Y, m.w * scale, m.h * scale);
        }
      }

      // the LED boards and the video screens, underneath the holes in the back layer: text scrolling round the bowl,
      // pictures changing every few seconds
      if (leds) {
        const offsets = m.leds.map((l) => (still ? 0 : ribbonOffset(time, l.speed, l.period)));
        const frames = m.screens.map((sc, k) => (still ? 0 : screenFrame(time, k, sc.frames)));
        const key = `${offsets.join()}|${frames.join()}`;
        if (key !== leds.key) {
          paintLeds(leds.out, leds.map, leds.strips, m.leds, m.screens, offsets, frames);
          leds.ctx.putImageData(leds.image, 0, 0);
          leds.key = key;
        }
        const [X, Y] = at(offset(LAYER_DEPTH.back), 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(leds.canvas, X, Y, m.w * scale, m.h * scale);
      }

      layer("back", LAYER_DEPTH.back);
      const cf = still ? 0 : crowdFrame(mood, beat, time);
      if (cf) layer(`crowd-${cf}`, LAYER_DEPTH.back);
      // the Mexican wave: a band of supporters on their feet, arms up, travelling across the stands with a ragged edge
      const wx = still ? null : waveAt(mood, time, m.w);
      if (wx !== null) {
        const o = offset(LAYER_DEPTH.back);
        for (let x = Math.max(0, Math.floor(wx - WAVE_HALF)) & ~1; x < Math.min(m.w, wx + WAVE_HALF); x += 2) {
          if (Math.abs(x + 1 - wx) > WAVE_HALF * (0.65 + 0.35 * Math.abs(Math.sin(x * 12.9898)))) continue;
          const [X, Y] = at(o, x, 0);
          ctx.drawImage(images["crowd-4"], x, 0, 2, m.h, X, Y, 2 * scale, m.h * scale);
        }
      }
      layer("beams", LAYER_DEPTH.back, 0.4 + 0.14 * Math.sin(time * 0.6), "lighter");

      // camera flashes in the stands: a white pixel and, at its brightest, a little cross of light
      if (!still) {
        const o = offset(LAYER_DEPTH.back);
        ctx.globalCompositeOperation = "lighter";
        for (const f of activeFlashes(mood, time, m.seats)) {
          const [sx, sy, w] = m.seats[f.seat];
          const x = sx + Math.floor(w / 2), y = sy - 1;
          ctx.globalAlpha = 1 - f.age;
          ctx.fillStyle = "#ffffff";
          px(o, x, y);
          if (f.age < 0.45) {
            ctx.globalAlpha = (0.45 - f.age) * 1.4;
            ctx.fillStyle = "#cfe8ff";
            px(o, x - 1, y); px(o, x + 1, y); px(o, x, y - 1); px(o, x, y + 1);
          }
        }
      }

      // flares: smoke rising and drifting, a red glow, a white-hot core
      if (!still) {
        const o = offset(LAYER_DEPTH.back);
        const lit = litFlares(mood, m.flares.length);
        for (let k = 0; k < lit; k++) {
          const [fx, fy] = m.flares[k];
          const f = flareFlicker(k, time);
          ctx.globalCompositeOperation = "source-over";
          for (const p of smokeAt(time, k, mood === "hype" ? 30 : 22)) {
            ctx.globalAlpha = p.a;
            ctx.fillStyle = p.dy > -9 ? "#c47a78" : p.dy > -24 ? "#9a8296" : "#7a7f9c";
            px(o, Math.round(fx + p.dx - p.size / 2), Math.round(fy + p.dy - p.size / 2), p.size, p.size);
          }
          ctx.globalCompositeOperation = "lighter";
          const [cx, cy] = at(o, fx + 0.5, fy + 0.5);
          const r = 9 * scale * f;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, "rgba(255,96,40,0.6)");
          g.addColorStop(1, "rgba(255,40,20,0)");
          ctx.globalAlpha = f;
          ctx.fillStyle = g;
          ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
          ctx.fillStyle = f > 0.8 ? "#fff4d0" : "#ffb040";
          px(o, fx, fy);
          ctx.fillStyle = "#ff5a28";
          px(o, fx, fy - 1);
        }
      }

      layer("pitch", LAYER_DEPTH.pitch);

      // the players up the pitch: shadows first, then each player, furthest first
      {
        const o = offset(LAYER_DEPTH.pitch);
        const states = m.field.map((p) => (still ? { x: p.home, dir: p.home < 0 ? 1 : -1, frame: 0 } : fieldState(p, time)));
        const feet = m.field.map((p, i) => Math.round(p.feet[0] + p.ppm * (states[i].x - p.home)));
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#020a05";
        m.field.forEach((p, i) => {
          const contact = Math.max(2, Math.round(p.ppm * 0.9)), long = Math.max(3, Math.round(p.ppm * 1.8));
          ctx.globalAlpha = 0.14;
          px(o, feet[i] - long, p.feet[1], 2 * long, 1);
          ctx.globalAlpha = 0.42;
          px(o, feet[i] - Math.floor(contact / 2), p.feet[1], contact, 1);
        });
        ctx.globalAlpha = 1;
        m.field.forEach((p, i) => {
          const s = states[i];
          const [cx, cy, cw, ch] = p.cell;
          const k = s.frame + (s.dir < 0 ? FIELD_FRAMES : 0);
          const [X, Y] = at(o, Math.round(feet[i] - p.anchor[0]), p.feet[1] - p.anchor[1]);
          ctx.drawImage(images.field, cx + k * cw, cy, cw, ch, X, Y, cw * scale, ch * scale);
        });
      }

      layer(`players-${breathFrame(time) + 1}`, LAYER_DEPTH.players);

      // dust drifting through the light
      if (!still) {
        const o = offset(LAYER_DEPTH.players);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ffe7b0";
        for (const d of dustAt(time, 46, m.w, m.h * 0.75)) {
          ctx.globalAlpha = d.a * 0.35;
          px(o, Math.floor(d.x), Math.floor(d.y));
        }
      }

      // confetti after a rare answer
      if (!still && mood === "hype") {
        const o = offset(LAYER_DEPTH.front);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.92;
        for (const p of confettiAt(time, 170, m.w, m.h)) {
          ctx.fillStyle = CONFETTI[p.c];
          px(o, Math.floor(p.x), Math.floor(p.y), p.wide ? 2 : 1, p.wide ? 1 : 2);     // tumbling: flat, then edge-on
        }
      }

      layer(`front-${swayFrame(time) + 1}`, LAYER_DEPTH.front);
      layer("glow", LAYER_DEPTH.back, 0.78 + 0.08 * Math.sin(time * 2.1) + 0.04 * Math.sin(time * 13.7), "lighter");
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      if (now - lastDraw < FRAME_MS) return;
      lastDraw = now;
      draw(seconds());
    }

    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(tick);
    }

    function onPointer(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
    }

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); };

    resize();
    if (!still) raf = requestAnimationFrame(tick);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="scene" data-testid="scene" aria-hidden />;
}
