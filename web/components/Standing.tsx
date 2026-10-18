"use client";

// "How you stack up": the field's scores as a smooth curve, the player's total as a marker, and the share of players
// they beat. The numbers are a MOCK for now (lib/standings.ts).

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useState } from "react";

import { mockStandings } from "@/lib/standings.ts";

const VW = 280;          // viewBox width
const CH = 78;           // chart height, above the axis line
const fmt = (n: number) => n.toLocaleString("en-US");
const DRAW = 0.7;            // seconds for the curve to draw in

export default function Standing({ seed, score, field }: { seed: string; score: number; field: (players: string) => string }) {
  const s = mockStandings(seed, score);
  const youX = Math.min(VW - 1, (score / s.max) * VW);
  const [shown, setShown] = useState(0);
  const still = useReducedMotion() ?? false;
  const clip = useId().replace(/:/g, "");
  // The curve draws in, then the marker slides in while the percentage counts up.
  const markerDelay = still ? 0 : DRAW * 0.8;
  const pts = s.curve.map((v, i) => [((i + 0.5) / s.curve.length) * VW, CH - v * (CH - 6)] as const);
  const line = `M 0 ${CH} ` + pts.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + ` L ${VW} ${CH}`;

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
      <svg viewBox={`0 -14 ${VW} ${CH + 30}`} role="img"
           aria-label={`Better than ${s.percentile}% of ${fmt(s.players)} players`}>
        <defs><clipPath id={clip}><rect x={0} y={-14} width={youX} height={CH + 14} /></clipPath></defs>
        <motion.g initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DRAW, ease: "easeOut" }}>
          <path d={line + " Z"} className="area-rest" />
          <path d={line + " Z"} className="area-beaten" clipPath={`url(#${clip})`} />
          <path d={line} className="curve" />
        </motion.g>
        <line x1={0} y1={CH} x2={VW} y2={CH} className="axis" />
        {ticks.map((t) => (
          <text key={t} x={Math.min(VW - 2, Math.max(2, (t / s.max) * VW))} y={CH + 11}
                textAnchor={t === 0 ? "start" : t === s.max ? "end" : "middle"} className="tick">{fmt(t)}</text>
        ))}
        <motion.g initial={still ? false : { x: 0, opacity: 0 }} animate={{ x: youX, opacity: 1 }}
                  transition={{ x: { type: "spring", stiffness: 60, damping: 14, delay: markerDelay },
                                opacity: { duration: 0.2, delay: markerDelay } }}>
          <line x1={0} y1={6} x2={0} y2={CH} className="you-line" />
          <circle cx={0} cy={6} r={4.5} className="you-dot" />
          <text x={0} y={-3} textAnchor="middle" className="you-label">YOU</text>
        </motion.g>
      </svg>
      <div className="standing-line">BETTER THAN {shown}% OF {field(fmt(s.players))}</div>
    </div>
  );
}
