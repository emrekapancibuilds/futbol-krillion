"""Player fame: six components -> one score -> absolute tier (spec §4)."""
import json

import numpy as np
import pandas as pd

from jobless.config import (CHAMPIONS_LEAGUE_WEIGHT, CLUB_PEAK_FULL_APPS, CLUB_PEAK_UNKNOWN_APPS_FACTOR,
                            ERA_CUTOFF_YEAR, ERA_FLOOR, ERA_SLOPE, FAME_WEIGHTS, LEAGUES, LEGEND_TOP_N,
                            MAJOR_AWARD_SITELINKS, OTHER_LEAGUE_WEIGHT, OUT)
from jobless.fame_entities import attention
from jobless.norm import combine, log_scale, rank_tiers
from jobless import pageviews
from jobless.pageviews import views_for
from jobless.tiers import player_cutoffs

LEAGUE_WEIGHT = {k: lg.weight for k, lg in LEAGUES.items()}


def league_raw(stints, clubs, league_apps, cl_apps) -> pd.Series:
    """max(Transfermarkt-based, Wikidata-based) weighted appearances; absent when neither source has apps."""
    tm = (league_apps["apps"] * league_apps["league_key"].map(LEAGUE_WEIGHT)).groupby(league_apps["player_id"]).sum()
    tm = tm.add(cl_apps.groupby("player_id")["apps"].sum() * CHAMPIONS_LEAGUE_WEIGHT, fill_value=0)
    wd = stints[(stints["source"] == "wd") & stints["apps"].notna()]
    club_w = clubs.set_index("club_id")["league_key"].map(LEAGUE_WEIGHT).fillna(OTHER_LEAGUE_WEIGHT)
    wd_raw = (wd["apps"] * wd["club_id"].map(club_w).fillna(OTHER_LEAGUE_WEIGHT)).groupby(wd["player_id"]).sum()
    return pd.concat([tm.rename("tm"), wd_raw.rename("wd")], axis=1).max(axis=1)


def club_peak_raw(stints, club_prestige) -> pd.Series:
    factor = np.where(stints["apps"].notna(), np.minimum(1.0, stints["apps"].fillna(0) / CLUB_PEAK_FULL_APPS),
                      CLUB_PEAK_UNKNOWN_APPS_FACTOR)
    return (stints["club_id"].map(club_prestige).fillna(0) * factor).groupby(stints["player_id"]).max()


def titles(league_apps, cl_apps, champions) -> pd.Series:
    """League titles + 2 x Champions League wins, from appearances for the winning club that season."""
    leagues = champions[champions["competition_key"] != "champions-league"]
    won = league_apps.merge(leagues, left_on=["league_key", "season", "club_id"],
                            right_on=["competition_key", "season", "club_id"])
    cl = champions[champions["competition_key"] == "champions-league"][["season", "club_id"]]
    won_cl = cl_apps.merge(cl, on=["season", "club_id"])
    return won.groupby("player_id").size().add(2 * won_cl.groupby("player_id").size(), fill_value=0)


def award_score(awards, award_info) -> pd.Series:
    major = pd.to_numeric(award_info["sitelinks"], errors="coerce").fillna(0) >= MAJOR_AWARD_SITELINKS
    weight = pd.Series(np.where(major, 3, 1), index=award_info["award"].values)
    return awards["award"].map(weight).fillna(1).groupby(awards["p"]).sum()


def era_weight(last_year: pd.Series, attention_: pd.Series) -> pd.Series:
    discount = (1 - ERA_SLOPE * (ERA_CUTOFF_YEAR - last_year)).clip(lower=ERA_FLOOR)
    legend = attention_.rank(ascending=False, method="min") <= LEGEND_TOP_N
    old = (last_year < ERA_CUTOFF_YEAR) & ~legend
    return pd.Series(np.where(old, discount, 1.0), index=last_year.index)


def components(players, stints, clubs, club_prestige, nation_prestige, league_apps, cl_apps, champions,
               tournament_apps, awards, award_info, pageviews) -> pd.DataFrame:
    p = players.set_index("player_id")
    tour = tournament_apps.groupby("player_id")["apps"].sum().reindex(p.index).fillna(0)
    intl = p["caps"].fillna(0) * p["nation_id"].map(nation_prestige).fillna(0) + 2 * tour
    honours = (titles(league_apps, cl_apps, champions).reindex(p.index).fillna(0)
               + award_score(awards, award_info).reindex(p.index).fillna(0))
    att = attention(p["sitelinks"], views_for(p["article"], pageviews), p["qid"].notna(), scale=log_scale)
    comp = pd.DataFrame({
        "league": log_scale(league_raw(stints, clubs, league_apps, cl_apps).reindex(p.index)),
        "club_peak": log_scale(club_peak_raw(stints, club_prestige).reindex(p.index)),
        "market_value": log_scale(p["peak_value"]),
        "international": log_scale(intl),
        "honours": log_scale(honours),
        "attention": att,
    }, index=p.index)
    comp["era"] = era_weight(p["last_year"], att)
    return comp


def score(comp: pd.DataFrame, weights: dict[str, float] = FAME_WEIGHTS) -> pd.DataFrame:
    return rank_tiers(comp["era"] * combine(comp, weights), player_cutoffs(len(comp)))


def load_weights() -> dict[str, float]:
    path = OUT / "fame_weights.json"
    return json.loads(path.read_text()) if path.exists() else dict(FAME_WEIGHTS)


def main() -> int:
    read = lambda name: pd.read_parquet(OUT / f"{name}.parquet")
    comp = components(read("players"), read("stints"), read("clubs"),
                      read("fame_clubs").set_index("entity_id")["prestige"],
                      read("fame_nations").set_index("entity_id")["prestige"],
                      read("league_apps"), read("cl_apps"), read("champions"), read("tournament_apps"),
                      read("wd_awards"), read("wd_award_info"), pageviews.load())
    comp.to_parquet(OUT / "player_components.parquet")
    scored = score(comp, load_weights())
    scored.rename_axis("entity_id").reset_index().to_parquet(OUT / "fame_players.parquet", index=False)
    print(f"fame_players: {len(scored):,} rows; tier sizes {scored['tier'].value_counts().sort_index().tolist()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
