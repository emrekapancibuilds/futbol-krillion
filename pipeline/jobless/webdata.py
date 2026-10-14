"""Package the export for the website: the schedule, one answer file per scheduled prompt, a slice of the
Unlimited pool (unlimited.json), and a name index per entity type (used to reject near-miss names of real people
who are not valid answers).

Run: .venv/bin/python -m jobless.webdata   (reads export/, writes ../web/data/)
"""
import hashlib
import json
from pathlib import Path

import pandas as pd

from jobless.config import EXPORT, ROOT, TEAM_FAMILIES, TEAM_MIN_FAMOUS
from jobless.tiers import tier_points

WEB_DATA = ROOT.parent / "web" / "data"
# Unlimited is free for now; shipping all ~1,000 Unlimited prompts would add ~48 MB, so a fixed slice goes out.
# Picked by a hash of the id, so a rebuild keeps the same prompts wherever they still exist.
UNLIMITED_EXPORT = 300
UNLIMITED_MIN_FAMOUS = 30   # free Unlimited stays easy: top-5 leagues and plenty of famous answers. A bit below
                            # the dailies' 40 because players pick the round type they know (user, 2026-10-11).


def _read(path: Path) -> pd.DataFrame:
    return pd.read_json(path, lines=True, dtype=False)


def subject(key: str) -> str:
    """What a prompt is about, so a set of 7 asks about each club, league or national team once."""
    kind, _, rest = key.partition(":")
    first = rest.split(":")[0]
    if kind in ("club", "clubpos", "clubcl"):
        return f"club:{first}"
    if kind in ("league", "leaguepos", "scorers", "managers", "clubs", "won"):
        return f"league:{first}"
    if kind in ("intl", "natpos", "natleague"):
        return f"nation:{first}"
    if kind in ("scored", "nations"):
        return "tournament"
    return key


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build(export: Path = EXPORT, dest: Path = WEB_DATA) -> dict:
    schedule = _read(export / "schedule.jsonl").sort_values(["daily_number", "position"])
    prompts = _read(export / "prompts.jsonl").set_index("prompt_id")
    answers = _read(export / "prompt_answers.jsonl")
    entities = _read(export / "entities.jsonl").set_index("entity_id")
    names = _read(export / "entity_names.jsonl")

    # Files from an earlier build would otherwise ship with the site: answer lists of prompts no longer scheduled.
    for stale in [*dest.glob("prompts/*.json"), *dest.glob("names-*.json")]:
        stale.unlink()
    days = [{"number": int(n), "date": str(g["air_date"].iloc[0])[:10], "prompts": list(g["prompt_id"])}
            for n, g in schedule.groupby("daily_number", sort=True)]
    _write(dest / "days.json", days)
    # After the last scheduled day the site fills days from this pool (web/lib/game/schedule.ts): the scheduled
    # prompts, so every id in it always has an answer file.
    _write(dest / "fallback-prompts.json", list(dict.fromkeys(schedule["prompt_id"])))

    variants = names.drop_duplicates(["entity_id", "name"]).groupby("entity_id", sort=False)["name"].agg(list)
    scheduled = list(dict.fromkeys(schedule["prompt_id"]))
    # Team prompts (a league's clubs, a World Cup's teams) are as big as their category: about 35 answers, not 100s.
    team = prompts["family"].isin(TEAM_FAMILIES) if "family" in prompts else False
    easy = ((prompts["famous"] >= UNLIMITED_MIN_FAMOUS) | (team & (prompts["famous"] >= TEAM_MIN_FAMOUS))
            if "famous" in prompts else True)
    if "mainstream" in prompts:
        easy &= prompts["mainstream"].fillna(False).astype(bool)
    pool = prompts.index[(prompts["pool"] == "unlimited") & easy].difference(scheduled)
    unlimited = sorted(pool, key=lambda p: hashlib.sha1(p.encode()).hexdigest())[:UNLIMITED_EXPORT]
    cats = prompts["category"] if "category" in prompts else pd.Series(None, index=prompts.index, dtype=object)
    categories: dict[str, list[str]] = {}
    for pid in unlimited:
        if isinstance(cats.get(pid), str):
            categories.setdefault(cats[pid], []).append(pid)
    keys = prompts["key"] if "key" in prompts else pd.Series(prompts.index, index=prompts.index)
    subjects = {pid: subject(str(keys.get(pid, pid))) for pid in unlimited}
    _write(dest / "unlimited.json", {"all": unlimited, "categories": categories, "subjects": subjects})
    used = answers[answers["prompt_id"].isin(scheduled + unlimited)].copy()
    used["fame"] = used["entity_id"].map(entities["fame"])
    for pid, g in used.groupby("prompt_id"):
        g = g.sort_values(["fame", "entity_id"], ascending=[False, True])
        _write(dest / "prompts" / f"{pid}.json", {
            "id": pid, "text": prompts.at[pid, "text"], "entityType": prompts.at[pid, "entity_type"],
            "answers": [{"id": r.entity_id, "name": entities.at[r.entity_id, "name"], "tier": int(r.tier),
                         "points": tier_points(int(r.tier)), "fact": r.fact, "variants": variants.get(r.entity_id, [])}
                        for r in g.itertuples()]})

    types = sorted({prompts.at[p, "entity_type"] for p in scheduled + unlimited})
    for etype in types:
        ids = set(entities.index[entities["type"] == etype])
        rows = names[names["entity_id"].isin(ids)].drop_duplicates(["entity_id", "name"])
        _write(dest / f"names-{etype}.json", rows[["entity_id", "name"]].values.tolist())

    meta = json.loads((export / "meta.json").read_text()) | {"days": len(days), "prompts": len(scheduled),
                                                             "unlimited": len(unlimited)}
    _write(dest / "meta.json", meta)
    return meta


def main() -> int:
    print(build())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
