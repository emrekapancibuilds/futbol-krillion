"use client";

// The streak flame (user, 2026-10-13; flat vector since 2026-10-18), never an emoji. StreakBadge lights it (pops in,
// flickers gently, grows a little with the streak); StreakLost shows it going out.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { bonusForStreak } from "@/lib/game/streak.ts";

import { Flame } from "./Brand.tsx";

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
          <motion.span className="flame" style={{ originY: 1, display: "inline-flex" }}
                       animate={still ? { scale: grow } : { scaleY: [grow, grow * 1.06, grow * 0.97, grow] }}
                       transition={still ? { duration: 0 } : { repeat: Infinity, duration: 1.4, ease: "easeInOut" }}>
            <Flame size={26} />
          </motion.span>
          <span className="streak-count">x{streak}</span>
          <span className="streak-next">NEXT +{bonusForStreak(streak + 1)}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shown when a pass or a timeout breaks a streak: the flame goes grey and shrinks away. */
export function StreakLost({ was }: { was: number }) {
  const still = useReducedMotion();
  return (
    <div className="streak-lost" data-testid="streak-lost" role="status">
      <motion.span style={{ display: "inline-flex", originY: 1 }} initial={still ? false : { scale: 1, opacity: 1 }}
                   animate={still ? { opacity: 0.6 } : { scale: [1, 1.1, 0.6], opacity: [1, 1, 0.5] }}
                   transition={{ duration: 0.9, ease: "easeOut" }}>
        <Flame size={24} out />
      </motion.span>
      <motion.span className="streak-lost-text" initial={still ? false : { opacity: 0, x: -8 }}
                   animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: still ? 0 : 0.15 }}>
        STREAK LOST <small>x{was}</small>
      </motion.span>
    </div>
  );
}
