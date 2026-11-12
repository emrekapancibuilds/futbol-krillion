import type { Metadata } from "next";
import Link from "next/link";

import DailyCountdown from "@/components/DailyCountdown";
import UnlimitedPanel from "@/components/UnlimitedPanel";

export const metadata: Metadata = { title: "Futkrill Unlimited" };

// Free for everyone (owner, 2026-11-12): the Unlimited card first, today's daily countdown under it.
export default function Unlimited() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futkrill" style={{ height: 44 }} /></Link>
      </header>
      <div className="middle">
        <UnlimitedPanel />
        <DailyCountdown />
      </div>
      <footer className="small"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></footer>
    </main>
  );
}
