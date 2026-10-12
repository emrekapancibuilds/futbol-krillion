"""Write the pipeline's results as UTF-8 JSON Lines for the website's loader (phase 2)."""
import json
from datetime import datetime, timezone

import pandas as pd

from jobless.config import EXPORT, OUT, TM_SNAPSHOT

ENTITY_FILES = {"player": "fame_players", "club": "fame_clubs", "nation": "fame_nations", "manager": "fame_managers",
                "stadium": "fame_stadiums"}


def records(df: pd.DataFrame) -> list[dict]:
    clean = df.astype(object).where(df.notna(), None)
    return [{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()}
            for r in clean.to_dict("records")]


def write_jsonl(path, df: pd.DataFrame) -> int:
    with open(path, "w", encoding="utf-8") as f:
        for r in records(df):
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(df)


def export(out=OUT, dest=EXPORT) -> dict[str, int]:
    dest.mkdir(parents=True, exist_ok=True)
    read = lambda name: pd.read_parquet(out / f"{name}.parquet")
    names = pd.concat([read("names"),
                       read("managers").rename(columns={"manager_id": "entity_id"}).assign(kind="canonical"),
                       read("stadiums")[["stadium_id", "name"]].rename(columns={"stadium_id": "entity_id"}).assign(kind="canonical")],
                      ignore_index=True)
    canonical = names[names["kind"] == "canonical"].drop_duplicates("entity_id").set_index("entity_id")["name"]
    entities = pd.concat([read(f).assign(type=t) for t, f in ENTITY_FILES.items()], ignore_index=True)
    entities["name"] = entities["entity_id"].map(canonical)
    counts = {
        "entities": write_jsonl(dest / "entities.jsonl",
                                entities[["entity_id", "type", "name", "fame", "fame_rank", "tier", "points"]]),
        "entity_names": write_jsonl(dest / "entity_names.jsonl", names[["entity_id", "name", "kind"]]),
        "prompts": write_jsonl(dest / "prompts.jsonl",
                               read("prompts")[["prompt_id", "key", "family", "entity_type", "text", "pool", "slot", "ease", "n_answers",
                                                "famous", "mainstream", "category"]]),
        "prompt_answers": write_jsonl(dest / "prompt_answers.jsonl",
                                      read("prompt_answers")[["prompt_id", "entity_id", "tier", "points", "fact"]]),
        "schedule": write_jsonl(dest / "schedule.jsonl", read("schedule")) if (out / "schedule.parquet").exists() else 0,
    }
    meta = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "tm_snapshot": TM_SNAPSHOT,
            "counts": counts}
    (dest / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return counts


def main() -> int:
    print(export())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
