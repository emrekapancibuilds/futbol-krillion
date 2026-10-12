import type { Metadata } from "next";
import Link from "next/link";

import { Unlocked } from "@/components/Unlock.tsx";

// Where Stripe Checkout returns buyers (success_url in app/api/checkout/route.ts).
export const metadata: Metadata = { title: "Unlimited unlocked · Futbol Krillion", robots: { index: false } };

export default function UnlockedPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futbol Krillion" style={{ height: 44 }} /></Link>
      </header>
      <div className="middle">
        <section className="panel"><Unlocked /></section>
      </div>
    </main>
  );
}
