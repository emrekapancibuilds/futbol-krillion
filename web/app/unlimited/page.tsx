import type { Metadata } from "next";
import Link from "next/link";

import SiteHeader from "@/components/SiteHeader";
import UnlimitedHub from "@/components/UnlimitedHub";

export const metadata: Metadata = { title: "Futkrill Unlimited" };

export default function Unlimited() {
  return (
    <main className="shell">
      <SiteHeader>
        <Link className="navlink" href="/">Daily</Link>
        <Link className="navlink hide-narrow" href="/niche">Niche-o-meter</Link>
      </SiteHeader>
      <div className="middle">
        <UnlimitedHub />
      </div>
      <footer className="small"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link></footer>
    </main>
  );
}
