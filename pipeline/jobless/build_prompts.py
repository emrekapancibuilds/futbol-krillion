"""Candidates -> tiered answers -> quality checks -> dedupe -> slots and pools (spec §5)."""
import hashlib
import math
from collections import Counter

import pandas as pd

from jobless.config import NATION_DISPLAY, OUT, TEAM_FAMILIES, TEAM_MIN_ANSWERS, TEAM_MIN_FAMOUS
from jobless.gates import MAX_OVERLAP, check, check_team, dedupe
from jobless.templates import Candidate, generate, load_world
from jobless.tiers import link_tier, team_cap, team_tiers, tier_points

FAMILY_ORDER = ["club", "club_cl", "internationals", "league", "champions", "nation_league", "tournament", "honours", "two_clubs",
                "club_position", "nation_position", "league_position", "league_scorers", "clubs", "managers", "stadiums",
                "nations"]
CLUB_FAMILIES = {"club", "club_position", "two_clubs"}
NATION_FAMILIES = {"nation_league", "tournament", "internationals", "nation_position"}
LIGHT_GATE_FAMILIES = {"tournament"}   # answers are almost all famous: see gates.check(light=True)
# Dailies should be answerable in many ways (user, 2026-10-11): no two-club combinations, and a real answer list.
UNLIMITED_ONLY_FAMILIES = {"two_clubs"}
DAILY_MIN_ANSWERS = 100
# ...and easy to answer: at least this many answers a casual fan could know (tiers 1-3). At 5 or so famous
# answers ('Name a defender who played for Granada') the prompts were far too hard (user, 2026-10-11).
DAILY_MIN_FAMOUS = 40
DAILY_DAYS = 365
TEAM_MAX_OVERLAP = 0.9   # Jaccard above which one team prompt is a copy of another
SLOT_PER_DAY = {"club_easy": 2, "nation_tournament": 2, "non_player": 1, "hard": 2, "flex": 1}
UNLIMITED_SHARE = 0.4


def prompt_id(key: str) -> str:
    return "p" + hashlib.sha1(key.encode()).hexdigest()[:10]


def answers_for(c: Candidate, fame: pd.DataFrame) -> pd.DataFrame:
    """Tiered answers; when two entities share a display name, keep only the more famous one."""
    ids = [i for i in c.facts if i in fame.index]
    a = fame.loc[ids, ["name", "fame", "tier", "points"]].rename_axis("entity_id").reset_index()
    a["fact"] = a["entity_id"].map(c.facts)
    a = a.sort_values("fame", ascending=False).drop_duplicates("name").reset_index(drop=True)
    if c.family in TEAM_FAMILIES and not a.empty:
        # Teams are tiered against the others in the category and capped by how broad it is (tiers.team_cap), not by
        # where they sit among every club or nation in the world.
        scores = pd.Series(c.scores).reindex(a["entity_id"]).fillna(0.0).values if c.scores else a["fame"].values
        a["tier"] = team_tiers(pd.Series(scores), team_cap(c.entity_type, len(a))).values
        a["points"] = a["tier"].map(tier_points)
    a["base_tier"] = a["tier"]                              # the fame tier, kept beside the final one for the report
    if c.links and c.family not in TEAM_FAMILIES and not a.empty:
        # A short spell makes a famous player's answer rarer (tiers.link_tier); the fame tier stays in base_tier.
        a["tier"] = [link_tier(t, *c.links.get(e, (None, None))) for t, e in zip(a["tier"], a["entity_id"])]
        a["points"] = a["tier"].map(tier_points)
    return a


def assign_slots(prompts: pd.DataFrame) -> pd.Series:
    player = prompts["entity_type"] == "player"
    hi, lo = prompts.loc[player, "ease"].quantile(2 / 3), prompts.loc[player, "ease"].quantile(1 / 3)
    slot = pd.Series("flex", index=prompts.index)
    slot[~player] = "non_player"
    slot[player & prompts["family"].isin(NATION_FAMILIES)] = "nation_tournament"
    slot[player & prompts["family"].isin(CLUB_FAMILIES) & (prompts["ease"] >= hi)] = "club_easy"
    slot[player & ~prompts["family"].isin(NATION_FAMILIES) & (prompts["ease"] <= lo) & (slot == "flex")] = "hard"
    return slot


