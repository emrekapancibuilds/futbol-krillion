from jobless.gates import check, dedupe

# Rule set D (user call 2026-10-11): >= 5 easy answers (Part-Time Fan or easier), >= 2 in each of tiers 4 and 5,
# >= 1 Jobless. No Bandwagon minimum: requiring five superstars rejected every club outside ~40 giants.
GOOD = [3] * 5 + [4] * 2 + [5] * 2 + [7]


def test_passing_prompt_needs_no_bandwagon_answers():
    assert check(GOOD) is None


def test_each_rule_fails():
    assert check([1, 2, 3, 3] + [4] * 2 + [5] * 2 + [7]) == "fewer than 5 easy answers"
    assert check([1] * 5 + [4] + [5] * 2 + [7]) == "fewer than 2 tier-4 answers"
    assert check([1] * 5 + [4] * 2 + [5] + [7]) == "fewer than 2 tier-5 answers"
    assert check([1] * 5 + [4] * 2 + [5] * 2) == "no Jobless answer"


def test_dedupe_drops_near_duplicates_only():
    a = set(range(100))
    near = set(range(5, 100)) | {200}          # Jaccard ~0.94 with a
    far = set(range(50, 150))                   # Jaccard 0.33 with a
    assert dedupe([("a", a), ("near", near), ("far", far)]) == ["a", "far"]


def test_scorer_prompts_use_a_lighter_check():
    """Tournament scorers are almost all famous: they need easy answers and a few rarer ones, not a Jobless one."""
    from jobless.gates import check
    famous_heavy = [1] * 20 + [4, 4, 5]
    assert check(famous_heavy) is not None
    assert check(famous_heavy, light=True) is None
    assert check([1] * 20 + [4, 4], light=True) == "fewer than 3 answers in tier 4 or above"
    assert check([1] * 4 + [4] * 5, light=True) == "fewer than 5 easy answers"


def test_team_prompts_are_checked_against_their_own_cap():
    from jobless.gates import check_team
    wc = [1] * 4 + [2] * 6 + [3] * 10 + [4] * 12       # a 32-team World Cup, capped at Season Ticket Holder
    assert check_team(wc, cap=4) is None                 # no Jobless answer is required
    assert check_team([1, 2, 3, 4] * 2, cap=4) == "too few teams"
    assert check_team([4] * 20, cap=4) == "fewer than 5 easy answers"
    assert check_team([1] * 10 + [2] * 10, cap=4) == "nobody reaches the category's top tier"
    assert check_team([1] * 8 + [2] * 8, cap=3) == "nobody reaches the category's top tier"
