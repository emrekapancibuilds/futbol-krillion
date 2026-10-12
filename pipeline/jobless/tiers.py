"""Fame rank -> tier and points (spec §2)."""
import math

import pandas as pd

from jobless.config import (PLAYER_TIER_RANKS, TEAM_CAP_BEYOND, TEAM_CAPS, TEAM_TIER_FRACTIONS, TIER_UPPER_FRACTION,
                            TIERS)


def tier_cutoffs(population: int) -> list[int]:
    """Percentage cutoffs (clubs, nations, managers, stadiums): highest rank (1 = most famous) in each tier."""
    return [max(1, round(f * population)) for f in TIER_UPPER_FRACTION]


def player_cutoffs(population: int) -> list[int]:
    """Fixed-rank cutoffs for players; the last tier always ends at the population size."""
    return PLAYER_TIER_RANKS + [max(population, PLAYER_TIER_RANKS[-1])]


def tier_for_rank(rank: int, population: int, cutoffs: list[int] | None = None) -> int:
    if not 1 <= rank <= population:
        raise ValueError(f"rank {rank} outside 1..{population}")
    for tier, cutoff in enumerate(cutoffs or tier_cutoffs(population), start=1):
        if rank <= cutoff:
            return tier
    return len(TIERS)


def tier_name(tier: int) -> str:
    return TIERS[tier - 1][0]


def tier_points(tier: int) -> int:
    return TIERS[tier - 1][1]


def team_cap(entity_type: str, size: int) -> int:
    """The highest tier a team category of `size` answers can reach (config.TEAM_CAPS)."""
    for limit, cap in TEAM_CAPS[entity_type]:
        if size < limit:
            return cap
    return TEAM_CAP_BEYOND[entity_type]


def team_tiers(scores: pd.Series, cap: int) -> pd.Series:
    """Tier of each team in a category, from its rank among the others, never above `cap`. Higher score = better
    known; ties keep input order. The best team is always Bandwagon and the last tiers are always used."""
    fractions = TEAM_TIER_FRACTIONS[cap]
    n = len(scores)
    order = scores.reset_index(drop=True).rank(method="first", ascending=False).astype(int)
    cuts = [math.ceil(f * n) for f in fractions]
    tiers = order.map(lambda r: next(t for t, cut in enumerate(cuts, start=1) if r <= cut))
    return pd.Series(tiers.values, index=scores.index)
