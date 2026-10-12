'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DayInfo } from '@/lib/game/types.ts';
export type BillingStatus = { premium: boolean; canManage: boolean; configured: boolean; restoreAvailable: boolean;
  status: string; purchasedAt: string | null };
let sessionRequest: Promise<BillingStatus> | null = null;
export function billingSession() {
  if (!sessionRequest) sessionRequest = billingRequest<BillingStatus>('/api/billing/session').finally(() => { sessionRequest = null; });
  return sessionRequest;
}
export async function billingRequest<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Please try again.');
  return data as T;
}
export default function SubscriptionPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [archive, setArchive] = useState<{ number: number; date: string }[] | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);
  const refresh = useCallback(() => {
    // Coalesce focus events and Strict Mode effects so anonymous cookie creation
    // cannot race with another bootstrap response or an upgrade click.
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try { setStatus(await billingSession()); }
      catch { setStatus(null); }
      finally { setLoading(false); refreshing.current = null; }
    })();
    return refreshing.current;
  }, []);
  useEffect(() => { void refresh(); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, [refresh]);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function redirect(endpoint: string) { void run(async () => { const result = await billingRequest<{url:string}>(endpoint, {}); window.location.assign(result.url); }); }
  function play(mode: 'practice' | 'archive', day?: number) {
    if (!status?.premium) { setMessage('Unlimited unlocks practice and the daily archive for $4.99, paid once.'); return; }
    void run(async () => { if (mode === 'practice') { router.push('/unlimited/play'); return; }
      const next = await billingRequest<DayInfo>('/api/games', {mode, day});
      sessionStorage.setItem('fk:archive', JSON.stringify(next)); router.push('/archive/play'); });
  }
  function restore(event: FormEvent) {
    event.preventDefault();
    void run(async () => { const result = await billingRequest<{message:string}>('/api/billing/restore/request', {email}); setMessage(result.message); });
  }
  return <section className="panel stack subscription" aria-label="Soccer Krillion Unlimited">
    <div className="billing-heading"><strong className="title">UNLIMITED</strong>{status?.premium && <span className="premium-badge">ACTIVE</span>}</div>
    {status?.premium ? <>
      <p className="muted">Unlimited is yours. Play as many sets as you like.</p>
    </> : <>
      <div className="creator-note">
        <p>Hey, I&apos;m Emre. I made Futbol Krillion for people who know their football a little too well.</p>
        <p>Done with the daily? Keep playing, in whichever league or competition you know best. Your purchase also helps me keep building the game.</p>
        <p>Thanks for playing. — Emre</p>
      </div>
      <p>Unlimited practice + every previous daily.</p>
      <p className="price">$4.99 USD · pay once</p>
      <p className="muted billing-terms">One payment unlocks Unlimited. No recurring charges. Applicable taxes are shown at checkout. No account required.</p>
      <button className="btn" disabled={busy || loading} onClick={() => redirect('/api/billing/checkout')}>{busy ? 'PLEASE WAIT…' : 'UNLOCK UNLIMITED — $4.99'}</button>
    </>}
    <div className="billing-actions">
      <button className="btn secondary" disabled={busy} onClick={() => play('practice')}>PRACTICE</button>
      <button className="btn secondary" disabled={busy} onClick={() => {
        if (!status?.premium) { setMessage('Upgrade to Unlimited to open the daily archive.'); return; }
        void run(async () => setArchive((await billingRequest<{days:{number:number;date:string}[]}>('/api/archive')).days));
      }}>DAILY ARCHIVE</button>
    </div>
    {archive && <div className="archive-list" aria-label="Previous daily puzzles">
      {archive.length === 0 ? <p className="muted">The first daily is today. Previous puzzles will appear here tomorrow.</p> : archive.map(day =>
        <button key={day.number} className="btn secondary" disabled={busy} onClick={() => play('archive', day.number)}>#{day.number} · {day.date}</button>)}
    </div>}
    <div className="billing-links">
      <Link className="linkish" href="/">Today’s free daily</Link>
      {status?.canManage && <button className="linkish" disabled={busy} onClick={() => redirect('/api/billing/portal')}>View receipt</button>}
      <button className="linkish" onClick={() => setRestoreOpen(v => !v)} aria-expanded={restoreOpen}>Restore Purchase</button>
      <button className="linkish" disabled={busy} onClick={() => void run(refresh)}>Refresh status</button>
    </div>
    {restoreOpen && <form className="stack restore-form" onSubmit={restore}>
      <label htmlFor="restore-email">Email used at checkout</label>
      <input id="restore-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} />
      <button className="btn secondary" disabled={busy}>SEND RESTORE LINK</button>
      <p className="muted billing-terms">Welcome back. We’ll email a secure link to reconnect your purchase. No password to remember.</p>
    </form>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>;
}
