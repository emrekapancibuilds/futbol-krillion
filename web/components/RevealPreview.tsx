"use client";

import { useEffect, useState } from "react";

import { TIERS } from "@/lib/tiers.ts";

import { RoundResult } from "./Game.tsx";

const SAMPLE = ["Lionel Messi", "Mesut Özil", "Kevin Kurányi", "David Vaughan", "Nélson Oliveira", "Ozan Tufan", "Stiven Plaza"];

export default function RevealPreview() {
  const [tier, setTier] = useState(7);
  const [run, setRun] = useState(0);
  useEffect(() => { setTier(Number(new URLSearchParams(window.location.search).get("tier")) || 7); }, []);
  return (
    <main className="shell">
      <div className="middle">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TIERS.map((t) => (
            <button key={t.tier} className="btn secondary" style={{ width: "auto", fontSize: 14, padding: "6px 10px" }}
                    onClick={() => { setTier(t.tier); setRun((r) => r + 1); }}>{t.tier}</button>
          ))}
        </div>
        <RoundResult key={`${tier}-${run}`} roundsLeft={3} onNext={() => setRun((r) => r + 1)} onLanded={() => {}}
                     result={{ status: "accepted", tier, points: TIERS[tier - 1].points, name: SAMPLE[tier - 1],
                               fact: "Sample fact line", key: "preview" }} />
      </div>
    </main>
  );
}