def assign_pools(prompts: pd.DataFrame, seed: int, pinned=frozenset()) -> pd.Series:
    """Per slot: of the prompts fit for a daily, keep >= 40% for Unlimited (free Unlimited plays only those) and give
    dailies up to a year's quota from the rest.
    `pinned` prompt ids (already scheduled) are always daily, so a rebuild never moves an unaired daily
    into Unlimited (spec §5)."""
    pool = pd.Series("unlimited", index=prompts.index)
    is_pinned = prompts["prompt_id"].isin(pinned) if "prompt_id" in prompts else pd.Series(False, index=prompts.index)
    eligible = pd.Series(True, index=prompts.index)
    if "family" in prompts:
        eligible &= ~prompts["family"].isin(UNLIMITED_ONLY_FAMILIES)
    team = prompts["family"].isin(TEAM_FAMILIES) if "family" in prompts else pd.Series(False, index=prompts.index)
    if "n_answers" in prompts:      # a World Cup has 32 teams: team prompts are as big as their category gets
        eligible &= (prompts["n_answers"] >= DAILY_MIN_ANSWERS) | (team & (prompts["n_answers"] >= TEAM_MIN_ANSWERS))
    if "mainstream" in prompts:
        eligible &= prompts["mainstream"].astype(bool)
    if "famous" in prompts:
        eligible &= (prompts["famous"] >= DAILY_MIN_FAMOUS) | (team & (prompts["famous"] >= TEAM_MIN_FAMOUS))
    pool[is_pinned] = "daily"
    for slot, g in prompts.sample(frac=1, random_state=seed).groupby("slot", sort=False):
        quota = SLOT_PER_DAY.get(slot, 0) * DAILY_DAYS
        free = g.index[~is_pinned[g.index] & eligible[g.index]]
        base = len(free) + int(is_pinned[g.index].sum())          # scheduled prompts count as daily-fit
        n_daily = min(quota, base - math.ceil(base * UNLIMITED_SHARE)) - int(is_pinned[g.index].sum())
        pool[free[:max(0, n_daily)]] = "daily"
    return pool


def build(candidates: list[Candidate], fame_by_type: dict[str, pd.DataFrame], seed: int = 11, pinned=frozenset()):
    passed, rejects, generated = [], Counter(), Counter()
    for c in candidates:
        generated[c.family] += 1
        answers = answers_for(c, fame_by_type[c.entity_type])
        if c.family in TEAM_FAMILIES:
            reason = check_team(answers["tier"].tolist(), team_cap(c.entity_type, len(answers)))
        else:
            reason = check(answers["tier"].tolist(), light=c.family in LIGHT_GATE_FAMILIES)
        if reason:
            rejects[(c.family, reason)] += 1
        else:
            passed.append((c, answers))
    kept, seen = [], set()                                    # same words on two prompts: keep the bigger one
    for c, a in sorted(passed, key=lambda x: -len(x[1])):
        if (c.entity_type, c.text) in seen:
            rejects[(c.family, "same text as a bigger prompt")] += 1
        else:
            seen.add((c.entity_type, c.text))
            kept.append((c, a))
    passed = kept
    passed.sort(key=lambda x: (FAMILY_ORDER.index(x[0].family), -len(x[1])))
    keep = set()
    for etype in {c.entity_type for c, _ in passed}:
        # Team prompts are small and neighbouring tournaments share most teams (Euro 2020 and 2024): only drop copies.
        limit = TEAM_MAX_OVERLAP if etype in ("nation", "club") else MAX_OVERLAP
        keep |= set(dedupe([(c.key, set(a["entity_id"])) for c, a in passed if c.entity_type == etype], limit))
    rows, answer_rows = [], []
    for c, a in passed:
        if c.key not in keep:
            rejects[(c.family, "near-duplicate")] += 1
            continue
        pid = prompt_id(c.key)
        rows.append({"prompt_id": pid, "key": c.key, "family": c.family, "entity_type": c.entity_type, "text": c.text,
                     "n_answers": len(a), "ease": float((a["tier"] <= 3).mean()), "famous": int((a["tier"] <= 3).sum()),
                     "mainstream": c.mainstream, "category": c.category})
        answer_rows.append(a.assign(prompt_id=pid)[["prompt_id", "entity_id", "name", "tier", "base_tier", "points", "fact"]])
    prompts = pd.DataFrame(rows, columns=["prompt_id", "key", "family", "entity_type", "text", "n_answers", "ease",
                                          "famous", "mainstream", "category"])
    if not prompts.empty:
        prompts["slot"] = assign_slots(prompts)
        prompts["pool"] = assign_pools(prompts, seed, pinned)
    answers = pd.concat(answer_rows, ignore_index=True) if answer_rows else pd.DataFrame()
    return prompts, answers, generated, rejects


