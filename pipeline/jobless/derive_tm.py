"""Facts derived from Transfermarkt games and appearances (2012 onwards): league apps, titles,
tournaments, managers, stadiums and European participation."""
import pandas as pd

from jobless.config import (EUROPEAN_COMPETITIONS, LEAGUE_BY_TM, LEAGUES, OUT, TABLE_DECIDED_LEAGUES,
                            TOURNAMENTS)
from jobless.text import fold

CL = "CL"
MIN_TOURNAMENT_GAMES = 30
OWN_GOAL = r"^\s*,\s*Own-goal"


def _apps(appearances, games, pid_for_tm, tm_to_club):
    a = appearances.merge(games[["game_id", "season"]], on="game_id", how="left")
    a["pid"] = a["player_id"].map(pid_for_tm)
    a["club_id"] = a["player_club_id"].map(tm_to_club)
    return a.dropna(subset=["pid"])


def league_apps(a):
    x = a[a["competition_id"].isin(LEAGUE_BY_TM)].dropna(subset=["club_id"])
    x = x.assign(league_key=x["competition_id"].map(LEAGUE_BY_TM))
    return (x.groupby(["pid", "league_key", "season", "club_id"])
            .agg(apps=("game_id", "count"), goals=("goals", "sum")).reset_index()
            .rename(columns={"pid": "player_id"}))


def cl_apps(a):
    x = a[a["competition_id"] == CL].dropna(subset=["club_id"])
    return (x.groupby(["pid", "season", "club_id"]).agg(apps=("game_id", "count")).reset_index()
            .rename(columns={"pid": "player_id"}))


def champions(games, tm_to_club):
    """Table-decided league champions of complete seasons, plus Champions League winners."""
    tm_ids = {LEAGUES[k].tm: k for k in TABLE_DECIDED_LEAGUES}
    g = games[games["competition_id"].isin(tm_ids)].dropna(subset=["home_club_goals", "away_club_goals"])
    home = pd.DataFrame({"comp": g["competition_id"], "season": g["season"], "club": g["home_club_id"],
                         "gf": g["home_club_goals"], "ga": g["away_club_goals"]})
    away = pd.DataFrame({"comp": g["competition_id"], "season": g["season"], "club": g["away_club_id"],
                         "gf": g["away_club_goals"], "ga": g["home_club_goals"]})
    rows = pd.concat([home, away])
    rows["pts"] = (rows["gf"] > rows["ga"]) * 3 + (rows["gf"] == rows["ga"]) * 1
    rows["gd"] = rows["gf"] - rows["ga"]
    table = rows.groupby(["comp", "season", "club"]).agg(pts=("pts", "sum"), gd=("gd", "sum"), gf=("gf", "sum"),
                                                          played=("pts", "size")).reset_index()
    size = table.groupby(["comp", "season"]).agg(clubs=("club", "size"), played=("played", "sum"))
    complete = size[size["played"] >= 0.95 * size["clubs"] * 2 * (size["clubs"] - 1)].index
    table = table.set_index(["comp", "season"]).loc[lambda t: t.index.isin(complete)].reset_index()
    top = (table.sort_values(["comp", "season", "pts", "gd", "gf"], ascending=[True, True, False, False, False])
           .drop_duplicates(["comp", "season"]))
    leagues = pd.DataFrame({"competition_key": top["comp"].map(tm_ids), "season": top["season"],
                            "club_id": top["club"].map(tm_to_club)})
    finals = games[(games["competition_id"] == CL) & games["round"].str.lower().eq("final")]
    winner = finals["home_club_id"].where(finals["home_club_goals"] > finals["away_club_goals"], finals["away_club_id"])
    cl = pd.DataFrame({"competition_key": "champions-league", "season": finals["season"],
                       "club_id": winner.map(tm_to_club)})
    return pd.concat([leagues, cl], ignore_index=True).dropna(subset=["club_id"])


def editions(games):
    """Complete World Cups / Euros in the data (a final is present and at least 30 games)."""
    g = games[games["competition_id"].isin(TOURNAMENTS)].copy()
    g["yr"] = g["date"].str[:4].astype(int)
    g["is_final"] = g["round"].str.lower().eq("final")
    ed = (g.groupby(["competition_id", "season"])
          .agg(year=("yr", "min"), games=("game_id", "count"), has_final=("is_final", "any")).reset_index())
    ed = ed[ed["has_final"] & (ed["games"] >= MIN_TOURNAMENT_GAMES)].copy()
    ed["kind"] = ed["competition_id"].map(TOURNAMENTS)
    ed["label_year"] = ed["year"].where(~((ed["kind"] == "Euro") & (ed["year"] == 2021)), 2020)  # Euro 2020 ran in 2021
    ed["edition"] = [f"{y} World Cup" if k == "World Cup" else f"Euro {y}" for k, y in zip(ed["kind"], ed["label_year"])]
    return ed[["competition_id", "season", "kind", "year", "label_year", "edition"]]


