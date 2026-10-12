"use client";

// /unlimited. Subscribers get their Unlimited card first and today's daily countdown under it (user, 2026-10-12);
// everyone else gets the pitch as a pop-up first, then what Unlimited offers and the upgrade panel under it. Until the billing status is known, only the
// panel shows, so subscribers never see the sales pitch flash by.

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import DailyCountdown from "@/components/DailyCountdown";
import UnlockModal from "@/components/UnlockModal";
import SubscriptionPanel, { type BillingStatus } from "@/components/SubscriptionPanel";

// Only what Unlimited really has: people pay for these lines.
const PERKS = [
  "Keep playing after today's daily: sets of 7, as many as you like",
  "Pick a round type: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League or International",
  "Play every previous daily in the archive",
];

function Perks() {
  return (
    <motion.section className="panel stack" style={{ gap: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img className="pixel" src="/art/mascot.png" alt="" style={{ width: 84 }} />
        <div>
          <div className="led" style={{ display: "inline-block" }}>UNLIMITED</div>
          <h1 className="title" style={{ marginTop: 10 }}>Out of dailies? Keep playing.</h1>
        </div>
      </div>
      <ul className="perks">
        {PERKS.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <Link className="linkish" href="/" style={{ textAlign: "center" }}>Back to today&apos;s daily</Link>
    </motion.section>
  );
}

export default function UnlimitedHub() {
  // undefined while loading; null when the status couldn't be read (treated as not subscribed)
  const [status, setStatus] = useState<BillingStatus | null | undefined>(undefined);
  const known = status !== undefined;
  const premium = status?.premium === true;
  // Everyone who hasn't paid gets the pitch as a pop-up each time they arrive; closing it leaves the page as it is.
  const [dismissed, setDismissed] = useState(false);
  return (
    <>
      <AnimatePresence>{known && !premium && !dismissed && <UnlockModal onClose={() => setDismissed(true)} />}</AnimatePresence>
      {known && !premium && <Perks />}
      <SubscriptionPanel onStatus={setStatus} />
      {premium && <DailyCountdown />}
    </>
  );
}
