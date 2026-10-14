"use client";

// "Today's daily" card for subscribers on /unlimited: a live countdown to the next daily, like the one at the end of
// the daily, plus a way into today's daily while it's still unplayed.

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { countdown } from "@/lib/game/countdown.ts";
import { dayLabel } from "@/lib/game/dayLabel.ts";
import { progressKey, type DayInfo } from "@/lib/game/types.ts";

function playedAll(day: DayInfo): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(day)) ?? "null") as { results?: unknown[] } | null;
    return (saved?.results?.length ?? 0) >= day.rounds;
  } catch {
    return false;
  }
}

export default function DailyCountdown() {
  const [day, setDay] = useState<DayInfo | null>(null);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/daily", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DayInfo>) : null))
      .then((d) => { if (d) { setDay(d); setDone(playedAll(d)); } })
      .catch(() => { /* no daily today: the card stays hidden */ });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  if (!day) return null;
  return (
    <motion.section className="panel stack daily-countdown" aria-label="Today's daily" style={{ gap: 12 }}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="muted">TODAY&apos;S DAILY · {dayLabel(day.date).toUpperCase()}</div>
      {done && <p>You&apos;ve played today&apos;s daily.</p>}
      <p className="countdown-line">Next daily in <strong className="countdown">{countdown(new Date(day.nextAt).getTime() - now)}</strong></p>
      {!done && <Link className="btn" href="/">PLAY TODAY&apos;S DAILY</Link>}
    </motion.section>
  );
}