def tournament_apps(events, games, eds, pid_for_tm, nation_for_tm):
    """Per player, edition and nation: games with any event (goal, card, sub on or off) and goals scored.

    The event-based game count misses players who played a whole game without an event, so it only feeds
    the fame formula. Goals are complete and drive the scorer prompts. Own goals don't count."""
    tour = games.merge(eds, on=["competition_id", "season"])[["game_id", "edition", "kind", "label_year"]]
    ev = events.merge(tour, on="game_id")
    is_goal = ev["type"].eq("Goals") & ~ev["description"].fillna("").str.contains(OWN_GOAL, regex=True)
    rows = pd.concat([
        ev.assign(tm=ev["player_id"], goal=is_goal.astype(int)),
        ev[ev["type"].eq("Substitutions")].assign(tm=lambda d: d["player_in_id"], goal=0),
    ]).dropna(subset=["tm"])
    rows["player_id"] = rows["tm"].map(pid_for_tm)
    rows["nation_id"] = rows["club_id"].map(nation_for_tm)
    return (rows.dropna(subset=["player_id", "nation_id"])
            .groupby(["player_id", "edition", "kind", "label_year", "nation_id"])
            .agg(apps=("game_id", "nunique"), goals=("goal", "sum")).reset_index())


def nation_tournaments(games, eds, nation_for_tm):
    g = games.merge(eds, on=["competition_id", "season"])
    rows = pd.concat([g[["edition", "kind", "label_year", "home_club_id"]].set_axis(["edition", "kind", "label_year", "tm"], axis=1),
                      g[["edition", "kind", "label_year", "away_club_id"]].set_axis(["edition", "kind", "label_year", "tm"], axis=1)])
    rows["nation_id"] = rows["tm"].map(nation_for_tm)
    return rows.dropna(subset=["nation_id"]).drop(columns="tm").drop_duplicates().reset_index(drop=True)


def managers(games, tm_to_club):
    g = games[games["competition_id"].isin(LEAGUE_BY_TM)]
    rows = pd.concat([
        g[["home_club_manager_name", "home_club_id", "competition_id", "season"]].set_axis(["name", "tm", "comp", "season"], axis=1),
        g[["away_club_manager_name", "away_club_id", "competition_id", "season"]].set_axis(["name", "tm", "comp", "season"], axis=1),
    ]).dropna(subset=["name"])
    rows["manager_id"] = "mgr:" + rows["name"].map(fold)
    rows["club_id"] = rows["tm"].map(tm_to_club)
    rows["league_key"] = rows["comp"].map(LEAGUE_BY_TM)
    spells = (rows.dropna(subset=["club_id"]).groupby(["manager_id", "club_id", "league_key", "season"])
              .size().rename("games").reset_index())
    names = rows.groupby("manager_id")["name"].agg(lambda s: s.mode().iloc[0]).rename("name").reset_index()
    return spells, names


def stadiums(games, tm_to_club):
    g = games.dropna(subset=["stadium"]).copy()
    g["stadium_id"] = "std:" + g["stadium"].map(fold)
    g["home_club"] = g["home_club_id"].map(tm_to_club)
    league = g[g["competition_id"].isin(LEAGUE_BY_TM)]
    home = league.groupby("stadium_id")["home_club"].agg(lambda s: s.mode().iloc[0] if s.notna().any() else None)
    table = g.groupby("stadium_id").agg(name=("stadium", lambda s: s.mode().iloc[0]), games=("game_id", "count"),
                                         attendance=("attendance", "sum")).reset_index()
    table["home_club_id"] = table["stadium_id"].map(home)
    stadium_games = g[["stadium_id", "game_id", "competition_id", "season", "round"]].reset_index(drop=True)
    return table, stadium_games


def euro_clubs(games, tm_to_club):
    g = games[games["competition_id"].isin(EUROPEAN_COMPETITIONS)]
    rows = pd.concat([g[["home_club_id", "competition_id", "season"]].set_axis(["tm", "competition_id", "season"], axis=1),
                      g[["away_club_id", "competition_id", "season"]].set_axis(["tm", "competition_id", "season"], axis=1)])
    rows["club_id"] = rows["tm"].map(tm_to_club)
    return rows.dropna(subset=["club_id"]).drop(columns="tm").drop_duplicates().reset_index(drop=True)


def derive(games, appearances, events, tm_to_club, pid_for_tm, nation_for_tm) -> dict[str, pd.DataFrame]:
    a = _apps(appearances, games, pid_for_tm, tm_to_club)
    eds = editions(games)
    spells, manager_names = managers(games, tm_to_club)
    stadium_table, stadium_games = stadiums(games, tm_to_club)
    return {"league_apps": league_apps(a), "cl_apps": cl_apps(a), "champions": champions(games, tm_to_club),
            "editions": eds, "tournament_apps": tournament_apps(events, games, eds, pid_for_tm, nation_for_tm),
            "nation_tournaments": nation_tournaments(games, eds, nation_for_tm),
            "manager_spells": spells, "managers": manager_names, "stadiums": stadium_table,
            "stadium_games": stadium_games, "euro_clubs": euro_clubs(games, tm_to_club)}


def main() -> int:
    tm_to_club = pd.read_parquet(OUT / "tm_to_club.parquet").set_index("tm_club_id")["club_id"]
    pid_for_tm = pd.read_parquet(OUT / "tm_to_player.parquet").set_index("tm_id")["player_id"]
    nations = pd.read_parquet(OUT / "nations.parquet")
    nation_for_tm = nations.dropna(subset=["tm_team_id"]).drop_duplicates("tm_team_id").set_index("tm_team_id")["nation_id"]
    frames = derive(pd.read_parquet(OUT / "tm_games.parquet"), pd.read_parquet(OUT / "tm_appearances.parquet"),
                    pd.read_parquet(OUT / "tm_game_events.parquet"), tm_to_club, pid_for_tm, nation_for_tm)
    for name, df in frames.items():
        df.to_parquet(OUT / f"{name}.parquet", index=False)
        print(f"{name}: {len(df):,} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
