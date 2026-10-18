import Link from "next/link";

// Shared frame for the Privacy, Terms and Refunds pages: the header, one long card, links between them.

import { RESTORE_BY_EMAIL, SUPPORT_EMAIL } from "@/lib/support.ts";

import SiteHeader from "./SiteHeader.tsx";

export const CONTACT = SUPPORT_EMAIL;
export { RESTORE_BY_EMAIL };

export function Mail() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

export default function LegalPage({ title, effective, children }: { title: string; effective: string; children: React.ReactNode }) {
  return (
    <main className="shell">
      <SiteHeader />
      <div className="middle">
      <article className="panel legal">
        <h1 className="title">{title}</h1>
        <p className="muted effective">Effective {effective}</p>
        {children}
        <p className="legal-links">
          <Link className="linkish" href="/">Back to the game</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
        </p>
      </article>
      </div>
    </main>
  );
}
