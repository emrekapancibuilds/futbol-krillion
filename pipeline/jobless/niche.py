"""The Niche-o-meter's data: every player's fame rank, fame, a one-line description and a depth for the off-the-charts
band (web/data/niche-players.json). The score itself is computed on the website (web/lib/niche.ts).

Run: .venv/bin/python -m jobless.niche   (reads out/, writes ../web/data/niche-players.json)

`depth` (0-100) only matters for players with NO fame at all (no Wikipedia article anywhere: about 3% of the
database), the only ones who can score 97 or more. A known Transfermarkt peak market value puts a player in the first
40 (the higher the value, the lower the depth); everyone with no value at all spreads over 40-100 by a stable hash of
the id, so nothing depends on run order.
"""
import hashlib
import json

import pandas as pd

from jobless import facts
from jobless.config import NATION_DISPLAY, OUT
from jobless.webdata import WEB_DATA

KNOWN_VALUE_DEPTH = 40


def _hash_depth(player_id: str) -> int:
    return KNOWN_VALUE_DEPTH + int(hashlib.sha1(player_id.encode()).hexdigest(), 16) % (100 - KNOWN_VALUE_DEPTH + 1)


def rows(fame: pd.DataFrame, players: pd.DataFrame, nations: pd.DataFrame) -> dict[str, list]:
    """id -> [fame rank, fame, description, depth]."""
    p = players.set_index("player_id")
    nation = nations.set_index("nation_id")["name"]
    value = pd.to_numeric(p["peak_value"], errors="coerce")
    zero = fame.loc[fame["fame"] <= 0, "entity_id"]
    known = value.reindex(zero).where(lambda v: v > 0).dropna()
    value_pct = known.rank(method="average", pct=True)
    out: dict[str, list] = {}
    for r in fame.itertuples():
        pid = r.entity_id
        line = ""
        if pid in p.index:
            x = p.loc[pid]
            name = nation.get(x["nation_id"]) if isinstance(x["nation_id"], str) else None
            shown = NATION_DISPLAY.get(name, name) if isinstance(name, str) else None
            line = facts.player_line(shown, x["positions"], x["first_year"], x["last_year"])
        if r.fame > 0:
            depth = 0
        elif pid in value_pct.index:
            depth = round(KNOWN_VALUE_DEPTH * (1 - value_pct[pid]))
        else:
            depth = _hash_depth(pid)
        out[pid] = [int(r.fame_rank), round(float(r.fame), 4), line, depth]
    return out


def build(out=OUT, dest=WEB_DATA) -> int:
    read = lambda name: pd.read_parquet(out / f"{name}.parquet")
    data = rows(read("fame_players"), read("players"), read("nations"))
    (dest / "niche-players.json").write_text(json.dumps({"n": len(data), "p": data}, ensure_ascii=False, separators=(",", ":")),
                                             encoding="utf-8")
    return len(data)


def main() -> int:
    print(f"niche-players.json: {build():,} players")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
