"""Merge Transfermarkt and Wikidata into players, clubs, nations, stints and names (spec §3 step 4)."""
import re

import pandas as pd

from jobless.config import LEAGUE_BY_QID, LEAGUE_BY_TM, OUT
from jobless.text import club_fold, club_short_name, fold, year

TM_POSITION = {"Goalkeeper": "GK", "Defender": "DF", "Midfield": "MF", "Attack": "FW"}
WD_POSITION_WORDS = [("goalkeeper", "GK"), ("back", "DF"), ("defender", "DF"), ("sweeper", "DF"),
                     ("libero", "DF"), ("midfielder", "MF"), ("forward", "FW"), ("striker", "FW"),
                     ("winger", "FW")]
NOT_SENIOR = re.compile(r"under-?\d+|\bu-?\d+\b|youth|olympic|amateur|women|\bb team\b|reserve", re.I)
# Reserve and B teams as they are really named; case-sensitive so a trailing " B" or " C" is a team letter.
RESERVE = re.compile(r"\s(?:II|III|B|C)$|\bCastilla\b|\bAtl[eè]tic$|^Jong\s|\bMestalla\b|^Sevilla Atl[eé]tico$"
                     r"|\bAtl[eé]tico Madrile[ñn]o\b|^Bilbao Athletic\b|\bNext Gen\b|\bFabril\b|^Betis Deportivo\b"
                     r"|\bVetusta\b")
NATION_SUFFIX = re.compile(r"(?i)\s+(men's\s+)?national\s+(association\s+)?(football|soccer)\s+team$")
CLUB_COLS = ["club_id", "qid", "tm_club_id", "name", "full_name", "tm_name", "league_key", "country", "sitelinks",
             "article", "venue"]
NATION_COLS = ["nation_id", "qid", "tm_team_id", "name", "sitelinks", "article"]
PLAYER_COLS = ["player_id", "qid", "tm_id", "name", "tm_name", "dob", "positions", "peak_value", "sitelinks",
               "article", "nation_id", "caps", "first_year", "last_year"]


def wd_positions(labels) -> set[str]:
    out = set()
    for label in (labels if isinstance(labels, str) else "").split("|"):
        for word, code in WD_POSITION_WORDS:
            if word in label.lower():
                out.add(code)
                break
    return out


def not_senior(names: pd.Series) -> pd.Series:
    names = names.fillna("")
    return names.str.contains(NOT_SENIOR) | names.str.contains(RESERVE)


def classify_teams(teams: pd.DataFrame, tm_names: pd.Series | None = None) -> pd.DataFrame:
    """kind = club | nation (senior men's national team) | other (youth, women's, B teams, and the cities or
    countries that some Wikidata stints point at by mistake). `tm_names` (team qid -> Transfermarkt name) also
    catches reserve teams whose Wikidata label hides it ('Bayern Munich II' on Transfermarkt)."""
    t = teams.copy()
    name = t["name"].fillna("")
    national = t["national"].eq("true")
    club = t["club"].eq("true") | t["tm_club"].notna()
    t["kind"] = "other"
    t.loc[club, "kind"] = "club"
    t.loc[national, "kind"] = "nation"
    t.loc[not_senior(name) | (name.str.contains("national", case=False) & ~national), "kind"] = "other"
    if tm_names is not None:
        t.loc[not_senior(t["team"].map(tm_names)) & ~national, "kind"] = "other"
    t["sitelinks"] = pd.to_numeric(t["sitelinks"], errors="coerce")
    return t


def _first_covered_league(leagues) -> str | None:
    for q in (leagues if isinstance(leagues, str) else "").split("|"):
        if q in LEAGUE_BY_QID:
            return LEAGUE_BY_QID[q]
    return None


