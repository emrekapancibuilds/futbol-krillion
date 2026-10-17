"use client";

// The Niche-o-meter (user, 2026-10-16): type a player, get 1-100 for how niche they are. Free for everyone, just for fun:
// nothing here is scored or saved except the "seen the intro" flag, and the intro only ever shows the first time.

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { betterKnownLine, NOT_FOUND_MESSAGE, type NicheResult } from "@/lib/niche.ts";

const SEEN_KEY = "fk:niche-seen";
const BLOCKS = 25;
const PALETTE = ["#50dcff", "#6cf08f", "#ffe45c", "#ff9a1f", "#e8412b", "#c69bff"];       // everyone knows them -> nobody does

type Search = { query: string; results: NicheResult[]; total: number };

/** Ask the server, retrying quietly when it stumbles (the first call after a deploy can time out while the player
 *  data loads). A real refusal (4xx, e.g. a name that's too long) comes back at once. null = the search went stale. */
async function lookup(q: string, stale: () => boolean): Promise<{ results: NicheResult[]; total: number } | { error: string } | null> {
  for (const wait of [0, 500, 1200, 2500]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (stale()) return null;
    try {
      const res = await fetch(`/api/niche?q=${encodeURIComponent(q)}`);
      if (res.status >= 500) continue;
      const data = await res.json();
      return res.ok ? data : { error: data.error ?? "Something went wrong." };
    } catch {
      /* a network blip or a non-JSON error page: try again */
    }
  }
  return { error: "Couldn't reach the server. Try again." };
}

function firstVisit(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, "1");          // marked the moment the intro opens, so a reload never shows it again
    return true;
  } catch {
    return false;                                  // storage blocked: skip the intro rather than nag on every visit
  }
}

export default function NicheOMeter() {
  const [intro, setIntro] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Search | null>(null);
  const [picked, setPicked] = useState<NicheResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const decided = useRef(false);
  // Once per page load, even when React runs the effect twice in development (the flag is written as the intro opens).
  useEffect(() => {
    if (decided.current) return;
    decided.current = true;
    setIntro(firstVisit());
  }, []);

  // Search as they type (after a short pause); an answer for an old query is dropped.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSearch(null); return; }
    let stale = false;
    const t = setTimeout(async () => {
      const data = await lookup(q, () => stale);
      if (stale || data === null) return;
      if ("error" in data) { setError(data.error); setSearch(null); return; }
      setError(null);
      setSearch({ query: q, results: data.results, total: data.total });
    }, 220);
    return () => { stale = true; clearTimeout(t); };
  }, [query]);

  const current = search && search.query === query.trim() ? search : null;
  const notFound = !!current && current.results.length === 0;
  const measure = (e?: FormEvent) => {
    e?.preventDefault();
    if (current?.results[0]) setPicked(current.results[0]);
  };

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/"><img className="pixel" src="/art/logo.png" alt="Futkrill" style={{ height: 44 }} /></Link>
        <div className="right"><Link className="linkish" href="/">Back to the game</Link></div>
      </header>

      <div className="middle">
        <section className="panel stack niche" style={{ gap: 16 }}>
          <div>
            <h1 className="title">Niche-o-meter</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>Type a footballer. We&apos;ll tell you how niche they are.</p>
          </div>

          <form className="answer-row niche-form" onSubmit={measure}>
            <input ref={inputRef} value={query} placeholder="type a player" autoComplete="off" autoCorrect="off" spellCheck={false}
                   aria-label="Player name" maxLength={60}
                   onChange={(e) => { setQuery(e.target.value); setPicked(null); }} />
            <button className="btn" disabled={!current?.results.length}>MEASURE</button>
          </form>

          {error && <div role="alert" className="muted">{error}</div>}

          {!picked && current && current.results.length > 0 && (
            <ul className="niche-suggest" aria-label="Players">
              {current.results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => { setPicked(r); setQuery(r.name); }}>
                    <strong>{r.name}</strong>{r.line && <small>{r.line}</small>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!picked && notFound && <div className="niche-unknown" data-testid="niche-unknown" role="status">{NOT_FOUND_MESSAGE}</div>}

          <AnimatePresence mode="wait">
            {picked && current && <Meter key={picked.id} result={picked} total={current.total} />}
          </AnimatePresence>

          <p className="muted niche-fine">Just for fun: scores here don&apos;t count toward anything.</p>
        </section>
      </div>

      <AnimatePresence>{intro && <Intro onClose={() => { setIntro(false); inputRef.current?.focus(); }} />}</AnimatePresence>
    </main>
  );
}

function blockColor(i: number) {
  return PALETTE[Math.min(PALETTE.length - 1, Math.floor((i / BLOCKS) * PALETTE.length))];
}

function Meter({ result, total }: { result: NicheResult; total: number }) {
  const still = useReducedMotion() ?? false;
  const count = useMotionValue(still ? result.score : 0);
  const shown = useTransform(count, (v) => Math.round(v));
  const lit = Math.max(1, Math.round((result.score / 100) * BLOCKS));
  useEffect(() => {
    if (still) return;
    const controls = animate(count, result.score, { duration: 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [count, result.score, still]);

  return (
    <motion.div className="niche-result" data-testid="niche-result" initial={still ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}>
      <div className="niche-name">{result.name}</div>
      {result.line && <div className="muted niche-line">{result.line}</div>}
      <div className="niche-score">
        <motion.span data-testid="niche-score" aria-label={`Niche score ${result.score} out of 100`}>{shown}</motion.span>
        <small>/ 100</small>
      </div>
      <div className="niche-meter" aria-hidden>
        {Array.from({ length: BLOCKS }, (_, i) => (
          <motion.span key={i} className={i < lit ? "on" : ""} style={i < lit ? { background: blockColor(i) } : undefined}
                       initial={still ? false : { opacity: i < lit ? 0.15 : 1 }} animate={{ opacity: 1 }}
                       transition={{ delay: still ? 0 : i * 0.03, duration: 0.25 }} />
        ))}
      </div>
      <div className="niche-ends muted"><span>EVERYONE KNOWS THEM</span><span>NOBODY DOES</span></div>
      <div className="niche-label" data-testid="niche-label">{result.label}</div>
      <div className="muted" data-testid="niche-known">{betterKnownLine(result.rank, total)}</div>
    </motion.div>
  );
}

function Intro({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <div className="panel modal niche-intro" role="dialog" aria-label="What is the Niche-o-meter" onClick={(e) => e.stopPropagation()}>
        <h2 className="title" style={{ margin: 0 }}>The Niche-o-meter</h2>
        <p>Type any footballer and we&apos;ll tell you how niche they are, from <strong>1</strong> (everyone has heard of them) to <strong>100</strong> (nobody has).</p>
        <p>It&apos;s just for fun: nothing here counts toward your score, your streak or anything else, and it&apos;s free for everyone.</p>
        <p className="muted">Scores of 97 or higher are almost impossible. Only players who don&apos;t even have a Wikipedia page can get there.</p>
        <button className="btn" onClick={onClose} autoFocus>GOT IT</button>
      </div>
    </motion.div>
  );
}
