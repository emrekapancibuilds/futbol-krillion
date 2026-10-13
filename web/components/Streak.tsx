"use client";

// The streak flame (user, 2026-10-13): a pixel-art flame, drawn in the game's own style rather than as an emoji.
// StreakBadge lights it (pop in, flicker, bigger as the streak grows); StreakLost plays it burning out.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { FLAME } from "@/lib/game/flame-art.ts";
import { bonusForStreak } from "@/lib/game/streak.ts";

const LIT = { r: "#e8412b", o: "#ff9a1f", y: "#ffe45c" };
const OUT = { r: "#4a4f66", o: "#6c7390", y: "#9aa1bb" };

export function Flame({ size = 32, burnt = false }: { size?: number; burnt?: boolean }) {
  const colors = burnt ? OUT : LIT;
  return (
    <svg width={size * 0.75} height={size} viewBox="0 0 12 16" shapeRendering="crispEdges" aria-hidden="true" style={{ overflow: "visible" }}>
      {FLAME.flatMap((row, y) => [...row].map((c, x) => (c === "." ? null :
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[c as keyof typeof LIT]} />)))}
    </svg>
  );
}

/** The lit flame with the streak count and what the next correct answer is worth. */
export function StreakBadge({ streak }: { streak: number }) {
  const still = useReducedMotion();
  const grow = 1 + 0.07 * Math.min(streak, 6);
  return (
    <AnimatePresence>
      {streak > 0 && (
        <motion.div key="flame" className="streak-badge" data-testid="streak-flame" aria-label={`Streak of ${streak}`}
                    initial={still ? false : { scale: 0, rotate: -14, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={still ? { opacity: 0 } : { scale: 0.2, y: 8, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 14 }}>
          <motion.span className="flame" style={{ originY: 1, display: "inline-flex", marginLeft: -3, marginRight: 1 }}
                       animate={still ? { scale: grow } : { scaleY: [grow, grow * 1.1, grow * 0.95, grow * 1.07, grow],
                                                            scaleX: [grow, grow * 0.95, grow * 1.03, grow * 0.97, grow] }}
                       transition={still ? { duration: 0 } : { repeat: Infinity, duration: 0.8, ease: "easeInOut" }}>
            <Flame size={26} />
          </motion.span>
          <span className="streak-count">x{streak}</span>
          <span className="streak-next">NEXT +{bonusForStreak(streak + 1)}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shown when a pass or a timeout breaks a streak: the flame swells, then shrinks to grey embers and smoke. */
export function StreakLost({ was }: { was: number }) {
  const still = useReducedMotion();
  return (
    <div className="streak-lost" data-testid="streak-lost" role="status">
      {!still && (
        <span className="flame-out" aria-hidden="true">
          <motion.span style={{ display: "inline-flex", originY: 1 }}
                       initial={{ scale: 1, y: 0, opacity: 1, filter: "grayscale(0) brightness(1)" }}
                       animate={{ scale: [1, 1.3, 0.25], y: [0, -4, 10], opacity: [1, 1, 0],
                                  filter: ["grayscale(0) brightness(1)", "grayscale(0) brightness(1.5)", "grayscale(1) brightness(0.5)"] }}
                       transition={{ duration: 1.2, times: [0, 0.25, 1], ease: "easeOut" }}>
            <Flame size={32} />
          </motion.span>
          {[0, 1, 2].map((i) => (
            <motion.i key={i} className="smoke" initial={{ opacity: 0, y: 0, x: (i - 1) * 4 }}
                      animate={{ opacity: [0, 0.7, 0], y: -26 - i * 8, x: (i - 1) * 10 }}
                      transition={{ duration: 1.2, delay: 0.35 + i * 0.12 }} />
          ))}
        </span>
      )}
      <motion.span className="streak-lost-text" initial={still ? false : { opacity: 0, x: -8 }}
                   animate={{ opacity: 1, x: still ? 0 : [-8, 6, -4, 3, 0] }} transition={{ duration: 0.5, delay: still ? 0 : 0.2 }}>
        STREAK LOST <small>x{was}</small>
      </motion.span>
    </div>
  );
}
