import pandas as pd

from jobless import build_prompts as b
from jobless.templates import Candidate

TIERS = [1] * 5 + [2] * 3 + [3] * 3 + [4] * 3 + [5] * 3 + [7]


def fame_for(n_extra_easy=0):
    ids = [f"e{i}" for i in range(len(TIERS) + n_extra_easy)]
    tiers = TIERS + [1] * n_extra_easy
    return pd.DataFrame({"name": [f"Name {i}" for i in ids], "fame": [1 - i / 100 for i in range(len(ids))],
                         "tier": tiers, "points": 10}, index=ids)


def test_answers_keep_the_more_famous_of_two_entities_with_one_name():
    fame = pd.DataFrame({"name": ["Mesut Özil", "Mesut Özil"], "fame": [0.9, 0.1], "tier": [1, 7], "points": [10, 1000]},
                        index=["Q1", "tm:9"])
    a = b.answers_for(Candidate("k", "club", "player", "t", {"Q1": "x", "tm:9": "y"}), fame)
    assert a["entity_id"].tolist() == ["Q1"]


def test_build_gates_dedupes_and_assigns_slots_and_pools():
    fame = fame_for()
    ids = list(fame.index)
    cands = [Candidate("club:a", "club", "player", "Name a player who played for A", {i: "f" for i in ids}),
             Candidate("club:a2", "club", "player", "Name a player who played for A (1992–2026)", {i: "f" for i in ids}),
             Candidate("thin", "club", "player", "Name a player who played for B", {i: "f" for i in ids[:3]})]
    prompts, answers, generated, rejects = b.build(cands, {"player": fame})
    assert prompts["key"].tolist() == ["club:a"]
    assert rejects[("club", "near-duplicate")] == 1
    assert rejects[("club", "fewer than 5 easy answers")] == 1
    assert set(answers["prompt_id"]) == {b.prompt_id("club:a")}
    assert prompts.loc[0, "slot"] in b.SLOT_PER_DAY and prompts.loc[0, "pool"] in {"daily", "unlimited"}


def test_assign_pools_keeps_forty_percent_for_unlimited():
    prompts = pd.DataFrame({"slot": ["club_easy"] * 10}, index=range(10))
    pool = b.assign_pools(prompts, seed=1)
    assert (pool == "unlimited").sum() == 4 and (pool == "daily").sum() == 6


def test_scheduled_prompts_are_always_daily():
    prompts = pd.DataFrame({"slot": ["club_easy"] * 10, "prompt_id": [f"p{i}" for i in range(10)]}, index=range(10))
    for seed in range(5):
        pool = b.assign_pools(prompts, seed=seed, pinned={"p0", "p1", "p2"})
        assert (pool[:3] == "daily").all()
        assert (pool == "unlimited").sum() == 4


def test_two_club_prompts_and_small_prompts_never_become_dailies():
    prompts = pd.DataFrame({"slot": ["club_easy"] * 10, "prompt_id": [f"p{i}" for i in range(10)],
                            "family": ["two_clubs", "two_clubs"] + ["club"] * 8,
                            "n_answers": [500, 500, b.DAILY_MIN_ANSWERS - 1] + [500] * 7}, index=range(10))
    pool = b.assign_pools(prompts, seed=1)
    assert (pool[:3] == "unlimited").all()
    assert (pool == "daily").sum() == 4      # 40% of the 8 eligible prompts stay for Unlimited
    assert b.assign_pools(prompts, seed=1, pinned={"p0"})[0] == "daily"      # already scheduled: stays


def test_national_team_prompts_fill_the_nation_slot():
    prompts = pd.DataFrame({"entity_type": ["player"] * 3, "family": ["internationals", "club", "club"],
                            "ease": [0.5, 0.9, 0.1]})
    assert b.assign_slots(prompts).tolist() == ["nation_tournament", "club_easy", "hard"]


