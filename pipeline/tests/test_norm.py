import numpy as np
import pandas as pd

from jobless.norm import combine, log_scale, pct, rank_tiers


def test_pct_orders_and_keeps_nan():
    out = pct(pd.Series([0, 10, 1000, np.nan]))
    assert out.iloc[2] == 1.0 and out.iloc[0] < out.iloc[1] < out.iloc[2]
    assert np.isnan(out.iloc[3])


def test_combine_rescales_weights_when_a_component_is_missing():
    comps = pd.DataFrame({"a": [0.5, 0.5], "b": [np.nan, 1.0]})
    out = combine(comps, {"a": 0.5, "b": 0.5})
    assert out.tolist() == [0.5, 0.75]


def test_combine_all_missing_is_nan():
    assert np.isnan(combine(pd.DataFrame({"a": [np.nan]}), {"a": 1.0}).iloc[0])


def test_rank_tiers_puts_missing_fame_last():
    out = rank_tiers(pd.Series([0.2, np.nan, 0.9], index=["x", "y", "z"]))
    assert out.loc["z", "fame_rank"] == 1 and out.loc["y", "fame_rank"] == 3
    assert out.loc["y", "tier"] == 7 and out.loc["y", "points"] == 1000


def test_log_scale_keeps_the_gap_at_the_top_that_percentiles_squash():
    # 1,000 barely documented players plus a journeyman (30) and a star (200): the real database looks like this.
    s = pd.Series([1.0] * 1000 + [30.0, 200.0])
    scaled, ranked = log_scale(s), pct(s)
    assert scaled.iloc[-1] == 1.0
    assert scaled.iloc[-1] - scaled.iloc[-2] > 0.3      # log1p(30) / log1p(200) is about 0.65
    assert ranked.iloc[-1] - ranked.iloc[-2] < 0.01     # percentiles can hardly tell them apart


def test_log_scale_keeps_nan_and_handles_all_zero():
    out = log_scale(pd.Series([0.0, np.nan, 0.0]))
    assert out.iloc[0] == 0.0 and np.isnan(out.iloc[1])
