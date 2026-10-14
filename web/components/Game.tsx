"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { crowdReaction, type Reaction } from "@/lib/crowd-mood.ts";
import { withYou, type TierList } from "@/lib/game/columns.ts";
import { countdown } from "@/lib/game/countdown.ts";
import { currentStreak, roundScore, scoreRound, SET_ROUNDS } from "@/lib/game/streak.ts";
import { shareText, streakAfter } from "@/lib/share.ts";
import { MAX_SCORE, TIER_COLORS, TIERS, tierInfo } from "@/lib/tiers.ts";

import RoundColumns from "./RoundColumns.tsx";
import Standing from "./Standing.tsx";
import { StreakBadge, StreakLost } from "./Streak.tsx";
import { billingSession } from "./SubscriptionPanel";
import TunnelReveal from "./TunnelReveal.tsx";

type DayInfo = { number: number; date: string; rounds: number; nextAt: string; snapshot: string; gameId?: string; mode?: string };
export type Result = { status: "accepted" | "missed" | "passed"; points: number; tier: number | null; name?: string; fact?: string;
                       key: string; prompt?: string;    // prompt: set for Unlimited rounds
                       text?: string;                   // the question, so the answer pop-up can show it at once
                       streak?: number; bonus?: number; lost?: number };   // the streak after this round, its bonus, and the streak it broke
type Live = { round: number; text: string; token: string; previewEnd: number; deadline: number; prompt?: string; bindingVersion?: number };
// Unlimited plays sets of 7 of one round type; it also keeps lifetime totals and the prompts already played.
type Saved = { results: Result[]; live?: Live; category?: string; total?: number; played?: number; sets?: number; seen?: string[] };
type StartResponse = { text: string; previewMs: number; deadline: number; token: string; now: number; prompt?: string; error?: string };
export type Mode = "daily" | "unlimited" | "archive";
const UNLIMITED_KEY = "fk:unlimited";
export const ROUND_TYPES = [
  { key: "mixed", label: "Mixed" },
  { key: "premier-league", label: "Premier League" },
  { key: "la-liga", label: "La Liga" },
  { key: "serie-a", label: "Serie A" },
  { key: "bundesliga", label: "Bundesliga" },
  { key: "ligue-1", label: "Ligue 1" },
  { key: "champions-league", label: "Champions League" },
  { key: "international", label: "International" },
] as const;
const typeLabel = (key?: string) => ROUND_TYPES.find((t) => t.key === key)?.label ?? "Mixed";
type AnswerResponse = { status: "accepted" | "confirm" | "rejected" | "expired" | "invalid"; name?: string; tier?: number; points?: number;
                        fact?: string; proof?: string; suggestion?: string; error?: string };
type PassResponse = { status: "passed" | "invalid"; proof?: string; error?: string };
type RevealResponse = { text?: string; total: number; tiers: TierList[] };

const fmt = (n: number) => n.toLocaleString("en-US");

const store = {
  get<T>(key: string): T | null {
    try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: progress just isn't saved */ }
  },
};

async function post<T>(url: string, body: object): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as T };
}

