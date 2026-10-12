"""Pick each day's seven prompts, 30 days ahead, without ever changing days already scheduled (spec §5)."""
import argparse
from datetime import date, timedelta

import pandas as pd

from jobless.config import OUT
from jobless.tiers import tier_name

ORDER = ["club_easy", "nation_tournament", "club_easy", "non_player", "nation_tournament", "hard", "hard"]
FALLBACK = ["flex", "club_easy", "nation_tournament", "hard", "non_player"]
COLUMNS = ["air_date", "daily_number", "position", "prompt_id"]


def extend(prompts: pd.DataFrame, existing: pd.DataFrame, launch: date, days: int, seed: int = 5):
    """Append `days` days after the last scheduled one. Returns (schedule, notes)."""
    used = set(existing["prompt_id"])
    missing = used - set(prompts["prompt_id"])
    if missing:
        raise ValueError(f"{len(missing)} scheduled prompts are no longer in the prompt pool, e.g. {sorted(missing)[:3]}")
    daily = prompts[(prompts["pool"] == "daily") & ~prompts["prompt_id"].isin(used)]
    daily = daily.sample(frac=1, random_state=seed + len(existing))
    queues = {slot: list(g["prompt_id"]) for slot, g in daily.groupby("slot")}
    start = launch if existing.empty else max(existing["air_date"]) + timedelta(days=1)
    rows, notes = [], []
    for d in range(days):
        day = start + timedelta(days=d)
        number = (day - launch).days + 1
        picks = []
        for pos, slot in enumerate(ORDER, start=1):
            source = next((s for s in [slot] + FALLBACK if queues.get(s)), None)
            if source is None:
                notes.append(f"Day {number} ({day}): ran out of daily prompts; stopped.")
                return pd.concat([existing, pd.DataFrame(rows, columns=COLUMNS)], ignore_index=True), notes
            if source != slot:
                notes.append(f"Day {number} slot {pos}: no '{slot}' prompt left, used '{source}'.")
            picks.append({"air_date": day, "daily_number": number, "position": pos, "prompt_id": queues[source].pop(0)})
        rows.extend(picks)
    return pd.concat([existing, pd.DataFrame(rows, columns=COLUMNS)], ignore_index=True), notes


def report(schedule: pd.DataFrame, prompts: pd.DataFrame, answers: pd.DataFrame, since: date, notes: list[str]) -> str:
    text = prompts.set_index("prompt_id")["text"]
    lines = ["# Daily schedule", ""] + [f"- {n}" for n in notes] + [""]
    for day, g in schedule[schedule["air_date"] >= since].groupby("air_date"):
        lines += [f"## #{int(g['daily_number'].iloc[0])} · {day}", ""]
        for r in g.sort_values("position").itertuples():
            a = answers[answers["prompt_id"] == r.prompt_id]
            counts = a["tier"].value_counts()
            tiers = " ".join(f"T{t}:{int(counts.get(t, 0))}" for t in range(1, 8))
            samples = "; ".join(f"{tier_name(t)}: {a[a['tier'] == t].iloc[0]['name']}"
                                for t in (1, 4, 7) if (a["tier"] == t).any())
            lines.append(f"{r.position}. {text[r.prompt_id]}  \n   {tiers}  \n   {samples}")
        lines.append("")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--launch", type=date.fromisoformat, required=True, help="date of daily #1 (YYYY-MM-DD)")
    ap.add_argument("--days", type=int, default=30)
    args = ap.parse_args(argv)
    path = OUT / "schedule.parquet"
    existing = pd.read_parquet(path) if path.exists() else pd.DataFrame(columns=COLUMNS)
    if not existing.empty:
        existing["air_date"] = pd.to_datetime(existing["air_date"]).dt.date
    prompts, answers = pd.read_parquet(OUT / "prompts.parquet"), pd.read_parquet(OUT / "prompt_answers.parquet")
    try:
        schedule, notes = extend(prompts, existing, args.launch, args.days)
    except ValueError as e:
        print(f"schedule: {e}. A rebuild dropped prompts that are already scheduled.")
        return 1
    schedule.to_parquet(path, index=False)
    since = args.launch if existing.empty else max(existing["air_date"]) + timedelta(days=1)
    (OUT / "schedule_report.md").write_text(report(schedule, prompts, answers, since, notes))
    print(f"schedule: {schedule['air_date'].nunique()} days; {len(notes)} notes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
