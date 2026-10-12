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


# ---- team categories (user, 2026-10-12): the top tier a category can reach depends on how broad it is

def test_national_team_categories_cap_at_season_ticket_holder_for_a_world_cup():
    from jobless.tiers import team_cap
    assert team_cap("nation", 16) == 3          # a 16-team Euro: nobody is obscure
    assert team_cap("nation", 24) == 4
    assert team_cap("nation", 32) == 4          # a World Cup: Season Ticket Holder at most
    assert team_cap("nation", 48) == 4          # 2026: Curaçao is Season Ticket Holder, never Jobless
    assert team_cap("nation", 70) == 5          # every World Cup team since 2006
    assert max(team_cap("nation", n) for n in (10, 30, 100, 400, 5000)) < 7


def test_club_categories_reach_higher_than_national_teams_of_the_same_size():
    from jobless.tiers import team_cap
    for n in (16, 33, 37, 103):
        assert team_cap("club", n) > team_cap("nation", n)
    assert team_cap("club", 33) == 5            # a league: True Analyst at most
    assert team_cap("club", 103) == 6           # every Champions League club since 2012
    assert team_cap("club", 659) == 7           # every club in Europe since 2012: Jobless is possible


def test_team_tiers_rank_a_category_against_itself_and_fill_every_tier_up_to_the_cap():
    from jobless.tiers import team_tiers
    import pandas as pd
    scores = pd.Series({f"t{i}": 100 - i for i in range(32)})
    tiers = team_tiers(scores, 4)
    assert tiers.iloc[0] == 1 and tiers.iloc[-1] == 4        # best is Bandwagon, worst is the cap
    assert set(tiers) == {1, 2, 3, 4}
    assert tiers.is_monotonic_increasing                       # a better score never gets a higher tier
    assert (tiers == 1).sum() == 4                            # 12% of 32, rounded up


def test_team_tiers_for_a_tiny_category_still_have_a_bandwagon():
    from jobless.tiers import team_tiers
    import pandas as pd
    tiers = team_tiers(pd.Series({"a": 3.0, "b": 2.0, "c": 1.0}), 3)
    assert tiers["a"] == 1 and tiers["c"] == 3


def test_team_tiers_break_ties_in_input_order_and_cap_never_exceeded():
    from jobless.tiers import team_tiers
    import pandas as pd
    tiers = team_tiers(pd.Series([5.0] * 40, index=[f"x{i}" for i in range(40)]), 5)
    assert tiers.max() == 5 and tiers.min() == 1 and tiers.is_monotonic_increasing
