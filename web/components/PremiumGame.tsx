'use client';
import { useEffect, useRef, useState } from 'react';
import Game from './Game';
import SubscriptionPanel, { billingSession } from './SubscriptionPanel';

export default function PremiumGame({ mode }: { mode: 'unlimited' | 'archive' }) {
  const [premium, setPremium] = useState<boolean | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  useEffect(() => {
    const refresh = () => {
      if (pending.current) return;
      pending.current = billingSession()
        .then(value => setPremium(value.premium)).catch(() => setPremium(false))
        .finally(() => { pending.current = null; });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  if (premium) return <Game mode={mode} />;
  return <main className="shell"><div className="middle">
    {premium === null ? <p className="panel" role="status">Checking Unlimited access…</p> : <SubscriptionPanel />}
  </div></main>;
}
