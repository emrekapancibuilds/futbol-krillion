import numpy as np
import pandas as pd

from jobless import fame_entities as fe
from jobless.norm import log_scale

PV = pd.DataFrame({"title": ["Real Madrid CF", "Burnley F.C."], "views60": [900_000, 20_000]})


def clubs():
    return pd.DataFrame({
        "club_id": ["Qreal", "Qburnley", "tmc:5", "Qold"],
        "qid": ["Qreal", "Qburnley", None, "Qold"],
        "tm_club_id": ["418", "1132", "5", None],
        "sitelinks": [150.0, 60.0, np.nan, 10.0],
        "article": ["https://en.wikipedia.org/wiki/Real_Madrid_CF", "https://en.wikipedia.org/wiki/Burnley_F.C.", None, None]})


def test_clubs_rank_by_attention_seasons_and_trophies():
    league_apps = pd.DataFrame({"club_id": ["Qreal"] * 3 + ["Qburnley"], "league_key": ["la-liga"] * 3 + ["premier-league"],
                                "season": [2012.0, 2013.0, 2014.0, 2015.0]})
    champions = pd.DataFrame({"competition_key": ["champions-league", "la-liga"], "season": [2013.0, 2016.0],
                              "club_id": ["Qreal", "Qreal"]})
    out = fe.club_fame(clubs(), PV, league_apps, champions).set_index("entity_id")
    assert out.loc["Qreal", "fame_rank"] == 1
    assert out.loc["Qreal", "fame"] > out.loc["Qburnley", "fame"]
    assert not np.isnan(out.loc["tmc:5", "fame"])     # no Wikidata item: scored on TM components only
    assert not np.isnan(out.loc["Qold", "fame"])      # no TM data: scored on attention only
    assert out["prestige"].between(0, 1).all()


def test_attention_without_page_views_is_the_sitelink_percentile():
    sitelinks = pd.Series([100.0, 10.0, np.nan])
    views = pd.Series([np.nan, np.nan, np.nan])
    out = fe.attention(sitelinks, views, pd.Series([True, True, False]))
    assert out.iloc[0] == 1.0 and out.iloc[1] == 0.5 and np.isnan(out.iloc[2])


def test_competition_weight():
    assert fe.competition_weight("GB1") == 1.0
    assert fe.competition_weight("CL") == 1.2
    assert fe.competition_weight("FIWC") == 1.2
    assert fe.competition_weight("XYZ") == 0.1


def test_managers_and_stadiums_use_club_prestige():
    prestige = pd.Series({"Qreal": 1.0, "Qburnley": 0.5})
    spells = pd.DataFrame({"manager_id": ["mgr:a", "mgr:b"], "club_id": ["Qreal", "Qburnley"],
                           "league_key": ["la-liga", "premier-league"], "season": [2015.0, 2015.0], "games": [152, 38]})
    mgr = fe.manager_fame(pd.DataFrame({"manager_id": ["mgr:a", "mgr:b"], "name": ["A", "B"]}), spells, prestige)
    assert mgr.set_index("entity_id").loc["mgr:a", "fame_rank"] == 1
    st = pd.DataFrame({"stadium_id": ["std:bernabeu", "std:turf moor"], "attendance": [80000.0, 20000.0],
                       "home_club_id": ["Qreal", "Qburnley"]})
    games = pd.DataFrame({"stadium_id": ["std:bernabeu", "std:bernabeu", "std:turf moor"],
                          "competition_id": ["CL", "ES1", "GB1"]})
    assert fe.stadium_fame(st, games, prestige).set_index("entity_id").loc["std:bernabeu", "fame_rank"] == 1


def test_attention_can_use_log_scaling():
    sitelinks = pd.Series([1.0] * 100 + [30.0, 200.0])
    out = fe.attention(sitelinks, pd.Series([np.nan] * 102), pd.Series([True] * 102), scale=log_scale)
    assert out.iloc[-1] == 1.0 and out.iloc[-1] - out.iloc[-2] > 0.3