export default function Game({ mode = "daily" }: { mode?: Mode }) {
  const unlimited = mode === "unlimited";
  const archive = mode === "archive";
  const [day, setDay] = useState<DayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>({ results: [] });
  const [phase, setPhase] = useState<"loading" | "home" | "round" | "result" | "end">("loading");
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState("");
  const [miss, setMiss] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<number | null>(null);
  const [landed, setLanded] = useState(true); // false while the tier reveal runs, so the score is not given away
  const [suggest, setSuggest] = useState<{ asked: string; name: string } | null>(null);  // "Bale -> Gareth Bale?"
  const [passing, setPassing] = useState(false);                                         // "Pass on this one?"
  const [leaving, setLeaving] = useState(false);                                         // "Leave this round?"
  const [mood, setMood] = useState<Reaction | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  // Sound is off for now (user, 2026-10-11). lib/crowd-sound.ts keeps the crowd, cheers, groans and gate smashes
  // ready to wire back in here.

  useEffect(() => { if (suggest || passing) yesRef.current?.focus(); }, [suggest, passing]);

  // The stands react to each round: settled after a missed chance, bouncing faster the better the answer.
  useEffect(() => {
    const b = document.body;
    b.dataset.crowd = mood?.mood ?? "normal";
    if (mood?.beatMs) b.style.setProperty("--crowd-beat", `${mood.beatMs}ms`);
    else b.style.removeProperty("--crowd-beat");
  }, [mood]);

  const react = (status: Result["status"], tier: number | null) => setMood(crowdReaction(status, tier));

  useEffect(() => {
    void billingSession().catch(() => {});
    if (archive) {
      try {
        const selected = JSON.parse(sessionStorage.getItem("fk:archive") ?? "null");
        if (!selected?.gameId) throw new Error();
        setDay(selected);
      } catch { setError("Choose a puzzle from the daily archive first."); setPhase("home"); }
      return;
    }
    fetch("/api/daily")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok && !unlimited) throw new Error(d.error ?? "No daily today.");
        setDay(unlimited ? { number: 0, date: "", rounds: SET_ROUNDS, nextAt: "", snapshot: d.snapshot ?? "" } : d);
      })
      .catch((e: Error) => { setError(e.message); setPhase("home"); });
  }, [unlimited, archive]);

  const storeKey = unlimited ? UNLIMITED_KEY : archive ? `fk:game:${day?.gameId}` : `fk:day:${day?.number}`;

  useEffect(() => {
    if (!day) return;
    let s = store.get<Saved>(storeKey) ?? { results: [] };
    if (unlimited && !s.category) s = { ...s, results: [], live: undefined };   // saved before round types existed
    if (unlimited && s.live && s.live.bindingVersion !== 1) s = { ...s, live: undefined };
    setSaved(s);
    setPhase(s.results.length >= day.rounds ? "end" : s.live ? "round" : "home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useEffect(() => {
    if (phase !== "round" && phase !== "end") return;
    const t = setInterval(() => setNow(Date.now()), phase === "round" ? 100 : 1000);
    return () => clearInterval(t);
  }, [phase]);

  const persist = (s: Saved) => {
    setSaved(s);
    if (day) store.set(storeKey, s);
  };
  const live = saved.live;
  const done = saved.results.length;
  const total = saved.results.reduce((a, r) => a + roundScore(r), 0);
  const slot = (l: Live) => (unlimited ? { prompt: l.prompt } : { day: day!.number, round: l.round, ...(archive ? { gameId: day!.gameId } : {}) });
  const inPreview = !!live && now < live.previewEnd;

  /** `quiet`: the player left mid-round, so no result screen and no crowd reaction; straight back to the start. */
  const finishRound = (r: Result, quiet = false) => {
    const scored: Result = { ...r, text: live?.text, ...scoreRound(saved.results, r.status) };   // streak, bonus and lost streak
    const results = [...saved.results, unlimited ? { ...scored, prompt: live?.prompt } : scored];
    const s: Saved = unlimited
      ? { results, seen: saved.seen, category: saved.category, total: (saved.total ?? 0) + roundScore(scored),
          played: (saved.played ?? 0) + 1, sets: (saved.sets ?? 0) + (results.length >= SET_ROUNDS ? 1 : 0) }
      : { results };
    persist(s);
    setLanded(r.status !== "accepted");
    setSuggest(null); setPassing(false); setLeaving(false);
    if (quiet) setMood(null);
    else if (r.status !== "accepted") react(r.status, null);  // accepted answers react when the tunnel lands
    setPhase(quiet ? (day && results.length >= day.rounds ? "end" : "home") : "result");
    if (day && !unlimited && !archive && s.results.length >= day.rounds) {
      const prev = store.get<{ last: number; streak: number }>("fk:streak");
      store.set("fk:streak", { last: day.number, streak: streakAfter(prev, day.number) });
    }
  };

  useEffect(() => {
    if (phase === "round" && live && now > live.deadline) finishRound({ status: "missed", points: 0, tier: null, key: live.token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, phase, live]);

  useEffect(() => {
    if (phase === "round" && live && !inPreview) inputRef.current?.focus();
  }, [phase, live, inPreview]);

  const start = async (base: Saved = saved) => {
    if (!day || busy) return;
    setBusy(true); setMiss(null); setInput(""); setError(null); setSuggest(null); setPassing(false); setMood(null);
    const round = base.results.length;
    const { ok, data } = unlimited
      ? await post<StartResponse>("/api/unlimited/start", { seen: base.seen ?? [], category: base.category ?? "mixed",
                                                            set: base.results.map((r) => r.prompt).filter(Boolean) })
      : await post<StartResponse>("/api/round/start", { day: day.number, round, ...(archive ? { gameId: day.gameId } : {}) });
    setBusy(false);
    if (!ok) { setError(data.error ?? "Could not start the round."); return; }
    const t0 = Date.now();
    const seen = unlimited && data.prompt ? [...(base.seen ?? []), data.prompt].slice(-2000) : base.seen;
    persist({ ...base, seen, live: { round, text: data.text, token: data.token, previewEnd: t0 + data.previewMs,
                                     deadline: t0 + (data.deadline - data.now), prompt: data.prompt, bindingVersion: 1 } });
    setNow(t0);
    setPhase("round");
  };

  const submit = async (e?: FormEvent, text = input) => {
    e?.preventDefault();
    if (!day || !live || busy || !text.trim() || inPreview) return;
    setBusy(true); setPassing(false);
    const { data } = await post<AnswerResponse>("/api/round/answer", { ...slot(live), input: text, token: live.token });
    setBusy(false);
    if (data.status === "confirm") {
      setMiss(null);
      setSuggest({ asked: text.trim(), name: data.suggestion! });
    } else if (data.status === "accepted") {
      finishRound({ status: "accepted", points: data.points!, tier: data.tier!, name: data.name, fact: data.fact, key: data.proof! });
    } else if (data.status === "expired") {
      finishRound({ status: "missed", points: 0, tier: null, key: data.proof! });
    } else if (data.status === "rejected") {
      setMiss(`"${text.trim()}" isn't on the list. Try again.`);
      setSuggest(null); setInput(""); setShake((k) => k + 1); inputRef.current?.focus();
    } else {
      setError(data.error ?? "Something went wrong with this round.");
    }
  };

  // Not the player they meant: back to the box, text kept so they can add a first name.
  const declineSuggestion = () => { setSuggest(null); inputRef.current?.focus(); };

  const pass = async (quiet = false) => {
    if (!day || !live || busy) return;
    setBusy(true);
    const { data } = await post<PassResponse>("/api/round/pass", { ...slot(live), token: live.token });
    setBusy(false);
    if (data.status === "passed") finishRound({ status: "passed", points: 0, tier: null, key: data.proof! }, quiet);
    else setError(data.error ?? "Something went wrong with this round.");
  };

  // EXIT: mid-round it asks first (the clock can't be paused, so the round counts as a pass); on a result screen it
  // just goes back to the start, where the player can carry on (or, in Unlimited, pick another round type).
  const exit = () => {
    if (phase === "round") { setSuggest(null); setPassing(false); setLeaving(true); }
    else setPhase(day && done >= day.rounds ? "end" : "home");
  };

  const last = saved.results[saved.results.length - 1];
  const next = () => (day && done >= day.rounds ? setPhase("end") : start());
  // Unlimited: a new set of 7 of one round type.
  const startSet = (category: string) => start({ ...saved, category, results: [], live: undefined });

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futkrill" style={{ height: 44 }} /></Link>
        <div className="right">
          {/* Not mid-round: EXIT is the way out then, and the header has no room for both on a 375px phone. */}
          {phase !== "round" && phase !== "result" && <Link className="linkish" href="/unlimited">Unlimited</Link>}
          {(phase === "round" || phase === "result") && <button className="exit" onClick={exit} disabled={busy}>EXIT</button>}
          {day && <div className="led">{unlimited ? "UNLIMITED" : `${archive ? "ARCHIVE " : ""}#${day.number}`} · {fmt(landed ? total : total - (last ? roundScore(last) : 0))}</div>}
        </div>
      </header>

      <div className="middle">
      {error && <div className="panel" role="alert">{error}</div>}

      {phase === "home" && day && (unlimited
        ? <UnlimitedHome saved={saved} onPick={startSet} onContinue={() => start()} busy={busy} />
        : <Home day={day} done={done} onStart={() => start()} busy={busy} />)}

      {phase === "round" && live && day && (
        <section className="panel stack" style={{ gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Pips n={day.rounds} done={done} />
            <StreakBadge streak={currentStreak(saved.results)} />
            <span className="muted" style={{ whiteSpace: "nowrap" }}>{unlimited ? `${typeLabel(saved.category).toUpperCase()} · ` : ""}ROUND {live.round + 1} / {day.rounds}</span>
          </div>
          <h1 className="title">{live.text}</h1>
          {leaving && (
            <div className="confirm" role="alertdialog" aria-label="Leave this round">
              <span className="ask">Leave this round? It counts as a pass.</span>
              <button className="btn" disabled={busy} onClick={() => pass(true)}>YES, LEAVE</button>
              <button className="btn secondary" onClick={() => { setLeaving(false); inputRef.current?.focus(); }}>NO</button>
            </div>
          )}
          {inPreview ? (
            <div className="reel">KICK-OFF IN {Math.max(1, Math.ceil((live.previewEnd - now) / 1000))}</div>
          ) : (
            <>
              <Clock deadline={live.deadline} previewEnd={live.previewEnd} now={now} />
              <motion.form key={shake} className="answer-row" onSubmit={(e) => submit(e)}
                           animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.35 }}>
                <input ref={inputRef} value={input} placeholder="type one answer"
                       onChange={(e) => { setInput(e.target.value); setSuggest(null); }}
                       onKeyDown={(e) => { if (e.key === "Escape") { setSuggest(null); setPassing(false); setLeaving(false); } }}
                       autoComplete="off" autoCorrect="off" spellCheck={false} aria-label="Your answer" maxLength={80} />
                <button className="btn" disabled={busy || !input.trim()}>SHOOT</button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => { setSuggest(null); setPassing(true); }}>PASS</button>
              </motion.form>
              <div aria-live="polite">
                {suggest ? (
                  <div className="confirm">
                    <span className="ask">&quot;{suggest.asked}&quot; &rarr; <strong>{suggest.name}</strong>?</span>
                    <button ref={yesRef} className="btn" disabled={busy} onClick={() => submit(undefined, suggest.name)}>YES</button>
                    <button className="btn secondary" onClick={declineSuggestion}>NO</button>
                  </div>
                ) : passing ? (
                  <div className="confirm">
                    <span className="ask">Pass on this one? You get no points for it.</span>
                    <button ref={yesRef} className="btn" disabled={busy} onClick={() => pass()}>YES, PASS</button>
                    <button className="btn secondary" onClick={() => { setPassing(false); inputRef.current?.focus(); }}>NO</button>
                  </div>
                ) : (
                  <div className="muted" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>{miss}</div>
                )}
              </div>
            </>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Rarer correct answers score more. Back-to-back correct answers build a streak bonus. Wrong guesses cost only time.</p>
        </section>
      )}

      {phase === "result" && last && day && (
        <RoundResult result={last} roundsLeft={day.rounds - done} onNext={next} onAnswers={() => setModal(done - 1)}
                     onLanded={() => { setLanded(true); react("accepted", last.tier); }} />
      )}

      {phase === "end" && day && (unlimited
        ? <UnlimitedEnd saved={saved} total={total} onOpen={setModal} onAgain={() => startSet(saved.category ?? "mixed")}
                        onChange={() => setPhase("home")} busy={busy} />
        : <End day={day} results={saved.results} total={total} now={now} onOpen={setModal} />)}

      </div>

      <AnimatePresence>
        {modal !== null && day && saved.results[modal] && (
          <AnswerList slot={saved.results[modal].prompt ? { prompt: saved.results[modal].prompt } : { day: day.number, round: modal, ...(archive ? { gameId: day.gameId } : {}) }}
                      label={`ROUND ${modal + 1}`} result={saved.results[modal]} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>

      {day && <footer className="small">{unlimited ? "Unlimited · " : ""}Data as of {day.snapshot} · new daily at 00:00 UTC · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link></footer>}
    </main>
  );
}

function Home({ day, done, onStart, busy }: { day: DayInfo; done: number; onStart: () => void; busy: boolean }) {
  return (
    <motion.section className="panel stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img className="pixel" src="/art/mascot.png" alt="" style={{ width: 84 }} />
        <div>
          <h1 className="title">{day.mode === "archive" ? "Archive" : "Daily"} #{day.number}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>7 football prompts. 30 seconds each. The more obscure your correct answer, the more you score, and back-to-back correct answers build a streak bonus.</p>
        </div>
      </div>
      <ul className="tierlist">
        {TIERS.map((t) => (
          <li key={t.tier}><img className="pixel" src={t.icon} alt="" />{t.name}<span className="pts">{fmt(t.points)}</span></li>
        ))}
      </ul>
      <button className="btn" onClick={onStart} disabled={busy}>{done > 0 ? `CONTINUE · ROUND ${done + 1}` : "KICK OFF"}</button>
    </motion.section>
  );
}

function UnlimitedHome({ saved, onPick, onContinue, busy }: {
  saved: Saved; onPick: (category: string) => void; onContinue: () => void; busy: boolean;
}) {
  const inSet = saved.results.length > 0 && saved.results.length < SET_ROUNDS;
  return (
    <motion.section className="panel stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ gap: 16 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <img className="pixel" src="/art/mascot.png" alt="" style={{ width: 84 }} />
        <div>
          <h1 className="title">Unlimited</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Pick a round type and play 7 prompts, as many times as you like.
          </p>
        </div>
      </div>
      {inSet && (
        <button className="btn" onClick={onContinue} disabled={busy}>
          CONTINUE {typeLabel(saved.category).toUpperCase()} · ROUND {saved.results.length + 1}
        </button>
      )}
      <div className="round-types">
        {ROUND_TYPES.map((t) => (
          <button key={t.key} className={`btn ${inSet ? "secondary" : t.key === "mixed" ? "" : "secondary"}`}
                  onClick={() => onPick(t.key)} disabled={busy}>{t.label.toUpperCase()}</button>
        ))}
      </div>
      {(saved.sets ?? 0) > 0 && <div className="muted">{fmt(saved.sets ?? 0)} sets played · {fmt(saved.total ?? 0)} points all time</div>}
      <Link className="linkish" href="/" style={{ textAlign: "center" }}>Back to today&apos;s daily</Link>
    </motion.section>
  );
}

function UnlimitedEnd({ saved, total, onOpen, onAgain, onChange, busy }: {
  saved: Saved; total: number; onOpen: (i: number) => void; onAgain: () => void; onChange: () => void; busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const label = typeLabel(saved.category);
  const share = async () => {
    const text = shareText(`Unlimited · ${label}`, saved.results.map(roundScore), saved.results.map((r) => r.tier),
                           window.location.origin + "/unlimited");
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); }
    } catch { /* share sheet dismissed */ }
  };
  return (
    <motion.section className="panel stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ gap: 16 }}>
      <div className="muted">FULL TIME · {label.toUpperCase()}</div>
      <div><span className="big-score">{fmt(total)}</span><span className="muted"> / {fmt(MAX_SCORE)}</span></div>
      <Standing seed={`unlimited:${saved.category ?? "mixed"}:${saved.sets ?? 0}`} score={total}
                field={(n) => `${n} ${label.toUpperCase()} PLAYERS`} />
      <RoundColumns results={saved.results} onOpen={onOpen} />
      <button className="btn" onClick={onAgain} disabled={busy}>PLAY ANOTHER 7</button>
      <button className="btn secondary" onClick={onChange}>CHANGE ROUND TYPE</button>
      <button className="linkish" onClick={share}>{copied ? "Copied!" : "Share this set"}</button>
      <div className="muted" style={{ textAlign: "center" }}>{fmt(saved.sets ?? 0)} sets played · {fmt(saved.total ?? 0)} points all time</div>
    </motion.section>
  );
}

function Pips({ n, done }: { n: number; done: number }) {
  return (
    <div className="pips" aria-hidden>
      {Array.from({ length: n }, (_, i) => <span key={i} className={`pip ${i < done ? "done" : i === done ? "now" : ""}`} />)}
    </div>
  );
}

function Clock({ deadline, previewEnd, now }: { deadline: number; previewEnd: number; now: number }) {
  const left = Math.max(0, deadline - now);
  const pct = Math.max(0, Math.min(100, (left / (deadline - previewEnd)) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className={`timer ${left < 6000 ? "low" : ""}`}>{Math.ceil(left / 1000)}</span>
      <div className="bar" style={{ flex: 1 }}><div style={{ width: `${pct}%`, background: left < 6000 ? "var(--red)" : undefined }} /></div>
    </div>
  );
}

export function RoundResult({ result, roundsLeft, onNext, onLanded, onSmash, onAnswers }: {
  result: Result; roundsLeft: number; onNext: () => void; onLanded: () => void; onSmash?: (gate: number, last: boolean) => void;
  onAnswers?: () => void;     // opens the answer list for this round, with the player's own answer marked
}) {
  const accepted = result.status === "accepted" && !!result.tier;
  const [landedHere, setLandedHere] = useState(!accepted);   // the tier banner is up
  const [revealing, setRevealing] = useState(accepted);      // the full-screen tunnel is still showing
  const [mounted, setMounted] = useState(false);             // the overlay lives in <body>, so only after hydration
  useEffect(() => setMounted(true), []);
  const info = result.tier ? tierInfo(result.tier) : null;
  const colors = result.tier ? TIER_COLORS[result.tier] : null;

  // Once the banner has had its moment the tunnel steps aside for the result card (or sooner, on a tap or key).
  useEffect(() => {
    if (!revealing || !landedHere) return;
    const timer = setTimeout(() => setRevealing(false), 1700);
    const onKey = (e: KeyboardEvent) => { if (["Enter", " ", "Escape"].includes(e.key)) setRevealing(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [revealing, landedHere]);

  const overlay = (
    <AnimatePresence>
      {accepted && revealing && info && colors && (
        <motion.div className="reveal-overlay" key="reveal" exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                    onPointerDown={() => { if (landedHere) setRevealing(false); }}>
          <TunnelReveal tier={result.tier!} onSmash={onSmash} onLanded={() => { setLandedHere(true); onLanded(); }} />
          {landedHere && (
            <>
              <div className="tier-banner-wrap">
                <motion.div className="tier-banner" style={{ ["--tier-light" as string]: colors.light }}
                            initial={{ scale: 2.6, opacity: 0 }} animate={{ scale: 1, opacity: 1, x: [0, -9, 9, -5, 5, 0] }}
                            transition={{ type: "spring", stiffness: 420, damping: 15, x: { duration: 0.4, delay: 0.1 } }}>
                  <img className="pixel" src={info.icon} alt="" />
                  <div className="tier-name">{info.name.toUpperCase()}</div>
                  <div className="tier-pts">+{fmt(result.points)} PTS</div>
                  {!!result.bonus && <div className="tier-bonus">+{fmt(result.bonus)} STREAK BONUS</div>}
                </motion.div>
              </div>
              <div className="reveal-hint">TAP TO CONTINUE</div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {mounted && createPortal(overlay, document.body)}
      {!(accepted && revealing) && (
        <motion.section className="panel stack" style={{ gap: 14 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {accepted && info && colors ? (
            <div style={{ display: "grid", gap: 8, textAlign: "center" }}>
              <img className="pixel" src={info.icon} alt="" style={{ width: 96, margin: "0 auto" }} />
              <div className="tier-name" style={{ color: colors.light }}>{info.name.toUpperCase()}</div>
              <div className="title" style={{ color: "var(--gold)" }}>+{fmt(result.points)} PTS</div>
              {!!result.bonus && <div className="streak-bonus" data-testid="streak-bonus">STREAK BONUS +{fmt(result.bonus)}</div>}
              <StreakBadge streak={result.streak ?? 0} />
              <div>{info.quip}</div>
              <div className="muted">Accepted as <strong style={{ color: "var(--ink)" }}>{result.name}</strong></div>
              {result.fact && <div className="muted">{result.fact}</div>}
              {result.tier === 7 && <motion.div className="led pitch-invasion" animate={{ y: [0, -6, 0] }} transition={{ repeat: 3, duration: 0.4 }}>PITCH INVASION!</motion.div>}
            </div>
          ) : (
            <div style={{ textAlign: "center", display: "grid", gap: 8 }}>
              <div className="title" style={{ color: "var(--red)" }}>{result.status === "passed" ? "PASSED" : "FULL TIME ON THIS ONE"}</div>
              {!!result.lost && <StreakLost was={result.lost} />}
              <div className="muted">No points this round.</div>
            </div>
          )}
          <button className="btn" onClick={onNext}>{roundsLeft > 0 ? "NEXT QUESTION" : "FINAL WHISTLE"}</button>
          {onAnswers && <button className="btn secondary" onClick={onAnswers}>SEE ANSWERS</button>}
        </motion.section>
      )}
    </>
  );
}

function End({ day, results, total, now, onOpen }: { day: DayInfo; results: Result[]; total: number; now: number; onOpen: (i: number) => void }) {
  const [copied, setCopied] = useState(false);
  const streak = store.get<{ last: number; streak: number }>("fk:streak");
  const share = async () => {
    const text = shareText(day.mode === "archive" ? `Archive ${day.number}` : day.number, results.map(roundScore), results.map((r) => r.tier), window.location.origin);
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); setCopied(true); }
    } catch { /* share sheet dismissed */ }
  };
  return (
    <motion.section className="panel stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ gap: 16 }}>
      <div className="muted">FULL TIME · {day.mode === "archive" ? "ARCHIVE" : "DAILY"} #{day.number}</div>
      <div><span className="big-score">{fmt(total)}</span><span className="muted"> / {fmt(MAX_SCORE)}</span></div>
      {day.mode !== "archive" && <Standing seed={`daily:${day.number}`} score={total} field={(n) => `TODAY'S ${n} PLAYERS`} />}
      <RoundColumns results={results} onOpen={onOpen} />
      <button className="btn" onClick={share}>{copied ? "COPIED!" : "SHARE RESULT"}</button>
      <Link className="btn secondary" href="/unlimited">KEEP PLAYING</Link>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        {day.mode !== "archive" && <span>Daily streak: {streak?.streak ?? 1}</span>}
        <span className="muted">Next daily in {countdown(new Date(day.nextAt).getTime() - now)}</span>
      </div>
    </motion.section>
  );
}

function AnswerList({ slot, label, result, onClose }: { slot: object; label: string; result: Result; onClose: () => void }) {
  const [data, setData] = useState<RevealResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const youRef = useRef<HTMLLIElement>(null);
  const slotKey = JSON.stringify(slot);
  useEffect(() => {
    post<RevealResponse & { error?: string }>("/api/round/reveal", { ...JSON.parse(slotKey), token: result.key })
      .then(({ ok, data }) => (ok ? setData(data) : setErr(data.error ?? "Could not load the answers.")));
  }, [slotKey, result.key]);
  useEffect(() => { if (data) youRef.current?.scrollIntoView({ block: "nearest" }); }, [data]);
  const question = data?.text ?? result.text;
  const tiers = data ? withYou(data.tiers, result) : [];
  const mine = result.status === "accepted" && result.name && result.tier ? tierInfo(result.tier) : null;
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <div className="panel modal answers" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${label} answers`}>
        <div className="answers-head">
          <div className="answers-top">
            <h2 className="answers-question" data-testid="answers-question">{question ?? label}</h2>
            <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
          <div className="muted">{label}{data ? ` · ${fmt(data.total)} valid answers` : ""}</div>
          <div className={`your-answer ${mine ? "" : "none"}`} data-testid="your-answer">
            {mine
              ? <>YOU SAID <strong>{result.name}</strong> · {mine.name} · +{fmt(result.points)}</>
              : result.status === "passed" ? "YOU PASSED ON THIS ONE" : "YOU RAN OUT OF TIME"}
          </div>
        </div>
        {err && <p>{err}</p>}
        {!data && !err && <p className="muted">Loading...</p>}
        {tiers.filter((t) => t.count > 0).map((t) => (
            <div key={t.tier}>
              <h4><img className="pixel" src={tierInfo(t.tier).icon} alt="" />{tierInfo(t.tier).name} · {fmt(t.points)} · {fmt(t.count)}</h4>
              <ul>
                {t.top.map((a) => (
                  <li key={a.name} ref={a.you ? youRef : undefined} className={a.you ? "you" : ""} data-testid={a.you ? "answer-you" : undefined}>
                    {a.you && <span className="you-tag">YOU</span>}{a.name} <small>{a.fact}</small>
                  </li>
                ))}
                {t.count > t.top.length && <li className="muted">+{fmt(t.count - t.top.length)} more</li>}
              </ul>
            </div>
        ))}
      </div>
    </motion.div>
  );
}
