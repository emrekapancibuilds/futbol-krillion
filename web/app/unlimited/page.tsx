import type { Metadata } from "next";
import Link from "next/link";

import { UnlockPage } from "@/components/Unlock.tsx";

// Unlimited is a one-time $4.99 purchase (user, 2026-10-12). This page pitches it; devices that already unlocked
// go straight on to /unlimited/play. Unlimited share links point here.
export const metadata: Metadata = { title: "Futbol Krillion Unlimited" };

export default function Unlimited() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futbol Krillion" style={{ height: 44 }} /></Link>
      </header>
      <div className="middle">
        <section className="panel"><UnlockPage /></section>
      </div>
      <footer className="small"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link></footer>
    </main>
  );
}
