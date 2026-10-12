'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { billingRequest, type BillingStatus } from './SubscriptionPanel';
export default function BillingReturn({kind}: {kind:'success'|'cancel'|'restore'}) {
  const [message,setMessage] = useState(kind === 'success' ? 'Verifying your purchase…' : kind === 'cancel' ? 'Checkout canceled. Your free daily is ready whenever you are.' : 'Verify your email to restore your purchase to this browser.');
  const [premium,setPremium] = useState(false);
  const [token,setToken] = useState('');
  const [accessToken,setAccessToken] = useState('');
  const [busy,setBusy] = useState(false);
  const restoreInitialized = useRef(false);
  useEffect(() => {
    if (kind === 'restore') {
      // Strict Mode replays effects. Keep proof in memory after clearing the URL.
      if (restoreInitialized.current) return;
      restoreInitialized.current = true;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const value = new URLSearchParams(window.location.search).get('request') ?? '';
      const proof = fragment.get('access_token') ?? '';
      setToken(value); setAccessToken(proof);
      // Discard the Supabase refresh token; this app keeps its own HttpOnly session.
      window.history.replaceState(null,'',window.location.pathname);
      if (fragment.has('error')) setMessage('This email link has expired or was already used. Request a new Restore Purchase link.');
      else if (!value || !proof) setMessage('This link is missing its verification details. Request a new Restore Purchase link.');
      return;
    }
    if (kind !== 'success') return;
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) { setMessage('No checkout was specified. Use Restore Purchase if you already paid.'); return; }
    let canceled = false; let timeout: ReturnType<typeof setTimeout>; let attempts = 0;
    const verify = async () => {
      try {
        const result = await billingRequest<BillingStatus>('/api/billing/checkout/confirm', {sessionId});
        if (canceled) return;
        setPremium(result.premium);
        if (result.premium) { setMessage('Thank you for supporting the game. Unlimited is unlocked — you’re ready to play.'); window.history.replaceState(null,'',window.location.pathname); }
        else if (++attempts < 8) timeout=setTimeout(verify,2000);
        else setMessage('Your payment is still being confirmed. Return to the game and refresh your status shortly.');
      } catch(error) {
        if (canceled) return;
        const detail = error instanceof Error ? error.message : 'Verification is temporarily unavailable.';
        // Checkout and its webhook can arrive together. Let the customer lock
        // finish instead of turning that normal race into a failed success page.
        if (detail.includes('Another request is in progress') && ++attempts < 8) {
          timeout = setTimeout(verify, 2000);
        } else setMessage(detail);
      }
    };
    void verify(); return () => { canceled=true; clearTimeout(timeout); };
  },[kind]);
  async function restore() {
    setBusy(true);
    try {
      const result = await billingRequest<BillingStatus & {message:string}>('/api/billing/restore/verify', {token, accessToken});
      setPremium(result.premium); setMessage(result.message); setToken(''); setAccessToken('');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Could not restore your purchase.'); }
    finally { setBusy(false); }
  }
  return <main className="shell"><div className="middle"><section className="panel stack">
    <img className="pixel" src="/art/logo.png" alt="Futkrill" style={{width:180,maxWidth:'100%'}} />
    <h1 className="title">{premium ? 'UNLIMITED ACTIVE' : kind === 'restore' ? 'RESTORE PURCHASE' : kind === 'cancel' ? 'BACK TO THE PITCH' : 'YOUR PURCHASE'}</h1>
    <p role="status" aria-live="polite">{message}</p>
    {kind === 'restore' && token && accessToken && <button className="btn" disabled={busy} onClick={restore}>{busy ? 'VERIFYING…' : 'RESTORE TO THIS BROWSER'}</button>}
    <Link className="btn billing-back" href={premium ? "/unlimited/play" : "/"}>{premium ? 'PLAY UNLIMITED' : 'RETURN TO THE GAME'}</Link>
    <p className="muted billing-terms">Need access on another device? Choose Restore Purchase in the game and use your payment email.</p>
  </section></div></main>;
}