def test_niche_prompts_stay_out_of_the_dailies():
    prompts = pd.DataFrame({"slot": ["club_easy"] * 10, "prompt_id": [f"p{i}" for i in range(10)],
                            "family": ["club"] * 10, "n_answers": [500] * 10,
                            "mainstream": [False, False] + [True] * 8}, index=range(10))
    pool = b.assign_pools(prompts, seed=1)
    assert (pool[:2] == "unlimited").all()
    assert (pool == "daily").sum() == 4      # 40% of the 8 eligible prompts stay for Unlimited


def test_two_prompts_with_the_same_words_keep_only_the_bigger_one():
    fame = fame_for(n_extra_easy=5)
    ids = list(fame.index)
    cands = [Candidate("intl:basque", "internationals", "player", "Name a France international", {i: "f" for i in ids[:-5]}),
             Candidate("intl:fra", "internationals", "player", "Name a France international", {i: "f" for i in ids})]
    prompts, _, _, rejects = b.build(cands, {"player": fame})
    assert prompts["key"].tolist() == ["intl:fra"]
    assert rejects[("internationals", "same text as a bigger prompt")] == 1


def test_dailies_need_plenty_of_famous_answers():
    """'Name a defender who played for Granada' had 5 famous answers: too hard (user, 2026-10-11)."""
    prompts = pd.DataFrame({"slot": ["club_easy"] * 10, "prompt_id": [f"p{i}" for i in range(10)],
                            "family": ["club"] * 10, "n_answers": [500] * 10,
                            "famous": [b.DAILY_MIN_FAMOUS - 1, 5] + [b.DAILY_MIN_FAMOUS] * 8}, index=range(10))
    pool = b.assign_pools(prompts, seed=1)
    assert (pool[:2] == "unlimited").all()
    assert (pool == "daily").sum() == 4      # 40% of the 8 eligible prompts stay for Unlimited


def test_build_counts_famous_answers():
    fame = fame_for()
    prompts, _, _, _ = b.build([Candidate("club:a", "club", "player", "Name a player who played for A",
                                          {i: "f" for i in fame.index})], {"player": fame})
    assert prompts.loc[0, "famous"] == (fame["tier"] <= 3).sum()



def test_unlimited_keeps_its_share_of_the_easy_prompts():
    """Free Unlimited plays only easy prompts, so the 40% reserve is taken from the eligible ones."""
    prompts = pd.DataFrame({"slot": ["club_easy"] * 20, "prompt_id": [f"p{i}" for i in range(20)],
                            "family": ["club"] * 20, "n_answers": [500] * 20,
                            "famous": [5] * 10 + [b.DAILY_MIN_FAMOUS] * 10}, index=range(20))
    pool = b.assign_pools(prompts, seed=3)
    easy_unlimited = ((pool == "unlimited") & (prompts["famous"] >= b.DAILY_MIN_FAMOUS)).sum()
    assert easy_unlimited == 4 and (pool == "daily").sum() == 6


def test_tournament_prompts_pass_on_the_lighter_check():
    tiers = [1] * 20 + [4, 4, 5]
    ids = [f"s{i}" for i in range(len(tiers))]
    fame = pd.DataFrame({"name": ids, "fame": [1 - i / 100 for i in range(len(ids))], "tier": tiers, "points": 10},
                        index=ids)
    cands = [Candidate("scored:2014 World Cup", "tournament", "player", "Name a player who scored at the 2014 World Cup",
                       {i: "f" for i in ids}),
             Candidate("club:x", "club", "player", "Name a player who played for X", {i: "f" for i in ids})]
    prompts, _, _, rejects = b.build(cands, {"player": fame})
    assert prompts["key"].tolist() == ["scored:2014 World Cup"]
    assert sum(n for (family, _), n in rejects.items() if family == "club") == 1   # normal check still applies


def test_prompts_keep_their_category():
    fame = fame_for()
    prompts, _, _, _ = b.build([Candidate("league:x", "league", "player", "Name a player in X", {i: "f" for i in fame.index},
                                          category="premier-league")], {"player": fame})
    assert prompts.loc[0, "category"] == "premier-league"


# ---- team prompts (user, 2026-10-12)