def tm_club_names(tm_clubs, tm_games, tm_national) -> pd.DataFrame:
    """Every Transfermarkt club id with a name and league, from the clubs table and both sides of every game."""
    tm = pd.concat([
        tm_clubs[["club_id", "name", "domestic_competition_id"]].set_axis(["tm_club_id", "tm_name", "competition"], axis=1),
        tm_games[["home_club_id", "home_club_name"]].set_axis(["tm_club_id", "tm_name"], axis=1),
        tm_games[["away_club_id", "away_club_name"]].set_axis(["tm_club_id", "tm_name"], axis=1),
    ]).dropna(subset=["tm_club_id"]).drop_duplicates("tm_club_id")
    return tm[~tm["tm_club_id"].isin(set(tm_national["national_team_id"].dropna()))]


def team_tm_ids(teams, club_map) -> pd.Series:
    tm_by_qid = club_map.drop_duplicates("club").set_index("club")["tm"]
    return teams["team"].map(tm_by_qid).fillna(teams["tm_club"])


def _settle_tm_links(wd: pd.DataFrame, tm_name: pd.Series) -> tuple[pd.DataFrame, dict[str, str]]:
    """Fix Transfermarkt links that Wikidata gets wrong. Returns (clubs, redirect of dropped twin -> real item).

    1. One TM id on several items (C.F. Os Belenenses and B-SAD both carry B SAD's id): it stays with the item
       whose name matches the TM name, else the one with the most sitelinks.
    2. A thin twin (0 sitelinks) holding the TM id while a better-known item with the same name has none
       (FC Augsburg): the link moves to the real item and the twin is folded into it.
    """
    wd = wd.copy()
    wd["f"] = wd["name"].fillna("").map(club_fold)
    links = wd["sitelinks"].fillna(0)
    for tm_id, g in wd[wd["tm_club_id"].notna()].groupby("tm_club_id"):
        if len(g) > 1:
            matches = g["f"] == club_fold(tm_name.get(tm_id, "") or "")
            keep = (links[g.index] + matches * 1e9).idxmax()
            wd.loc[g.index.drop(keep), "tm_club_id"] = None
    redirect = {}
    unlinked = wd[wd["tm_club_id"].isna() & (links > 0)]
    real_by_name = unlinked.sort_values("sitelinks", ascending=False).drop_duplicates("f").set_index("f")
    for i, row in wd[wd["tm_club_id"].notna() & (links == 0)].iterrows():
        if row["f"] and row["f"] in real_by_name.index:
            real = real_by_name.at[row["f"], "club_id"]
            wd.loc[wd["club_id"] == real, "tm_club_id"] = row["tm_club_id"]
            redirect[row["club_id"]] = real
    return wd[~wd["club_id"].isin(redirect)].drop(columns="f"), redirect


def build_clubs(teams, club_map, league_clubs, tm_clubs, tm_games, tm_national):
    """Returns (clubs, tm_to_club, redirect): tm_to_club maps every Transfermarkt club id to a club_id, and
    redirect maps Wikidata twin items that were folded into another club."""
    wd = teams[teams["kind"] == "club"].rename(columns={"team": "qid"}).copy()
    wd["club_id"] = wd["qid"]
    wd["tm_club_id"] = team_tm_ids(wd.rename(columns={"qid": "team"}), club_map)
    tm = tm_club_names(tm_clubs, tm_games, tm_national)
    wd, redirect = _settle_tm_links(wd, tm.set_index("tm_club_id")["tm_name"])
    members = league_clubs.assign(key=league_clubs["league"].map(LEAGUE_BY_QID)).dropna(subset=["key"])
    wd["league_key"] = wd["qid"].map(members.drop_duplicates("club").set_index("club")["key"])
    wd["league_key"] = wd["league_key"].fillna(wd["leagues"].map(_first_covered_league))

    wd = wd.merge(tm, on="tm_club_id", how="left")
    wd["league_key"] = wd["league_key"].fillna(wd["competition"].map(LEAGUE_BY_TM))

    # Transfermarkt clubs with no Wikidata link: merge by a folded name that is unique on both sides, into a
    # Wikidata club that has no Transfermarkt club of its own; else keep as tmc:<id>.
    unmapped = tm[~tm["tm_club_id"].isin(set(wd["tm_club_id"].dropna()))].copy()
    unmapped = unmapped[~not_senior(unmapped["tm_name"])]
    unmapped["f"] = unmapped["tm_name"].fillna("").map(club_fold)
    folded = wd.dropna(subset=["name"]).assign(f=lambda d: d["name"].map(club_fold))
    by_name = folded.drop_duplicates("f", keep=False)
    by_name = by_name[by_name["tm_club_id"].isna()].set_index("f")["club_id"]
    unique_tm = ~unmapped["f"].duplicated(keep=False)
    unmapped["club_id"] = unmapped["f"].map(by_name).where(unique_tm)
    merged = unmapped.dropna(subset=["club_id"])[["tm_club_id", "club_id"]]
    new = unmapped[unmapped["club_id"].isna()].copy()
    new["club_id"] = "tmc:" + new["tm_club_id"]
    new["name"] = new["tm_name"]
    new["league_key"] = new["competition"].map(LEAGUE_BY_TM)

    clubs = pd.concat([wd, new], ignore_index=True)
    clubs["full_name"] = clubs["name"]
    clubs["name"] = [club_short_name([t, w]) for t, w in zip(clubs["tm_name"], clubs["full_name"])]
    clubs = clubs.reindex(columns=CLUB_COLS)
    tm_to_club = pd.concat([wd.dropna(subset=["tm_club_id"])[["tm_club_id", "club_id"]], merged,
                            new[["tm_club_id", "club_id"]]]).drop_duplicates("tm_club_id")
    return clubs, tm_to_club.set_index("tm_club_id")["club_id"], redirect


