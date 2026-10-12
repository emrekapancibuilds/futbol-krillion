"""Fame and tiers for clubs, nations, managers and stadiums (spec §4 'other entity types')."""
import pandas as pd

from jobless.config import (CHAMPIONS_LEAGUE_WEIGHT, ENTITY_FAME_WEIGHTS, LEAGUE_BY_TM, LEAGUES, OTHER_LEAGUE_WEIGHT,
                            OUT, TOURNAMENT_WEIGHT, TOURNAMENTS)
from jobless.norm import combine, pct, rank_tiers
from jobless import pageviews
from jobless.pageviews import views_for

LEAGUE_WEIGHT = {k: lg.weight for k, lg in LEAGUES.items()}


def attention(sitelinks: pd.Series, views: pd.Series, has_item: pd.Series, scale=pct) -> pd.Series:
    """Mean of the sitelink and page-view percentiles that exist; NaN for entities with no Wikidata item.
    Page views that were never fetched are skipped, so with no page-view data this is the sitelink percentile."""
    both = pd.concat([scale(sitelinks.where(has_item)), scale(views.where(has_item))], axis=1)
    return both.mean(axis=1)


def _finish(ids: pd.Series, comps: pd.DataFrame, kind: str) -> pd.DataFrame:
    fame = combine(comps, ENTITY_FAME_WEIGHTS[kind])
    out = rank_tiers(fame)
    out.insert(0, "entity_id", ids.values)
    out["prestige"] = fame.rank(pct=True).fillna(0)
    return out.reset_index(drop=True)


def club_fame(clubs, pageviews, league_apps, champions) -> pd.DataFrame:
    c = clubs.reset_index(drop=True)
    in_tm = c["tm_club_id"].notna()
    seasons = league_apps[["club_id", "league_key", "season"]].drop_duplicates()
    top_flight = (seasons["league_key"].map(LEAGUE_WEIGHT).groupby(seasons["club_id"]).sum())
    trophy_w = champions["competition_key"].eq("champions-league").map({True: 2, False: 1})
    trophies = trophy_w.groupby(champions["club_id"]).sum()
    comps = pd.DataFrame({
        "attention": attention(c["sitelinks"], views_for(c["article"], pageviews), c["qid"].notna()),
        "top_flight": pct(c["club_id"].map(top_flight).fillna(0).where(in_tm)),
        "trophies": pct(c["club_id"].map(trophies).fillna(0).where(in_tm)),
    })
    return _finish(c["club_id"], comps, "club")


def nation_fame(nations, pageviews, nation_tournaments) -> pd.DataFrame:
    n = nations.reset_index(drop=True)
    count = nation_tournaments.groupby("nation_id")["edition"].nunique()
    comps = pd.DataFrame({
        "attention": attention(n["sitelinks"], views_for(n["article"], pageviews), n["qid"].notna()),
        "tournaments": pct(n["nation_id"].map(count).fillna(0).where(n["tm_team_id"].notna())),
    })
    return _finish(n["nation_id"], comps, "nation")


def manager_fame(managers, spells, club_prestige) -> pd.DataFrame:
    m = managers.reset_index(drop=True)
    weighted = (spells["games"] * spells["league_key"].map(LEAGUE_WEIGHT).fillna(OTHER_LEAGUE_WEIGHT)).groupby(
        spells["manager_id"]).sum()
    peak = spells["club_id"].map(club_prestige).fillna(0).groupby(spells["manager_id"]).max()
    comps = pd.DataFrame({"games": pct(m["manager_id"].map(weighted)), "club_peak": pct(m["manager_id"].map(peak))})
    return _finish(m["manager_id"], comps, "manager")


def competition_weight(competition_id: str) -> float:
    if competition_id in LEAGUE_BY_TM:
        return LEAGUE_WEIGHT[LEAGUE_BY_TM[competition_id]]
    if competition_id == "CL":
        return CHAMPIONS_LEAGUE_WEIGHT
    if competition_id in TOURNAMENTS:
        return TOURNAMENT_WEIGHT
    return OTHER_LEAGUE_WEIGHT


def stadium_fame(stadiums, stadium_games, club_prestige) -> pd.DataFrame:
    s = stadiums.reset_index(drop=True)
    hosted = stadium_games["competition_id"].map(competition_weight).groupby(stadium_games["stadium_id"]).sum()
    comps = pd.DataFrame({
        "hosted": pct(s["stadium_id"].map(hosted)),
        "attendance": pct(s["attendance"]),
        "home_prestige": pct(s["home_club_id"].map(club_prestige).fillna(0)),
    })
    return _finish(s["stadium_id"], comps, "stadium")


def main() -> int:
    read = lambda name: pd.read_parquet(OUT / f"{name}.parquet")
    pv = pageviews.load()
    clubs = club_fame(read("clubs"), pv, read("league_apps"), read("champions"))
    prestige = clubs.set_index("entity_id")["prestige"]
    frames = {"fame_clubs": clubs,
              "fame_nations": nation_fame(read("nations"), pv, read("nation_tournaments")),
              "fame_managers": manager_fame(read("managers"), read("manager_spells"), prestige),
              "fame_stadiums": stadium_fame(read("stadiums"), read("stadium_games"), prestige)}
    for name, df in frames.items():
        df.to_parquet(OUT / f"{name}.parquet", index=False)
        print(f"{name}: {len(df):,} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
