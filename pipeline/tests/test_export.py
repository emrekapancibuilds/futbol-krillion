import json
from datetime import date

import numpy as np
import pandas as pd

from jobless import export


def test_jsonl_is_utf8_unescaped_with_nulls(tmp_path):
    df = pd.DataFrame({"name": ["Atlético de Madrid", "Mesut Özil"], "fame": [0.5, np.nan],
                       "air_date": [date(2026, 11, 1), date(2026, 11, 2)]})
    export.write_jsonl(tmp_path / "x.jsonl", df)
    raw = (tmp_path / "x.jsonl").read_text(encoding="utf-8")
    assert "Atlético" in raw and "\\u00e9" not in raw
    rows = [json.loads(line) for line in raw.splitlines()]
    assert rows[1]["fame"] is None and rows[0]["air_date"] == "2026-11-01"


def test_export_writes_every_file_and_meta(tmp_path):
    out, dest = tmp_path / "out", tmp_path / "export"
    out.mkdir()
    pd.DataFrame({"entity_id": ["Q1"], "name": ["Thierry Henry"], "kind": ["canonical"]}).to_parquet(out / "names.parquet")
    pd.DataFrame({"manager_id": ["mgr:x"], "name": ["X"]}).to_parquet(out / "managers.parquet")
    pd.DataFrame({"stadium_id": ["std:y"], "name": ["Y"]}).to_parquet(out / "stadiums.parquet")
    fame = pd.DataFrame({"entity_id": ["Q1"], "fame": [0.9], "fame_rank": [1], "tier": [1], "points": [10], "prestige": [1.0]})
    for f in export.ENTITY_FILES.values():
        fame.to_parquet(out / f"{f}.parquet")
    pd.DataFrame({"prompt_id": ["p1"], "key": ["club:Q1:all"], "family": ["club"], "entity_type": ["player"], "text": ["t"], "pool": ["daily"],
                  "slot": ["club_easy"], "ease": [0.5], "n_answers": [1], "famous": [1],
                  "mainstream": [True], "category": ["premier-league"]}).to_parquet(out / "prompts.parquet")
    pd.DataFrame({"prompt_id": ["p1"], "entity_id": ["Q1"], "name": ["Thierry Henry"], "tier": [1], "points": [10],
                  "fact": ["f"]}).to_parquet(out / "prompt_answers.parquet")
    counts = export.export(out, dest)
    assert counts["prompts"] == 1 and counts["schedule"] == 0
    meta = json.loads((dest / "meta.json").read_text())
    assert meta["tm_snapshot"] == "2026-07-06" and meta["counts"] == counts
    first = json.loads((dest / "entities.jsonl").read_text().splitlines()[0])
    assert first["name"] == "Thierry Henry"
    prompt = json.loads((dest / "prompts.jsonl").read_text().splitlines()[0])
    assert (prompt["famous"], prompt["mainstream"]) == (1, True)     # the web export filters Unlimited on these