def build_nations(teams, club_map, tm_national):
    tm_by_qid = club_map.drop_duplicates("club").set_index("club")["tm"]
    wd = teams[teams["kind"] == "nation"].rename(columns={"team": "qid"}).copy()
    wd["nation_id"] = wd["qid"]
    wd["tm_team_id"] = wd["qid"].map(tm_by_qid).fillna(wd["tm_club"])
    # 'France men's national association football team' -> 'France'. A label that does not have that shape keeps
    # its own words: the Basque Country team's country is France, and it must not be called 'France'.
    stripped = wd["name"].fillna("").str.replace(NATION_SUFFIX, "", regex=True)
    wd["name"] = stripped.where(wd["name"].notna(), wd["country"])
    unmapped = tm_national[~tm_national["national_team_id"].isin(set(wd["tm_team_id"].dropna()))]
    new = pd.DataFrame({"nation_id": "tmn:" + unmapped["national_team_id"], "tm_team_id": unmapped["national_team_id"],
                        "name": unmapped["country_name"].fillna(unmapped["name"])})
    return pd.concat([wd, new], ignore_index=True).reindex(columns=NATION_COLS)


def match_tm(wd_players: pd.DataFrame, tm_players: pd.DataFrame) -> pd.Series:
    """Transfermarkt player id -> Wikidata qid: by Transfermarkt ID first, then folded name + date of birth.

    The fallback only fires when both sides have a date of birth and the name+DOB key is unique.
    """
    by_id = wd_players.dropna(subset=["tm_id"]).drop_duplicates("tm_id").set_index("tm_id")["p"]
    matched = tm_players["player_id"].map(by_id)
    free = wd_players[wd_players["tm_id"].isna() & wd_players["dob"].notna() & wd_players["name"].notna()]
    key = free["name"].map(fold) + "|" + free["dob"].str[:10]
    by_key = free.assign(k=key).drop_duplicates("k", keep=False).set_index("k")["p"]
    tm_key = (tm_players["name"].fillna("").map(fold) + "|" + tm_players["date_of_birth"].fillna("").str[:10])
    fallback = tm_key.where(tm_players["date_of_birth"].notna()).map(by_key)
    taken = set(matched.dropna())
    fallback = fallback.where(~fallback.isin(taken))
    return pd.Series(matched.fillna(fallback).values, index=tm_players["player_id"].values)


