import Link from "next/link";

// Shared frame for the Privacy, Terms and Refunds pages: logo, one long panel, links between them.

export const CONTACT = "emre.kapanci@gmail.com";   // public on every legal page (owner's choice, 2026-10-11)

export function Mail() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

export default function LegalPage({ title, effective, children }: { title: string; effective: string; children: React.ReactNode }) {
  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futbol Krillion" style={{ height: 44 }} /></Link>
      </header>
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
    </main>
  );
}
