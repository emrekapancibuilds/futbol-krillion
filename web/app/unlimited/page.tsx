import type { Metadata } from "next";
import Link from "next/link";

import SubscriptionPanel from "@/components/SubscriptionPanel";

export const metadata: Metadata = { title: "Futbol Krillion Unlimited" };

const PERKS = [
  "Keep playing after today's daily: sets of 7, as many as you like",
  "Pick a round type: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League or International",
  "Every league and club in the game, from Wrexham to Hajduk Split",
  "Harder national teams and two-club combos",
  "No ads",
];

export default function Unlimited() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futbol Krillion" style={{ height: 44 }} /></Link>
      </header>
      <div className="middle">
        <section className="panel stack" style={{ gap: 16 }}>
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
        </section>
        <SubscriptionPanel />
      </div>
      <footer className="small"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></footer>
    </main>
  );
}