def build_players(wd_players, tm_players, tm_match, female=frozenset()):
    """`female`: Wikidata ids of women players. They are matched first and dropped after, so a Transfermarkt row
    linked to one does not come back as a tm:<id> player."""
    if "footballer" in wd_players:  # club rosters also list coaches and staff
        wd_players = wd_players[wd_players["footballer"].ne("false")]
    tm = tm_players.rename(columns={"player_id": "tm_id", "name": "tm_name"}).copy()
    tm["qid"] = tm["tm_id"].map(tm_match)
    wd = wd_players.rename(columns={"p": "qid", "positions": "wd_positions", "tm_id": "wd_tm_id"})
    linked = wd.merge(tm[tm["qid"].notna()].drop_duplicates("qid"), on="qid", how="left")
    linked["player_id"] = linked["qid"]
    lone = tm[tm["qid"].isna()].copy()
    lone["player_id"] = "tm:" + lone["tm_id"]
    p = pd.concat([linked, lone], ignore_index=True)
    p = p[~p["qid"].isin(female)]
    p["name"] = p["name"].fillna(p["tm_name"])
    p = p[p["name"].notna()].copy()
    p["dob"] = p["dob"].fillna(p["date_of_birth"]).str[:10]
    p["positions"] = ["|".join(sorted(wd_positions(w) | ({TM_POSITION[t]} if t in TM_POSITION else set())))
                      for w, t in zip(p["wd_positions"], p["position"])]
    p["peak_value"] = p["highest_market_value_in_eur"]
    p["sitelinks"] = pd.to_numeric(p["sitelinks"], errors="coerce")
    return p


def build_stints(wd_stints, teams, tm_appearances, tm_to_club, pid_for_tm, national_ids, redirect=None):
    kind = teams.set_index("team")["kind"]
    s = wd_stints.drop_duplicates("st")
    s = s[s["team"].map(kind).eq("club")]
    s = s.assign(team=s["team"].replace(redirect or {}))
    wd_rows = pd.DataFrame({
        "player_id": s["p"].values, "club_id": s["team"].values,
        "start_year": s["start"].map(year).values, "end_year": s["end"].map(year).values,
        "apps": pd.to_numeric(s["apps"], errors="coerce").values,
        "goals": pd.to_numeric(s["goals"], errors="coerce").values, "source": "wd"})
    reversed_ = wd_rows["end_year"] < wd_rows["start_year"]
    wd_rows.loc[reversed_, ["start_year", "end_year"]] = wd_rows.loc[reversed_, ["end_year", "start_year"]].values

    a = tm_appearances[~tm_appearances["player_club_id"].isin(national_ids)].copy()
    a["player_id"] = a["player_id"].map(pid_for_tm)
    a["club_id"] = a["player_club_id"].map(tm_to_club)
    a["yr"] = a["date"].map(year)
    tm_rows = (a.dropna(subset=["player_id", "club_id"])
               .groupby(["player_id", "club_id"])
               .agg(start_year=("yr", "min"), end_year=("yr", "max"), apps=("game_id", "count"), goals=("goals", "sum"))
               .reset_index().assign(source="tm"))
    tm_rows["apps"] = tm_rows["apps"].astype("float64")
    return pd.concat([wd_rows, tm_rows], ignore_index=True)


def add_international(players, wd_stints, teams, nations):
    kind = teams.set_index("team")["kind"]
    s = wd_stints.drop_duplicates("st")
    s = s[s["team"].map(kind).eq("nation")].assign(apps=lambda d: pd.to_numeric(d["apps"], errors="coerce").fillna(0))
    best = s.sort_values("apps", ascending=False).drop_duplicates("p").set_index("p")
    tm_nation = players["current_national_team_id"].map(
        nations.dropna(subset=["tm_team_id"]).drop_duplicates("tm_team_id").set_index("tm_team_id")["nation_id"])
    tm_caps = pd.to_numeric(players["international_caps"], errors="coerce").fillna(0)
    out = players.copy()
    out["nation_id"] = out["player_id"].map(best["team"])
    use_tm = out["nation_id"].isna() & (tm_caps > 0)
    out.loc[use_tm, "nation_id"] = tm_nation[use_tm]
    out["caps"] = pd.concat([out["player_id"].map(best["apps"]).fillna(0), tm_caps], axis=1).max(axis=1)
    return out


