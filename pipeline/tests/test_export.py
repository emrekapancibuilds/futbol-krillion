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
