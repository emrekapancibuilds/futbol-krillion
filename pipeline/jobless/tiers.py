"""Fame rank -> tier and points (spec §2)."""
from jobless.config import PLAYER_TIER_RANKS, TIER_UPPER_FRACTION, TIERS


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
