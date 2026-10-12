"use client";

// The Unlimited pitch: a personal note from Emre, what Unlimited really includes, UNLOCK FOREVER (Stripe Checkout)
// and restore by email. Shown as a pop-up from the end of the daily, and in place of Unlimited until it's unlocked.
// Only list what Unlimited actually has: people pay for these lines.

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

const UNLOCK_KEY = "fk:unlock";

export function getUnlock(): string | null {
  try { const v = localStorage.getItem(UNLOCK_KEY); return v ? (JSON.parse(v) as string) : null; } catch { return null; }
}
export function setUnlock(token: string) {
  try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(token)); } catch { /* private mode: unlocks for this visit only */ }
}
export function clearUnlock() {
  try { localStorage.removeItem(UNLOCK_KEY); } catch { /* nothing saved */ }
}

const PERKS = [
  "Sets of 7 whenever you like, as many as you like",
  "Pick a round type: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, International or Mixed",
  "Over 200 prompts",
  "Pay once. Restore on any device with the email you paid with",
];

async function post(url: string, body: object): Promise<{ ok: boolean; data: { url?: string; unlock?: string; error?: string } }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: "You seem to be offline. Try again in a moment." } };
  }
}

/** `onClose`: shows "Maybe later" (the pop-up). `onUnlocked`: what to do once a restore works (default: go play). */
export function UnlockCard({ onClose, onUnlocked }: { onClose?: () => void; onUnlocked?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [email, setEmail] = useState("");

  const done = () => (onUnlocked ? onUnlocked() : window.location.assign("/unlimited/play"));

  const buy = async () => {
    setBusy(true); setError(null);
    const { ok, data } = await post("/api/checkout", {});
    if (ok && data.url) { window.location.assign(data.url); return; }   // off to Stripe; stay busy until the page leaves
    setBusy(false); setError(data.error ?? "Couldn't open checkout. Try again.");
  };

  const restore = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { ok, data } = await post("/api/restore", { email });
    setBusy(false);
    if (ok && data.unlock) { setUnlock(data.unlock); done(); }
    else setError(data.error ?? "Couldn't restore. Try again.");
  };

  return (
    <div className="stack unlock" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img className="pixel" src="/art/mascot.png" alt="" style={{ width: 84 }} />
        <div>
          <div className="led" style={{ display: "inline-block" }}>UNLIMITED</div>
          <h2 className="title" style={{ marginTop: 10 }}>Keep playing.</h2>
        </div>
      </div>

      <div className="note">
        <p>Hey, I&apos;m Emre. I made Futbol Krillion for people who know their football a little too well.</p>
        <p>
          Done with the daily? You don&apos;t have to stop there. Unlimited lets you keep going, as many sets as you
          like, in whichever league or competition you&apos;re best at.
        </p>
        <p>
          It&apos;s $4.99, once. No subscription, and it&apos;s yours to keep. It also helps me keep building the game.
        </p>
        <p>Thanks for playing.</p>
        <p className="sign">&mdash; Emre</p>
      </div>

      <ul className="perks">
        {PERKS.map((p) => <li key={p}>{p}</li>)}
      </ul>

      <button className="btn" onClick={buy} disabled={busy}>UNLOCK FOREVER - $4.99</button>
      {error && <p className="unlock-error" role="alert">{error}</p>}

      {restoring ? (
        <form className="restore-row" onSubmit={restore}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="the email you paid with"
                 aria-label="Email you paid with" autoComplete="email" maxLength={254} required autoFocus />
          <button className="btn secondary" disabled={busy || !email.trim()}>RESTORE</button>
        </form>
      ) : (
        <button className="linkish" onClick={() => { setRestoring(true); setError(null); }}>Already paid? Restore your purchase</button>
      )}

      <div className="unlock-foot">
        {onClose ? <button className="linkish" onClick={onClose}>Maybe later</button>
                 : <Link className="linkish" href="/">Back to today&apos;s daily</Link>}
        <span className="muted">Payments by Stripe · <Link href="/refunds">14-day refunds</Link> · <Link href="/terms">Terms</Link></span>
      </div>
    </div>
  );
}

/** The pop-up version. Click outside or press Escape to close. */
export function UnlockModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel modal" role="dialog" aria-modal="true" aria-label="Unlock Unlimited"
                  initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }} onClick={(e) => e.stopPropagation()}>
        <UnlockCard onClose={onClose} />
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** /unlimited: the pitch, or straight on to the game when this device has already unlocked. */
export function UnlockPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (getUnlock()) window.location.replace("/unlimited/play");
    else setReady(true);
  }, []);
  return ready ? <UnlockCard /> : <p className="muted">Loading...</p>;
}

type Check = { state: "checking" } | { state: "done" } | { state: "failed"; error: string };

/** /unlimited/unlocked: Stripe sends buyers here with `session_id`; the server confirms the payment with Stripe and
 *  hands back the unlock token. */
export function Unlocked() {
  const [check, setCheck] = useState<Check>({ state: "checking" });
  useEffect(() => {
    const session = new URLSearchParams(window.location.search).get("session_id") ?? "";
    post("/api/unlock", { session }).then(({ ok, data }) => {
      if (ok && data.unlock) { setUnlock(data.unlock); setCheck({ state: "done" }); }
      else setCheck({ state: "failed", error: data.error ?? "We couldn't confirm the payment." });
    });
  }, []);

  if (check.state === "checking") return <p className="muted">Confirming your payment...</p>;
  if (check.state === "failed") {
    return (
      <div className="stack" style={{ gap: 14 }}>
        <h1 className="title">Almost there</h1>
        <p style={{ margin: 0 }}>{check.error}</p>
        <p className="muted" style={{ margin: 0 }}>
          If you were charged, use &ldquo;Already paid? Restore your purchase&rdquo; with the email you paid with.
        </p>
        <Link className="btn" href="/unlimited">GO TO UNLIMITED</Link>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img className="pixel" src="/art/mascot.png" alt="" style={{ width: 84 }} />
        <div>
          <div className="led" style={{ display: "inline-block" }}>UNLOCKED</div>
          <h1 className="title" style={{ marginTop: 10 }}>Unlimited is yours.</h1>
        </div>
      </div>
      <p style={{ margin: 0 }}>
        Thank you, really. Pick a round type and play as many sets as you like. On another device, restore it with the
        email you paid with.
      </p>
      <Link className="btn" href="/unlimited/play">PLAY UNLIMITED</Link>
    </div>
  );
}
