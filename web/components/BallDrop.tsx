"use client";

// The ball drop (spec: docs/superpowers/specs/2026-10-18-clean-revamp-design.md): after an accepted answer the screen
// follows a ball down through the levels, one per tier and darker the deeper it goes, until it hits the floor of the
// answer's level, squashes, kicks up dust and bounces to rest. The timing is lib/reveal/drop.ts; this draws it, moving
// the elements directly each frame. A tap or a key skips to the landing; with Reduced Motion it starts landed.

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { ballAt, dropPlan, levelShade } from "@/lib/reveal/drop.ts";
import { TIERS } from "@/lib/tiers.ts";

import { Ball, TierBadge } from "./Brand.tsx";

const R = 30;               // the ball's radius, px

export default function BallDrop({ tier, onLanded }: { tier: number; onLanded: () => void }) {
  const plan = useMemo(() => dropPlan(tier), [tier]);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const skipRef = useRef(false);
  const landedRef = useRef(onLanded);
  useEffect(() => { landedRef.current = onLanded; });
  const [geo, setGeo] = useState({ H: 800, L: 340, top: 440 });
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const H = root.clientHeight || window.innerHeight;
    const L = Math.max(170, Math.round(H * 0.42));             // one level
    const top = Math.round(H * 0.55);                           // open air above the first level
    setGeo({ H, L, top });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const yPx = (lv: number) => top + lv * L;
    const floorPx = yPx(plan.floor);
    const maxCam = Math.max(0, floorPx - H * 0.68);              // once down, the floor sits two thirds of the way down
    const t0 = performance.now();
    let raf = 0;
    let fired = false;

    // The outer element moves and squashes (about the ball's bottom, where it meets the floor); the inner one spins
    // about the ball's centre.
    const place = (el: HTMLElement | null, y: number, squash: number, alpha = 1) => {
      if (!el) return;
      const sx = 1 + 0.26 * squash, sy = 1 - 0.3 * squash;
      el.style.transform = `translate(-50%, ${yPx(y) - 2 * R}px) scale(${sx}, ${sy})`;
      el.style.opacity = String(alpha);
      const spin = el.firstElementChild as HTMLElement | null;
      if (spin) spin.style.transform = `rotate(${y * 230}deg)`;
    };

    const frame = (now: number) => {
      const ms = reduce || skipRef.current ? plan.settleMs + 1 : now - t0;
      const b = ballAt(plan, ms);
      const by = yPx(b.y);
      const cam = Math.min(maxCam, Math.max(0, by - H * 0.42));
      if (trackRef.current) trackRef.current.style.transform = `translateY(${-cam}px)`;
      // the ball spins as it falls; while it is fast, two faint copies trail it
      place(ballRef.current, b.y, b.squash);
      ghostRefs.current.forEach((g, i) => {
        const lag = (i + 1) * 45;
        place(g, ballAt(plan, ms - lag).y, 0, !b.landed && ms > lag ? 0.22 / (i + 1) : 0);
      });
      if (shadowRef.current) {                                 // its shadow on the floor grows as it comes down
        const near = Math.max(0, 1 - (plan.floor - b.y) / 1.2);
        shadowRef.current.style.opacity = String(near * 0.55);
        shadowRef.current.style.transform = `translate(-50%, -50%) scale(${0.35 + 0.65 * near})`;
      }
      if (b.landed && !fired) {
        fired = true;
        setLanded(true);
        landedRef.current();
        if (!reduce && root.animate) {
          root.animate([{ transform: "translateY(0)" }, { transform: "translateY(7px)" }, { transform: "translateY(-3px)" },
                        { transform: "translateY(0)" }], { duration: 260, easing: "ease-out" });
        }
      }
      if (ms < plan.settleMs + 60) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e: KeyboardEvent) => { if (["Enter", " "].includes(e.key)) skipRef.current = true; };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); };
  }, [plan]);

  const { H, L, top } = geo;
  const floorPx = top + plan.floor * L;
  return (
    <div className="drop" ref={rootRef} data-testid="ball-drop" onPointerDown={() => { skipRef.current = true; }}>
      <div className="drop-track" ref={trackRef} style={{ height: floorPx + H * 0.4 }}>
        <div className="drop-sky" style={{ height: top }} />
        {TIERS.slice(0, plan.floor).map((t) => (
          <div key={t.tier} className={`drop-level ${t.tier >= 4 ? "deep" : ""} ${landed && t.tier === plan.floor ? "hit" : ""}`}
               style={{ top: top + (t.tier - 1) * L, height: L, background: levelShade(t.tier), ["--tier" as string]: t.color }}>
            <div className="drop-label">
              <TierBadge tier={t.tier} size={30} />
              <span className="drop-name">{t.name}</span>
              <span className="drop-pts">{t.points} PTS</span>
            </div>
          </div>
        ))}
        <div className="drop-floor" style={{ top: floorPx }} />
        <span className="drop-shadow" ref={shadowRef} style={{ top: floorPx + 2 }} />
        {[0, 1].map((i) => (
          <div key={i} className="drop-ball ghost" ref={(el) => { ghostRefs.current[i] = el; }}><span className="spin"><Ball size={R * 2} /></span></div>
        ))}
        <div className="drop-ball" ref={ballRef}><span className="spin"><Ball size={R * 2} /></span></div>
        {landed && [-1, 1].map((side) => (                     // dust kicked up either side of the impact
          <motion.span key={side} className="drop-dust" style={{ top: floorPx - 10 }}
                       initial={{ x: "-50%", opacity: 0.7, scale: 0.4 }}
                       animate={{ x: `calc(-50% + ${side * 70}px)`, y: -18, opacity: 0, scale: 1.3 }}
                       transition={{ duration: 0.65, ease: "easeOut" }} />
        ))}
      </div>
    </div>
  );
}
