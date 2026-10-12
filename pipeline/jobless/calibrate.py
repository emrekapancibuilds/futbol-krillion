"""Fit the fame weights to a hand-sorted sample of players (spec §4 'Calibration')."""
import json
import sys

import pandas as pd

from jobless.config import DATA, FAME_WEIGHTS, OUT
from jobless.fame_players import score
from jobless.tiers import tier_name

EXACT_TARGET = 0.70
WITHIN_ONE_TARGET = 0.95


def agreement(predicted: pd.Series, labels: pd.Series) -> tuple[float, float]:
    diff = (predicted.reindex(labels.index) - labels).abs()
    return float((diff == 0).mean()), float((diff <= 1).mean())


def fit(comp: pd.DataFrame, labels: pd.Series, start: dict[str, float] = FAME_WEIGHTS, step: float = 0.05,
        max_passes: int = 20) -> tuple[dict[str, float], float]:
    """Coordinate search: nudge one weight at a time by +/- step, renormalise, keep improvements."""
    def objective(w):
        exact, within = agreement(score(comp, w)["tier"], labels)
        return exact + 0.5 * within

    best_w, best = dict(start), objective(start)
    for _ in range(max_passes):
        improved = False
        for key in list(best_w):
            for delta in (step, -step):
                w = dict(best_w)
                w[key] = max(0.0, w[key] + delta)
                total = sum(w.values())
                if total == 0:
                    continue
                w = {k: v / total for k, v in w.items()}
                value = objective(w)
                if value > best + 1e-9:
                    best, best_w, improved = value, w, True
        if not improved:
            break
    return best_w, best


def top_clubs(stints: pd.DataFrame, clubs: pd.DataFrame) -> pd.Series:
    """player_id -> up to three club names, most appearances first ('Arsenal F.C. / Juventus')."""
    named = stints.assign(club=stints["club_id"].map(clubs.set_index("club_id")["name"])).dropna(subset=["club"])
    ordered = named.sort_values("apps", ascending=False, na_position="last")
    return ordered.groupby("player_id", sort=False)["club"].agg(lambda s: " / ".join(list(dict.fromkeys(s))[:3]))


def sample(scored: pd.DataFrame, players: pd.DataFrame, stints: pd.DataFrame, clubs: pd.DataFrame,
           per_tier: int = 43, seed: int = 7) -> pd.DataFrame:
    """A draft for hand-labelling: ~per_tier players from each provisional tier, with context columns."""
    picks = pd.concat([g.sample(min(len(g), per_tier), random_state=seed) for _, g in scored.groupby("tier")])
    info = players.set_index("player_id")
    first, last = picks.index.map(info["first_year"]), picks.index.map(info["last_year"])
    return pd.DataFrame({
        "player_id": picks.index, "name": picks.index.map(info["name"]),
        "years": [f"{f:.0f}–{l:.0f}" if pd.notna(f) and pd.notna(l) else "" for f, l in zip(first, last)],
        "clubs": picks.index.map(top_clubs(stints, clubs)).fillna(""),
        "provisional_tier": picks["tier"].values, "tier": ""})


def report(comp, scored, labels, weights, exact, within, names) -> str:
    pred = scored["tier"].reindex(labels.index)
    worst = (pred - labels).abs().sort_values(ascending=False).head(20)
    lines = ["# Fame calibration report", "",
             f"Exact tier agreement: **{exact:.1%}** (target {EXACT_TARGET:.0%})  ",
             f"Within one tier: **{within:.1%}** (target {WITHIN_ONE_TARGET:.0%})", "", "## Fitted weights", "",
             "| Component | Weight |", "|---|---|"]
    lines += [f"| {k} | {v:.3f} |" for k, v in weights.items()]
    lines += ["", "## Worst 20 disagreements", "", "| Player | Hand tier | Formula tier |", "|---|---|---|"]
    lines += [f"| {names.get(pid, pid)} | {tier_name(int(labels[pid]))} | {tier_name(int(pred[pid]))} |"
              for pid in worst.index]
    lines += ["", "## 20 most famous players", ""]
    lines += [f"{i}. {names.get(pid, pid)}" for i, pid in enumerate(scored.sort_values("fame_rank").index[:20], 1)]
    lines += ["", "## Five random players per tier", ""]
    for tier, g in scored.groupby("tier"):
        picks = g.sample(min(5, len(g)), random_state=1).index
        lines.append(f"- **{tier_name(int(tier))}:** " + ", ".join(names.get(p, p) for p in picks))
    return "\n".join(lines) + "\n"


def exit_code(exact: float, within: float) -> int:
    """Below-target agreement is reported, not fatal: the user accepted 49.5% / 88.7% on 2026-10-11, and
    run_all stops at any non-zero exit (a missing label file is still exit 2)."""
    if exact < EXACT_TARGET or within < WITHIN_ONE_TARGET:
        print(f"WARNING: below the {EXACT_TARGET:.0%} / {WITHIN_ONE_TARGET:.0%} agreement targets", file=sys.stderr)
    return 0


def main() -> int:
    comp = pd.read_parquet(OUT / "player_components.parquet")
    players = pd.read_parquet(OUT / "players.parquet")
    labels_path = DATA / "calibration.csv"
    if not labels_path.exists():
        draft = sample(score(comp), players, pd.read_parquet(OUT / "stints.parquet"),
                       pd.read_parquet(OUT / "clubs.parquet"))
        DATA.mkdir(exist_ok=True)
        draft.to_csv(DATA / "calibration_draft.csv", index=False)
        print(f"Wrote {DATA / 'calibration_draft.csv'} ({len(draft)} rows). Fill the 'tier' column (1-7), "
              f"save it as {labels_path.name}, then re-run.", file=sys.stderr)
        return 2
    labels = pd.read_csv(labels_path, dtype={"player_id": "string"}).set_index("player_id")["tier"].astype(int)
    weights, _ = fit(comp, labels)
    scored = score(comp, weights)
    exact, within = agreement(scored["tier"], labels)
    (OUT / "fame_weights.json").write_text(json.dumps(weights, indent=2))
    names = players.set_index("player_id")["name"].to_dict()
    (OUT / "calibration_report.md").write_text(report(comp, scored, labels, weights, exact, within, names))
    print(f"calibration: exact {exact:.1%}, within one {within:.1%}")
    return exit_code(exact, within)


if __name__ == "__main__":
    raise SystemExit(main())
