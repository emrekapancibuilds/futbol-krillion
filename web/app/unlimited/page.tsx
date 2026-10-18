import type { Metadata } from "next";
import Link from "next/link";

import UnlimitedHub from "@/components/UnlimitedHub";

export const metadata: Metadata = { title: "Futkrill Unlimited" };

export default function Unlimited() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futkrill" style={{ height: 44 }} /></Link>
      </header>
      <div className="middle">
        <UnlimitedHub />
      </div>
      <footer className="small"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link></footer>
    </main>
  );
}
