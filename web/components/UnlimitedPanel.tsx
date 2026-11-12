'use client';

// The Unlimited card on /unlimited: free for everyone (owner, 2026-11-12: "get rid of payments"). PRACTICE opens
// Unlimited sets; DAILY ARCHIVE lists every previous daily. Yellow buttons so it's obvious they can be clicked
// (owner, 2026-10-12).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { DayInfo } from '@/lib/game/types.ts';

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Please try again.');
  return data as T;
}

export default function UnlimitedPanel() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState<{ number: number; date: string }[] | null>(null);
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  function playArchive(day: number) {
    void run(async () => {
      const next = await request<DayInfo>('/api/games', { mode: 'archive', day });
      sessionStorage.setItem('fk:archive', JSON.stringify(next)); router.push('/archive/play');
    });
  }
  return <section className="panel stack unlimited-panel" aria-label="Futkrill Unlimited">
    <div className="unlimited-heading"><strong className="title">UNLIMITED</strong></div>
    <p className="muted">Keep playing after the daily: sets of 7, as many as you like, and every previous daily in the archive.</p>
    <div className="unlimited-actions">
      <button className="btn" disabled={busy} onClick={() => router.push('/unlimited/play')}>PRACTICE</button>
      <button className="btn" disabled={busy} onClick={() =>
        void run(async () => setArchive((await request<{ days: { number: number; date: string }[] }>('/api/archive')).days))}>DAILY ARCHIVE</button>
    </div>
    {archive && <div className="archive-list" aria-label="Previous daily puzzles">
      {archive.length === 0 ? <p className="muted">The first daily is today. Previous puzzles will appear here tomorrow.</p> : archive.map(day =>
        <button key={day.number} className="btn secondary" disabled={busy} onClick={() => playArchive(day.number)}>#{day.number} · {day.date}</button>)}
    </div>}
    <div className="unlimited-links"><Link className="linkish" href="/">Today’s daily</Link></div>
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>;
}