def days_covered(prompts: pd.DataFrame) -> int:
    daily = prompts[prompts["pool"] == "daily"]
    if daily.empty:
        return 0
    return len(daily) // 7


def link_report(prompts, answers: pd.DataFrame, top: int = 40) -> list[str]:
    """How many answers a short spell moved to a rarer tier, and the most famous players it moved the furthest."""
    moved = answers[answers["tier"] > answers["base_tier"]]
    lines = ["", "## Niche links", "", f"{len(moved):,} of {len(answers):,} answers moved to a rarer tier (fame tier -> tier).", "",
             "| Fame tier | " + " | ".join(f"to {t}" for t in range(2, 8)) + " |", "|---|" + "---|" * 6]
    for base, g in moved.groupby("base_tier"):
        counts = g["tier"].value_counts()
        lines.append(f"| {base} | " + " | ".join(str(int(counts.get(t, 0))) for t in range(2, 8)) + " |")
    text = prompts.set_index("prompt_id")["text"]
    big = moved.assign(step=moved["tier"] - moved["base_tier"]).sort_values(["base_tier", "step"], ascending=[True, False]).head(top)
    lines += ["", f"Biggest movers (the {top} most famous players moved):", "", "| Player | Prompt | Fact | Fame tier | Tier |", "|---|---|---|---|---|"]
    lines += [f"| {r.name} | {text.get(r.prompt_id, '')} | {r.fact} | {r.base_tier} | {r.tier} |" for r in big.itertuples()]
    return lines


def report(prompts, generated, rejects, answers=None) -> str:
    lines = ["# Prompt build report", "", "| Family | Generated | Passed |", "|---|---|---|"]
    passed = prompts["family"].value_counts() if not prompts.empty else pd.Series(dtype=int)
    lines += [f"| {f} | {generated[f]} | {int(passed.get(f, 0))} |" for f in FAMILY_ORDER if generated[f]]
    lines += ["", "## Rejections", "", "| Family | Reason | Count |", "|---|---|---|"]
    lines += [f"| {f} | {r} | {n} |" for (f, r), n in sorted(rejects.items())]
    if not prompts.empty:
        lines += ["", "## Pools", "", "| Slot | Daily | Unlimited |", "|---|---|---|"]
        for slot, g in prompts.groupby("slot"):
            lines.append(f"| {slot} | {(g['pool'] == 'daily').sum()} | {(g['pool'] == 'unlimited').sum()} |")
        lines += ["", f"**Days of dailies covered: {days_covered(prompts)}** (target {DAILY_DAYS}). "
                  f"Unlimited prompts: {(prompts['pool'] == 'unlimited').sum()} (target 1,500)."]
    if answers is not None and "base_tier" in answers and not answers.empty:
        lines += link_report(prompts, answers)
    return "\n".join(lines) + "\n"


def fame_tables(out=OUT) -> dict[str, pd.DataFrame]:
    read = lambda name: pd.read_parquet(out / f"{name}.parquet")
    names = {
        "player": read("players").set_index("player_id")["name"],
        "club": read("clubs").set_index("club_id")["name"],
        "nation": read("nations").set_index("nation_id")["name"].replace(NATION_DISPLAY),
        "manager": read("managers").set_index("manager_id")["name"],
        "stadium": read("stadiums").set_index("stadium_id")["name"],
    }
    files = {"player": "fame_players", "club": "fame_clubs", "nation": "fame_nations", "manager": "fame_managers",
             "stadium": "fame_stadiums"}
    return {t: read(f).set_index("entity_id").assign(name=lambda d, t=t: d.index.map(names[t])).dropna(subset=["name"])
            for t, f in files.items()}


def main() -> int:
    scheduled = OUT / "schedule.parquet"
    pinned = set(pd.read_parquet(scheduled)["prompt_id"]) if scheduled.exists() else set()
    prompts, answers, generated, rejects = build(generate(load_world()), fame_tables(), pinned=pinned)
    prompts.to_parquet(OUT / "prompts.parquet", index=False)
    answers.to_parquet(OUT / "prompt_answers.parquet", index=False)
    (OUT / "build_report.md").write_text(report(prompts, generated, rejects, answers))
    print(f"prompts: {len(prompts):,} passed; days of dailies covered: {days_covered(prompts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
