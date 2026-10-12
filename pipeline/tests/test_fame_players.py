import numpy as np
import pandas as pd

from jobless import fame_players as fp


def test_league_raw_takes_the_larger_source_and_leaves_unknown_missing():
    stints = pd.DataFrame({"player_id": ["a", "b", "c"], "club_id": ["Q1", "Q1", "Q1"],
                           "apps": [100.0, 10.0, np.nan], "source": ["wd", "wd", "wd"]})
    clubs = pd.DataFrame({"club_id": ["Q1"], "league_key": ["premier-league"]})
    league_apps = pd.DataFrame({"player_id": ["b"], "league_key": ["premier-league"], "apps": [50]})
    cl_apps = pd.DataFrame({"player_id": ["b"], "apps": [10]})
    out = fp.league_raw(stints, clubs, league_apps, cl_apps)
    assert out["a"] == 100 and out["b"] == 62     # 50 * 1.0 + 10 * 1.2 > 10
    assert "c" not in out.index


def test_club_peak_scales_by_apps_and_halves_unknown():
    stints = pd.DataFrame({"player_id": ["a", "a", "b"], "club_id": ["big", "small", "big"], "apps": [3.0, 300.0, np.nan]})
    out = fp.club_peak_raw(stints, pd.Series({"big": 1.0, "small": 0.2}))
    assert out["a"] == 0.2 and out["b"] == 0.5


def test_titles_count_league_and_double_champions_league():
    la = pd.DataFrame({"player_id": ["a"], "league_key": ["bundesliga"], "season": [2012.0], "club_id": ["bay"]})
    cl = pd.DataFrame({"player_id": ["a"], "season": [2012.0], "club_id": ["bay"]})
    champs = pd.DataFrame({"competition_key": ["bundesliga", "champions-league"], "season": [2012.0, 2012.0],
                           "club_id": ["bay", "bay"]})
    assert fp.titles(la, cl, champs)["a"] == 3


def test_award_score_weights_major_awards():
    awards = pd.DataFrame({"p": ["a", "a"], "award": ["ballon", "local"]})
    info = pd.DataFrame({"award": ["ballon", "local"], "sitelinks": ["80", "3"]})
    assert fp.award_score(awards, info)["a"] == 4


def test_era_weight_exempts_only_the_top_legends_by_attention(monkeypatch):
    monkeypatch.setattr(fp, "LEGEND_TOP_N", 2)
    last = pd.Series([1950.0, 1950.0, 1950.0, 2010.0, np.nan])
    att = pd.Series([0.99, 0.98, 0.97, 0.1, 0.1])   # the third is well covered, but not a top-2 legend
    assert fp.era_weight(last, att).tolist() == [1.0, 1.0, 0.6, 1.0, 1.0]


def test_player_components_keep_the_gap_between_a_star_and_a_journeyman():
    n = 200
    ids = [f"p{i}" for i in range(n)]
    players = pd.DataFrame({"player_id": ids, "qid": ids, "sitelinks": [2.0] * (n - 2) + [30.0, 200.0],
                            "article": None, "peak_value": [1e5] * (n - 2) + [5e6, 1e8], "caps": 0.0,
                            "nation_id": None, "last_year": 2015.0})
    empty = lambda *cols: pd.DataFrame({c: pd.Series(dtype="object") for c in cols})
    comp = fp.components(players, empty("player_id", "club_id", "apps", "source"), empty("club_id", "league_key"),
                         pd.Series(dtype="float64"), pd.Series(dtype="float64"),
                         empty("player_id", "league_key", "season", "club_id", "apps"),
                         empty("player_id", "season", "club_id", "apps"), empty("competition_key", "season", "club_id"),
                         empty("player_id", "apps"), empty("p", "award"), empty("award", "sitelinks"),
                         pd.DataFrame({"title": pd.Series(dtype="str"), "views60": pd.Series(dtype="float64")}))
    star, journeyman = comp.loc["p199"], comp.loc["p198"]
    assert star["attention"] - journeyman["attention"] > 0.3
    assert star["market_value"] - journeyman["market_value"] > 0.1


def test_score_orders_and_renormalises_missing_market_value():
    comp = pd.DataFrame({
        "league": [1.0, 0.5, 0.1], "club_peak": [1.0, 0.5, 0.1], "market_value": [1.0, np.nan, 0.1],
        "international": [1.0, 0.5, 0.1], "honours": [1.0, 0.5, 0.1], "attention": [1.0, 0.5, 0.1],
        "era": [1.0, 1.0, 1.0]}, index=["star", "legend", "nobody"])
    out = fp.score(comp)
    assert out["fame_rank"].tolist() == [1, 2, 3]
    assert out.loc["legend", "fame"] == 0.5
