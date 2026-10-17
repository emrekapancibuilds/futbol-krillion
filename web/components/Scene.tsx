"use client";

// The live matchday scene behind every page (spec: docs/superpowers/specs/2026-10-16-matchday-scene-design.md).
// Draws the layers made by art/scene.py on one canvas, at a whole-number scale of the device pixels so the pixel art
// stays crisp, and animates them: the crowd (its mood comes from the game, on <body data-crowd>), camera flashes,
// floodlight flicker and breathing light shafts, dust in the light, the players breathing, the grass swaying, a slow
// camera drift and pointer parallax. Pauses while the tab is hidden; with Reduced Motion it draws one still frame.

import { useEffect, useRef } from "react";

import { activeFlashes, breathFrame, coverFit, crowdFrame, dustAt, LAYER_DEPTH, parallax, pickComposition, swayFrame,
         type Composition, type Mood, type SceneMeta } from "@/lib/scene/engine.ts";

const LAYERS = ["back", "crowd-1", "crowd-2", "crowd-3", "pitch", "players-1", "players-2", "front-1", "front-2", "glow", "beams"];
const FRAME_MS = 1000 / 30;

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
        comp = next;
        canvas!.dataset.ready = next;
        draw(seconds());
      } catch {
        /* the plain background colour stays: the site works without the scene */
      }
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

      layer("back", LAYER_DEPTH.back);
      const cf = still ? 0 : crowdFrame(mood, beat, time);
      if (cf) layer(`crowd-${cf}`, LAYER_DEPTH.back);
      layer("beams", LAYER_DEPTH.back, 0.4 + 0.14 * Math.sin(time * 0.6), "lighter");

      // camera flashes in the stands: a white pixel and, at its brightest, a little cross of light
      if (!still) {
        const o = offset(LAYER_DEPTH.back);
        ctx.globalCompositeOperation = "lighter";
        for (const f of activeFlashes(mood, time, m.seats)) {
          const [sx, sy, w] = m.seats[f.seat];
          const x = dx + o.x + (sx + Math.floor(w / 2)) * scale;
          const y = dy + o.y + (sy - 1) * scale;
          ctx.globalAlpha = 1 - f.age;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, y, scale, scale);
          if (f.age < 0.45) {
            ctx.globalAlpha = (0.45 - f.age) * 1.4;
            ctx.fillStyle = "#cfe8ff";
            ctx.fillRect(x - scale, y, scale, scale); ctx.fillRect(x + scale, y, scale, scale);
            ctx.fillRect(x, y - scale, scale, scale); ctx.fillRect(x, y + scale, scale, scale);
          }
        }
      }

      layer("pitch", LAYER_DEPTH.pitch);
      layer(`players-${breathFrame(time) + 1}`, LAYER_DEPTH.players);

      // dust drifting through the light
      if (!still) {
        const o = offset(LAYER_DEPTH.players);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ffe7b0";
        for (const d of dustAt(time, 46, m.w, m.h * 0.75)) {
          ctx.globalAlpha = d.a * 0.35;
          ctx.fillRect(dx + o.x + Math.floor(d.x) * scale, dy + o.y + Math.floor(d.y) * scale, scale, scale);
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
