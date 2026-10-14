"use client";

// "How you stack up": the field's scores as a blocky pixel curve, the player's total as a gold marker, and the
// share of players they beat. The numbers are a MOCK for now (lib/standings.ts).

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

import { mockStandings } from "@/lib/standings.ts";

const VW = 280;          // viewBox width
const CH = 78;           // chart height, above the axis line
const fmt = (n: number) => n.toLocaleString("en-US");
const BAR_STAGGER = 0.014;   // seconds between neighbouring bars rising, left to right
const BAR_RISE = 0.4;

export default function Standing({ seed, score, field }: { seed: string; score: number; field: (players: string) => string }) {
  const s = mockStandings(seed, score);
  const youX = Math.min(VW - 1, (score / s.max) * VW);
  const barW = VW / s.curve.length;
  const [shown, setShown] = useState(0);
  const still = useReducedMotion() ?? false;
  // The curve rises bar by bar, then the marker slides in while the percentage counts up.
  const markerDelay = still ? 0 : s.curve.length * BAR_STAGGER + BAR_RISE * 0.6;

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const wait = setTimeout(() => {
      const t0 = performance.now();
      id = setInterval(() => {
        const u = Math.min(1, (performance.now() - t0) / 900);
        setShown(Math.round(s.percentile * (1 - (1 - u) * (1 - u))));
        if (u >= 1) clearInterval(id);
      }, 30);
    }, markerDelay * 1000);
    return () => { clearTimeout(wait); clearInterval(id); };
  }, [s.percentile, markerDelay]);

  const step = s.max <= 300 ? 50 : s.max <= 600 ? 100 : s.max <= 1200 ? 200 : 500;   // round axis labels
  const ticks = Array.from({ length: Math.floor(s.max / step) + 1 }, (_, i) => i * step);
  return (
    <div className="standing">
      <div className="muted standing-head">HOW YOU STACK UP</div>
      <svg viewBox={`0 -14 ${VW} ${CH + 30}`} shapeRendering="crispEdges" role="img"
           aria-label={`Better than ${s.percentile}% of ${fmt(s.players)} players`}>
        {s.curve.map((v, i) => {
          const h = Math.max(1, Math.round(v * (CH - 6)));
          const x = Math.floor(i * barW);
          const beaten = (i + 1) * barW <= youX;
          return (
            <motion.g key={i} style={{ originY: 1, transformBox: "fill-box" }} initial={still ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }} transition={{ delay: i * BAR_STAGGER, duration: BAR_RISE, ease: "easeOut" }}>
              <rect x={x} y={CH - h} width={Math.ceil(barW)} height={h} className={beaten ? "bar-beaten" : "bar-rest"} />
              <rect x={x} y={CH - h} width={Math.ceil(barW)} height={2} className="bar-top" />
            </motion.g>
          );
        })}
        <rect x={0} y={CH} width={VW} height={1} className="axis" />
        {ticks.map((t) => (
          <text key={t} x={Math.min(VW - 2, Math.max(2, (t / s.max) * VW))} y={CH + 11}
                textAnchor={t === 0 ? "start" : t === s.max ? "end" : "middle"} className="tick">{fmt(t)}</text>
        ))}
        <motion.g initial={still ? false : { x: 0, opacity: 0 }} animate={{ x: youX, opacity: 1 }}
                  transition={{ x: { type: "spring", stiffness: 60, damping: 14, delay: markerDelay },
                                opacity: { duration: 0.2, delay: markerDelay } }}>
          <rect x={-1} y={4} width={2} height={CH - 4} className="you-line" />
          <rect x={-4} y={2} width={8} height={8} className="you-dot" />
          <text x={0} y={-3} textAnchor="middle" className="you-label">YOU</text>
        </motion.g>
      </svg>
      <div className="standing-line">BETTER THAN {shown}% OF {field(fmt(s.players))}</div>
    </div>
  );
}
