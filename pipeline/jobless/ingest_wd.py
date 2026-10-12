"""Collect everything the pipeline needs from Wikidata (resumable: every query is cached)."""
import re

import pandas as pd

from jobless import sparql
from jobless import wd_queries as q
from jobless.config import CACHE, LEAGUES, OUT, WD_CLUB_ROOTS, WD_NATIONAL_TEAM, WD_NOT_CLUB_CLASSES
from jobless.http import Http

DETAIL_COLS = ["p", "name", "dob", "sitelinks", "article", "tm_id", "positions", "footballer"]
TEAM_COLS = ["team", "name", "sitelinks", "article", "leagues", "country", "venue", "tm_club", "classes", "national", "club"]
AWARD_COLS = ["award", "name", "sitelinks"]
STINT_COLS = ["p", "st", "team", "start", "end", "apps", "goals"]

# Only real ids go into a VALUES list: Wikidata's "unknown value" comes back as a
# .well-known/genid/... URI, and one of those in a query is an HTTP 400 for the whole batch.
VALID_ID = re.compile(r"Q\d+|\d+")

BATCH = {"tm_ids": 300, "clubs": 10, "details": 200, "aliases": 300, "stints": 150, "awards": 300,
         "teams": 200}


def _rows(http, builder, ids, size: int) -> list[dict]:
    rows = []
    for chunk in sparql.batched(sorted({i for i in ids if isinstance(i, str) and VALID_ID.fullmatch(i)}), size):
        rows.extend(sparql.run(http, builder(chunk)))
    return rows


def female_players(http, player_qids) -> pd.DataFrame:
    """Women players among `player_qids`. Players without the footballer occupation are dropped in merge anyway."""
    women = {r["p"] for r in sparql.run(http, q.female_players())}
    return pd.DataFrame({"p": sorted(women & set(player_qids))}, columns=["p"])


def collect(http, tm_players: pd.DataFrame, tm_clubs: pd.DataFrame,
            tm_national: pd.DataFrame) -> dict[str, pd.DataFrame]:
    tm_team_ids = list(tm_clubs["club_id"].dropna()) + list(tm_national["national_team_id"].dropna())
    club_map = pd.DataFrame(_rows(http, q.clubs_by_tm_id, tm_team_ids, BATCH["tm_ids"]), columns=["tm", "club"])
    league_clubs = pd.DataFrame(sparql.run(http, q.clubs_in_leagues([lg.qid for lg in LEAGUES.values()])),
                                columns=["club", "league"])
    team_qids = set(club_map["club"]) | set(league_clubs["club"])
    tm_map = pd.DataFrame(_rows(http, q.players_by_tm_id, list(tm_players["player_id"].dropna()),
                                BATCH["tm_ids"]), columns=["tm", "p"])
    roster = pd.DataFrame(_rows(http, q.players_of_clubs, sorted(team_qids), BATCH["clubs"]), columns=["p"])
    player_qids = sorted(set(tm_map["p"]) | set(roster["p"]))
    details = pd.DataFrame(_rows(http, q.player_details, player_qids, BATCH["details"]), columns=DETAIL_COLS)
    aliases = pd.DataFrame(_rows(http, q.player_aliases, player_qids, BATCH["aliases"]), columns=["p", "alias"])
    stints = pd.DataFrame(_rows(http, q.player_stints, player_qids, BATCH["stints"]), columns=STINT_COLS)
    female = female_players(http, player_qids)
    awards = pd.DataFrame(_rows(http, q.player_awards, player_qids, BATCH["awards"]), columns=["p", "award"])
    teams = pd.DataFrame(_rows(http, q.team_details, sorted(set(stints["team"]) | team_qids), BATCH["teams"]),
                         columns=TEAM_COLS)
    club_classes = {r["cls"] for r in sparql.run(http, q.subclasses(WD_CLUB_ROOTS))} - WD_NOT_CLUB_CLASSES
    nation_classes = {r["cls"] for r in sparql.run(http, q.subclasses([WD_NATIONAL_TEAM]))}
    classes = teams["classes"].fillna("").str.split("|").map(set)
    teams["club"] = classes.map(lambda c: "true" if c & club_classes and not c & WD_NOT_CLUB_CLASSES else "false")
    teams["national"] = classes.map(lambda c: "true" if c & nation_classes else "false")
    award_info = pd.DataFrame(_rows(http, q.award_details, list(awards["award"]), BATCH["awards"]),
                              columns=AWARD_COLS)
    return {"wd_club_map": club_map, "wd_league_clubs": league_clubs, "wd_tm_map": tm_map,
            "wd_players": details, "wd_aliases": aliases, "wd_stints": stints, "wd_awards": awards,
            "wd_teams": teams, "wd_award_info": award_info, "wd_female": female}


def main(argv=None) -> int:
    """`python -m jobless.ingest_wd --only female` adds wd_female to an existing pull without re-running it."""
    # One query at a time, resting as long as the last query ran: WDQS allows ~60 s of query time per minute
    # and answers bursts with a long Retry-After.
    http = Http(CACHE / "wdqs", min_interval=1.0, rest_factor=1.0)
    if argv and argv[:2] == ["--only", "female"]:
        female = female_players(http, pd.read_parquet(OUT / "wd_players.parquet")["p"])
        female.to_parquet(OUT / "wd_female.parquet", index=False)
        print(f"wd_female: {len(female):,} rows")
        return 0
    frames = collect(http, pd.read_parquet(OUT / "tm_players.parquet"), pd.read_parquet(OUT / "tm_clubs.parquet"),
                     pd.read_parquet(OUT / "tm_national_teams.parquet"))
    for name, df in frames.items():
        df.to_parquet(OUT / f"{name}.parquet", index=False)
        print(f"{name}: {len(df):,} rows")
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(main(sys.argv[1:]))