def teams(n, entity_type="nation", prefix="t"):
    """n teams whose global fame says they're all unknown (tier 7), so only the within-category ranking can tier them."""
    ids = [f"{prefix}{i}" for i in range(n)]
    fame = pd.DataFrame({"name": [f"Team {i}" for i in ids], "fame": [0.5 - i / 1000 for i in range(n)],
                         "tier": 7, "points": 1000}, index=ids)
    return ids, fame


def test_a_world_cup_field_is_tiered_inside_the_category_and_capped_at_season_ticket_holder():
    ids, fame = teams(48)                                           # the 2026 World Cup
    scores = {i: 100 - n for n, i in enumerate(ids)}                # t0 is the best known, t47 the least
    c = Candidate("nations:2026 World Cup", "nations", "nation", "Name a team that played at the 2026 World Cup",
                  {i: "f" for i in ids}, scores=scores)
    prompts, answers, _, rejects = b.build([c], {"nation": fame})
    assert prompts["key"].tolist() == ["nations:2026 World Cup"] and not rejects
    tier = answers.set_index("entity_id")["tier"]
    assert tier["t0"] == 1 and tier["t47"] == 4 and tier.max() == 4          # Curaçao-level: Season Ticket Holder, never Jobless
    assert answers.set_index("entity_id").loc["t47", "points"] == 30


def test_a_league_of_clubs_can_reach_true_analyst_but_not_further():
    ids, fame = teams(33, "club", "c")
    c = Candidate("clubs:la-liga", "clubs", "club", "Name a team that played in La Liga (2012–2026)", {i: "f" for i in ids})
    _, answers, _, _ = b.build([c], {"club": fame})
    assert answers["tier"].max() == 5 and answers.loc[answers["tier"] == 5, "points"].iloc[0] == 60


def test_a_category_covering_every_club_in_europe_can_have_jobless_answers():
    ids, fame = teams(659, "club", "c")
    c = Candidate("clubs:europe", "clubs", "club", "Name a team that played in a European competition (2012–2026)",
                  {i: "f" for i in ids})
    _, answers, _, _ = b.build([c], {"club": fame})
    assert answers["tier"].max() == 7


def test_tiny_team_categories_are_rejected():
    ids, fame = teams(8)
    c = Candidate("nations:Euro 2008", "nations", "nation", "Name a team that played at Euro 2008", {i: "f" for i in ids})
    prompts, _, _, rejects = b.build([c], {"nation": fame})
    assert prompts.empty and rejects[("nations", "too few teams")] == 1


def test_team_prompts_can_be_dailies_with_only_a_few_dozen_answers_but_niche_ones_cannot():
    prompts = pd.DataFrame({
        "slot": ["non_player"] * 7, "prompt_id": [f"p{i}" for i in range(7)],
        "family": ["nations"] * 3 + ["clubs"] * 3 + ["managers"],
        "n_answers": [32, 48, 24, 33, 37, 8, 40], "famous": [20, 20, 12, 14, 14, 5, 20],
        "mainstream": [True] * 7}, index=range(7))
    daily = b.assign_pools(prompts, seed=1) == "daily"
    assert daily.sum() == 3                         # 5 team prompts are big enough; 40% of them stay for Unlimited
    assert not daily[5] and not daily[6]            # 8 teams is too small; a manager prompt still needs 100 answers


def test_tournament_editions_with_nearly_the_same_teams_are_all_kept():
    """Euro 2016, 2020 and 2024 share most of their 24 teams, but they are different questions."""
    ids, fame = teams(30)
    cands = [Candidate(f"nations:Euro {y}", "nations", "nation", f"Name a team that played at Euro {y}",
                       {i: "f" for i in ids[a:a + 24]}, scores={i: 100 - n for n, i in enumerate(ids)})
             for y, a in ((2016, 0), (2020, 2), (2024, 4))]               # 20 of 24 teams in common (Jaccard 0.71)
    prompts, _, _, rejects = b.build(cands, {"nation": fame})
    assert len(prompts) == 3 and not rejects