def add_years(players, stints):
    by_player = stints.assign(y=stints[["start_year", "end_year"]].max(axis=1)).groupby("player_id")
    out = players.copy()
    tm_last = pd.to_numeric(out["last_season"], errors="coerce") + 1  # season 2025 = 2025-26
    out["last_year"] = pd.concat([out["player_id"].map(by_player["y"].max()), tm_last], axis=1).max(axis=1)
    out["first_year"] = out["player_id"].map(stints.groupby("player_id")["start_year"].min())
    return out


def build_names(players, clubs, nations, wd_aliases):
    def frame(df, id_col, name_col, kind):
        return df[[id_col, name_col]].set_axis(["entity_id", "name"], axis=1).assign(kind=kind)

    names = pd.concat([
        frame(players, "player_id", "name", "canonical"),
        frame(players, "player_id", "tm_name", "source"),
        wd_aliases.rename(columns={"p": "entity_id", "alias": "name"}).assign(kind="alias"),
        frame(clubs, "club_id", "name", "canonical"),
        frame(clubs, "club_id", "tm_name", "source"),
        frame(clubs, "club_id", "full_name", "source"),
        frame(nations, "nation_id", "name", "canonical"),
    ], ignore_index=True).dropna(subset=["name"])
    known = set(players["player_id"]) | set(clubs["club_id"]) | set(nations["nation_id"])
    return names[names["entity_id"].isin(known)].drop_duplicates(["entity_id", "name"]).reset_index(drop=True)


def build(tm: dict[str, pd.DataFrame], wd: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    tm_names = tm_club_names(tm["tm_clubs"], tm["tm_games"], tm["tm_national_teams"]).set_index("tm_club_id")["tm_name"]
    team_tm_name = pd.Series(team_tm_ids(wd["wd_teams"], wd["wd_club_map"]).map(tm_names).values,
                             index=wd["wd_teams"]["team"].values)
    teams = classify_teams(wd["wd_teams"], team_tm_name)
    clubs, tm_to_club, redirect = build_clubs(teams, wd["wd_club_map"], wd["wd_league_clubs"], tm["tm_clubs"],
                                              tm["tm_games"], tm["tm_national_teams"])
    nations = build_nations(teams, wd["wd_club_map"], tm["tm_national_teams"])
    female = set(wd["wd_female"]["p"]) if "wd_female" in wd else set()
    players = build_players(wd["wd_players"], tm["tm_players"], match_tm(wd["wd_players"], tm["tm_players"]), female)
    pid_for_tm = players.dropna(subset=["tm_id"]).set_index("tm_id")["player_id"]
    national_ids = set(tm["tm_national_teams"]["national_team_id"].dropna())
    stints = build_stints(wd["wd_stints"], teams, tm["tm_appearances"], tm_to_club, pid_for_tm, national_ids, redirect)
    stints = stints[stints["player_id"].isin(set(players["player_id"]))].reset_index(drop=True)  # drop coaches etc.
    players = add_years(add_international(players, wd["wd_stints"], teams, nations), stints)
    names = build_names(players, clubs, nations, wd["wd_aliases"])
    return {"players": players.reindex(columns=PLAYER_COLS), "clubs": clubs, "nations": nations,
            "stints": stints, "names": names,
            "tm_to_club": tm_to_club.rename("club_id").reset_index(),
            "tm_to_player": pid_for_tm.rename("player_id").reset_index()}


def main() -> int:
    tm = {f"tm_{t}": pd.read_parquet(OUT / f"tm_{t}.parquet")
          for t in ["players", "clubs", "games", "appearances", "national_teams"]}
    wd = {n: pd.read_parquet(OUT / f"{n}.parquet")
          for n in ["wd_teams", "wd_club_map", "wd_league_clubs", "wd_players", "wd_stints", "wd_aliases", "wd_female"]}
    for name, df in build(tm, wd).items():
        df.to_parquet(OUT / f"{name}.parquet", index=False)
        print(f"{name}: {len(df):,} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
