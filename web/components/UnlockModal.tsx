"use client";

// The pop-up people get when they arrive on /unlimited without having paid: the whole pitch, which they close
// (X, Escape, or a click outside) to reach the page behind it (user, 2026-10-12).

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import UnlockPitch from "@/components/UnlockPitch";
import { startCheckout } from "@/components/SubscriptionPanel";

export default function UnlockModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  async function unlock() {
    if (busy) return;
    setBusy(true); setError("");
    try { await startCheckout(); }                                  // leaves for Stripe; stay busy until the page goes
    catch (e) { setBusy(false); setError(e instanceof Error ? e.message : "Please try again."); }
  }

  if (!mounted) return null;
  return createPortal(
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="panel modal stack unlock-modal" role="dialog" aria-modal="true" aria-label="Unlock Unlimited" style={{ gap: 16 }}
                  initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }} onClick={(e) => e.stopPropagation()}>
        <div className="billing-heading">
          <strong className="title">UNLIMITED</strong>
          <button className="modal-close" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <UnlockPitch busy={busy} onUnlock={unlock} />
        {error && <p role="alert">{error}</p>}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
