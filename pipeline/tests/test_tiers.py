import pytest

from jobless.tiers import player_cutoffs, tier_cutoffs, tier_for_rank, tier_name, tier_points


def test_cutoffs_for_50k_match_spec():
    assert tier_cutoffs(50_000) == [300, 1500, 4000, 9000, 18000, 32000, 50000]


@pytest.mark.parametrize("rank,tier", [
    (1, 1), (300, 1), (301, 2), (1500, 2), (1501, 3), (4000, 3), (4001, 4),
    (9000, 4), (9001, 5), (18000, 5), (18001, 6), (32000, 6), (32001, 7), (50000, 7)])
def test_tier_for_rank(rank, tier):
    assert tier_for_rank(rank, 50_000) == tier


@pytest.mark.parametrize("population", [50_000, 100_569, 250_000])
def test_player_cutoffs_are_fixed_ranks_whatever_the_database_size(population):
    cuts = player_cutoffs(population)
    assert tier_for_rank(300, population, cuts) == 1 and tier_for_rank(301, population, cuts) == 2
    assert tier_for_rank(32_000, population, cuts) == 6 and tier_for_rank(32_001, population, cuts) == 7
    assert tier_for_rank(population, population, cuts) == 7


def test_tiny_population_still_has_a_bandwagon():
    assert tier_for_rank(1, 10) == 1


def test_rank_out_of_range():
    with pytest.raises(ValueError):
        tier_for_rank(0, 10)


def test_names_and_points():
    assert (tier_name(1), tier_points(1)) == ("World Cup Bandwagon", 10)
    assert (tier_name(7), tier_points(7)) == ("Jobless", 1000)


def test_player_cutoffs_are_less_strict_in_the_middle():
    """User call 2026-10-11: the fitted formula rated mid-level players too famous (Nélson Oliveira as Glory Hunter),
    so the middle boundaries moved down; Bandwagon (300) and the Jobless line (32,000) stay where they were."""
    assert player_cutoffs(180_000) == [300, 1000, 2000, 5000, 12000, 32000, 180_000]