def test_countries_get_the_names_people_type_and_fix_odd_labels(tmp_path):
    """Wikidata labels the Canadian team 'Canadian' and has no 'USA' or 'Holland'; players type those."""
    out, dest = tmp_path / "out", tmp_path / "export"
    out.mkdir()
    pd.DataFrame({"entity_id": ["Qus", "Qca", "Qnl"], "name": ["United States", "Canadian", "Netherlands"],
                  "kind": ["canonical"] * 3}).to_parquet(out / "names.parquet")
    pd.DataFrame({"manager_id": ["mgr:x"], "name": ["X"]}).to_parquet(out / "managers.parquet")
    pd.DataFrame({"stadium_id": ["std:y"], "name": ["Y"]}).to_parquet(out / "stadiums.parquet")
    pd.DataFrame({"nation_id": ["Qus", "Qca", "Qnl", "Qnone"], "name": pd.array(["United States", "Canadian", "Netherlands", None],
                                                                              dtype="string")}).to_parquet(out / "nations.parquet")
    for t, f in export.ENTITY_FILES.items():
        ids = ["Qus", "Qca", "Qnl"] if t == "nation" else ["Qx"]
        pd.DataFrame({"entity_id": ids, "fame": [0.9] * len(ids), "fame_rank": 1, "tier": 1, "points": 10,
                      "prestige": 1.0}).to_parquet(out / f"{f}.parquet")
    pd.DataFrame({"prompt_id": ["p"], "key": ["nations:2014 World Cup"], "family": ["nations"], "entity_type": ["nation"],
                  "text": ["t"], "pool": ["daily"], "slot": ["non_player"], "ease": [1.0], "n_answers": [3], "famous": [3],
                  "mainstream": [True], "category": ["international"]}).to_parquet(out / "prompts.parquet")
    pd.DataFrame({"prompt_id": ["p"] * 3, "entity_id": ["Qus", "Qca", "Qnl"], "name": ["a", "b", "c"], "tier": 1,
                  "points": 10, "fact": "f"}).to_parquet(out / "prompt_answers.parquet")
    export.export(out, dest)
    rows = [json.loads(line) for line in (dest / "entities.jsonl").read_text().splitlines()]
    assert {r["name"] for r in rows if r["type"] == "nation"} == {"United States", "Canada", "Netherlands"}
    names = [json.loads(line) for line in (dest / "entity_names.jsonl").read_text().splitlines()]
    aliases = {(n["entity_id"], n["name"]) for n in names if n["kind"] == "alias"}
    assert {("Qus", "USA"), ("Qus", "United States of America"), ("Qnl", "Holland"), ("Qca", "Canadian")} <= aliases


def test_well_known_clubs_get_their_nicknames_but_only_clubs_do(tmp_path):
    out, dest = tmp_path / "out", tmp_path / "export"
    out.mkdir()
    pd.DataFrame({"entity_id": ["Qpsg", "Qmc", "Qplayer"], "name": ["Paris Saint-Germain", "Manchester City", "Manchester City"],
                  "kind": ["canonical"] * 3}).to_parquet(out / "names.parquet")        # a player who shares a club's name
    pd.DataFrame({"manager_id": ["mgr:x"], "name": ["X"]}).to_parquet(out / "managers.parquet")
    pd.DataFrame({"stadium_id": ["std:y"], "name": ["Y"]}).to_parquet(out / "stadiums.parquet")
    pd.DataFrame({"club_id": ["Qpsg", "Qmc"], "name": ["Paris Saint-Germain", "Manchester City"]}).to_parquet(out / "clubs.parquet")
    for t, f in export.ENTITY_FILES.items():
        pd.DataFrame({"entity_id": ["Qx"], "fame": [0.9], "fame_rank": 1, "tier": 1, "points": 10,
                      "prestige": 1.0}).to_parquet(out / f"{f}.parquet")
    pd.DataFrame({"prompt_id": ["p"], "key": ["k"], "family": ["clubs"], "entity_type": ["club"], "text": ["t"], "pool": ["daily"],
                  "slot": ["non_player"], "ease": [1.0], "n_answers": [1], "famous": [1], "mainstream": [True],
                  "category": [None]}).to_parquet(out / "prompts.parquet")
    pd.DataFrame({"prompt_id": ["p"], "entity_id": ["Qpsg"], "name": ["a"], "tier": 1, "points": 10, "fact": "f"}).to_parquet(
        out / "prompt_answers.parquet")
    export.export(out, dest)
    aliases = {(n["entity_id"], n["name"]) for n in map(json.loads, (dest / "entity_names.jsonl").read_text().splitlines())
               if n["kind"] == "alias"}
    assert {("Qpsg", "PSG"), ("Qmc", "Man City")} <= aliases
    assert ("Qplayer", "Man City") not in aliases
