"""Shared scoring helpers: log-percentiles, weighted combination with missing data, rank -> tier."""
import numpy as np
import pandas as pd

from jobless.tiers import tier_for_rank, tier_points


def pct(series: pd.Series) -> pd.Series:
    """Percentile rank in (0, 1] of log1p(value); the largest value gets 1.0 and NaN stays NaN."""
    return np.log1p(series.astype("float64").clip(lower=0)).rank(method="average", pct=True)


def log_scale(series: pd.Series) -> pd.Series:
    """log1p(value) / log1p(largest value): 0..1 with NaN kept.

    Used for player fame instead of pct(): with ~180k mostly obscure players, every real career sits in the top
    few percent, so percentiles squash a star and a journeyman together. Scaling against the maximum keeps the gap."""
    s = np.log1p(series.astype("float64").clip(lower=0))
    top = s.max()
    return s / top if top > 0 else s * 0.0


def combine(components: pd.DataFrame, weights: dict[str, float]) -> pd.Series:
    """Weighted mean of the components present on each row; missing ones are left out and the
    remaining weights are scaled back up to sum to 1 (spec §4 'missing data')."""
    w = pd.Series(weights, dtype="float64")
    cols = components[list(w.index)]
    num = cols.fillna(0).mul(w, axis=1).sum(axis=1)
    den = cols.notna().mul(w, axis=1).sum(axis=1)
    return (num / den).where(den > 0)


def rank_tiers(fame: pd.Series, cutoffs: list[int] | None = None) -> pd.DataFrame:
    """fame_rank (1 = most famous; ties keep input order), tier and points for every row.
    cutoffs: highest rank per tier (players pass tiers.player_cutoffs); default is the percentage cutoffs."""
    rank = fame.fillna(-1.0).rank(method="first", ascending=False).astype(int)
    n = len(fame)
    tier = rank.map(lambda r: tier_for_rank(r, n, cutoffs))
    return pd.DataFrame({"fame": fame, "fame_rank": rank, "tier": tier, "points": tier.map(tier_points)},
                        index=fame.index)
