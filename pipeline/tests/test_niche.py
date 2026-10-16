import numpy as np
import pandas as pd

from jobless import niche


def frames():
    fame = pd.DataFrame({"entity_id": ["Q1", "Q2", "Q3", "Q4", "Q5"], "fame": [0.9, 0.3, 0.0, 0.0, 0.0],
                         "fame_rank": [1, 2, 3, 4, 5]})
    players = pd.DataFrame({
        "player_id": ["Q1", "Q2", "Q3", "Q4", "Q5"],
        "nation_id": ["Qfra", None, "Qesp", "Qesp", "Qesp"], "positions": ["FW|MF", None, "GK", "DF", "MF"],
        "first_year": [1994.0, np.nan, 2010.0, 2012.0, 2015.0], "last_year": [2015.0, np.nan, 2015.0, 2012.0, np.nan],
        "peak_value": [1e8, np.nan, 50_000.0, 400_000.0, np.nan]})
    nations = pd.DataFrame({"nation_id": ["Qfra", "Qesp"], "name": ["France", "Spain"]})
    return fame, players, nations


def test_rows_carry_rank_fame_and_a_one_line_description():
    rows = niche.rows(*frames())
    assert rows["Q1"][:3] == [1, 0.9, "France · Forward · 1994–2015"]
    assert rows["Q2"][2] == ""                                    # nothing known: an empty line, not "None"
    assert len(rows) == 5


def test_only_players_without_any_fame_get_a_depth_for_the_off_the_charts_band():
    rows = niche.rows(*frames())
    assert rows["Q1"][3] == 0 and rows["Q2"][3] == 0
    assert all(0 <= rows[q][3] <= 100 for q in ("Q3", "Q4", "Q5"))


def test_a_known_market_value_means_a_less_niche_depth_and_unknown_values_are_deepest():
    rows = niche.rows(*frames())
    assert rows["Q4"][3] <= rows["Q3"][3] <= 40                  # 400k peak value is less niche than 50k
    assert rows["Q5"][3] >= 40                                    # no value known at all: deep


def test_the_depth_is_stable_between_runs():
    assert niche.rows(*frames()) == niche.rows(*frames())
