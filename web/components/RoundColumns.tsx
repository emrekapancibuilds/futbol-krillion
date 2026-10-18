"use client";

import { motion } from "framer-motion";

import { columnLevel } from "@/lib/game/columns.ts";
import { TIER_COLORS, TIERS, tierInfo } from "@/lib/tiers.ts";

import type { Result } from "./Game.tsx";

const fmt = (n: number) => n.toLocaleString("en-US");

/** How a set went, as seven columns that grow up from the floor: the rarer the answer, the taller the column, with
 *  the tier's badge on top. Gridlines mark each tier's points. Tap a column for the full list of answers. */
export default function RoundColumns({ results, onOpen }: { results: Result[]; onOpen: (i: number) => void }) {
  return (
    <div className="colchart">
      <div className="plot">
        <div className="grid-layer" aria-hidden>
          {TIERS.map((t) => (
            <div key={t.tier} className="gridline" style={{ ["--lvl" as string]: t.tier }}><span>{fmt(t.points)}</span></div>
          ))}
        </div>
        <div className="cols">
          {results.map((r, i) => {
            const level = columnLevel(r);
            const info = level ? tierInfo(level) : null;
            const colors = level ? TIER_COLORS[level] : null;
            return (
              <button key={i} className="col" onClick={() => onOpen(i)} data-testid={`column-${i + 1}`} data-level={level}
                      aria-label={`Round ${i + 1}: ${info ? info.name : r.status === "passed" ? "passed" : "no answer"}. See all answers`}>
                <span className="colstage">
                  {info ? <img className="pixel badge" src={info.icon} alt="" /> : <span className="badge miss">-</span>}
                  <motion.span className={`colbar ${level ? "" : "stub"}`}
                               style={{ ["--lvl" as string]: level, ["--light" as string]: colors?.light, ["--wall" as string]: colors?.wall }}
                               initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                               transition={{ duration: 0.55, delay: 0.08 * i, ease: [0.2, 0.9, 0.3, 1] }} />
                </span>
                <span className="num">{i + 1}</span>
                <span className="pts">{fmt(r.points)}</span>
                {!!r.bonus && <small className="tile-bonus">+{fmt(r.bonus)}</small>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 14 }}>Tap a column to see all the answers.</div>
    </div>
  );
}
