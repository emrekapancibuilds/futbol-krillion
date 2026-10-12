import re

import pandas as pd
import pytest

from jobless import templates as t

EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿]")


@pytest.fixture(autouse=True)
def small_thresholds(monkeypatch):
    monkeypatch.setattr(t, "MIN_CLUB_PLAYERS", 2)
    monkeypatch.setattr(t, "MIN_PAIR_PLAYERS", 1)


def by_key(world):
    return {c.key: c for c in t.generate(world)}


def test_club_eras_exclude_undated_stints_but_all_time_keeps_them(world):
    c = by_key(world)
    assert set(c["club:Qars:all"].facts) == {"Q1", "Q2", "Q3", "Q4"}
    assert set(c["club:Qars:1992"].facts) == {"Q1", "Q3"}
    assert c["club:Qars:1992"].text == "Name a player who played for Arsenal F.C. (1992–2026)"
    assert c["club:Qars:all"].facts["Q1"] == "254 apps for Arsenal F.C., 1999–2007"


def test_club_position(world):
    c = by_key(world)["clubpos:Qars:GK"]
    assert c.text == "Name a goalkeeper who played for Arsenal F.C." and set(c.facts) == {"Q2", "Q3"}


def test_two_clubs_and_nation_league(world):
    c = by_key(world)
    pair = next(v for k, v in c.items() if k.startswith("two:"))
    assert set(pair.facts) == {"Q1"} and "Juventus FC" in pair.text and "Arsenal F.C." in pair.text
    nl = c["natleague:Qfra:premier-league"]
    assert nl.text == "Name a France international who played in the Premier League (2012–2026)"
    assert nl.facts["Q1"] == "6 Premier League apps, 2012–2014"


def test_tournaments_honours_and_non_player_families(world):
    c = by_key(world)
    assert c["scored:2014 World Cup"].facts == {"Q1": "2 goals at the 2014 World Cup"}
    assert c["scored:World Cup"].text == "Name a player who scored at a World Cup (2014)"
    assert c["scored:World Cup:Qfra"].text == "Name a player who scored for France at a World Cup (2014)"
    assert not any(k.startswith("squad:") for k in c)
    assert c["won:premier-league"].facts == {"Q1": "Premier League winner 2013–14"}
    assert c["won:champions-league"].text == "Name a player who won the Champions League (2013)"
    assert set(c["clubs:europe"].facts) == {"Qars", "Qjuv"}
    assert c["clubs:europe:Italy"].text == "Name a club from Italy that has played in Europe (2012–2026)"
    assert c["managers:premier-league"].facts["mgr:arsene wenger"] == "38 Premier League games, 2012–2013"
    assert c["stadiums:cl"].facts["std:emirates stadium"] == "Home of Arsenal F.C. · 200 matches since 2012"
    assert c["nations:World Cup"].facts == {"Qfra": "1 major tournament since 2010"}


def test_no_generated_text_contains_emoji(world):
    for c in t.generate(world):
        assert not EMOJI.search(c.text)
        assert not any(EMOJI.search(f) for f in c.facts.values())


def test_a_club_sharing_its_name_with_a_more_famous_club_gets_no_prompts(world):
    """'FC barcelona' (a mislabelled Sevilla Atlético item) must not produce 'Name a player who played for barcelona'."""
    world.clubs.loc["Qbar2"] = {"name": "arsenal f.c.", "league_key": None, "country": "Spain"}
    world.clubs["sitelinks"] = pd.Series({"Qars": 125.0, "Qbar2": 28.0})
    world.stints = pd.concat([world.stints, world.stints.assign(club_id="Qbar2")], ignore_index=True)
    keys = set(by_key(world))
    assert "club:Qars:all" in keys
    assert not any("Qbar2" in k for k in keys)


def test_broad_prompts_for_a_league_a_national_team_and_the_champions_league(world):
    """Daily prompts should be answerable in many ways (user, 2026-10-11): one constraint, many answers."""
    c = by_key(world)
    league = c["league:premier-league"]
    assert (league.family, league.text) == ("league", "Name a player who played in the Premier League (2012–2026)")
    assert league.facts["Q1"] == "6 Premier League apps, 2012–2014"
    france = c["intl:Qfra"]
    assert (france.family, france.text) == ("internationals", "Name a France international")
    assert set(france.facts) == {"Q1"}
    cl = c["champions:all"]
    assert (cl.family, cl.text) == ("champions", "Name a player who played in the Champions League (2012–2026)")
    assert cl.facts["Q1"] == "3 Champions League apps, 2012–2013"


def test_only_top_five_league_prompts_are_mainstream(world, monkeypatch):
    """Dailies stay in Europe's top 5 leagues for now (user, 2026-10-11); the rest is for Unlimited."""
    monkeypatch.setattr(t, "MAINSTREAM_NATION_MIN_PLAYERS", 1)
    world.clubs.loc["Qwrx"] = {"name": "Wrexham", "league_key": "championship", "country": "United Kingdom"}
    world.stints = pd.concat([world.stints, world.stints.assign(club_id="Qwrx")], ignore_index=True)
    c = by_key(world)
    assert c["club:Qars:all"].mainstream and c["clubpos:Qars:GK"].mainstream
    assert not c["club:Qwrx:all"].mainstream
    assert c["league:premier-league"].mainstream and c["champions:all"].mainstream
    assert c["intl:Qfra"].mainstream                      # Q1 (France) played in the Premier League


def test_national_teams_need_enough_top_five_league_players(world, monkeypatch):
    monkeypatch.setattr(t, "MAINSTREAM_NATION_MIN_PLAYERS", 2)
    assert not by_key(world)["intl:Qfra"].mainstream    # only one Frenchman in the top 5 leagues here


def test_a_club_with_one_old_top_five_season_is_not_mainstream(world):
    """Siena, Crotone, Real Zaragoza: listed under a top-5 league, but only briefly and years ago."""
    world.clubs.loc["Qsie"] = {"name": "Siena", "league_key": "serie-a", "country": "Italy"}
    world.stints = pd.concat([world.stints, world.stints.assign(club_id="Qsie")], ignore_index=True)
    world.league_apps = pd.concat([world.league_apps, pd.DataFrame({
        "player_id": ["Q3"], "league_key": ["serie-a"], "season": [2012.0], "club_id": ["Qsie"], "apps": [5], "goals": [0]})],
        ignore_index=True)
    c = by_key(world)
    assert c["club:Qars:all"].mainstream        # in the Premier League in the latest season
    assert not c["club:Qsie:all"].mainstream


def test_only_fifa_national_teams_are_mainstream_and_odd_team_names_get_no_prompt(world, monkeypatch):
    monkeypatch.setattr(t, "MAINSTREAM_NATION_MIN_PLAYERS", 1)
    world.nations["tm_team_id"] = pd.Series({"Qfra": None, "Qeng": "3299"})
    world.nations.loc["Qbeach"] = {"name": "France national beach soccer team", "tm_team_id": None}
    world.players.loc["Q4", "nation_id"] = "Qbeach"
    c = by_key(world)
    assert not c["intl:Qfra"].mainstream                 # no Transfermarkt national team behind it
    assert "intl:Qbeach" not in c


def test_easy_position_prompts_for_a_league_and_a_national_team(world):
    c = by_key(world)
    fw = c["leaguepos:premier-league:FW"]
    assert (fw.family, fw.text) == ("league_position", "Name a forward who played in the Premier League (2012–2026)")
    assert set(fw.facts) == {"Q1"} and fw.mainstream
    nat = c["natpos:Qfra:FW"]
    assert (nat.family, nat.text) == ("nation_position", "Name a forward who played for France")
    assert set(nat.facts) == {"Q1"}


def test_league_scorer_prompts(world):
    c = by_key(world)["scorers:premier-league"]
    assert (c.family, c.text) == ("league_scorers", "Name a player who scored in the Premier League (2012–2026)")
    assert c.facts == {"Q1": "1 Premier League goal, 2012–2013"}     # only seasons with a goal count


def test_euro_editions_read_without_the(world):
    world.tournament_apps = world.tournament_apps.assign(edition="Euro 2024", kind="Euro", label_year=2024)
    world.editions = world.editions.assign(edition="Euro 2024", kind="Euro", label_year=2024)
    assert by_key(world)["scored:Euro 2024"].text == "Name a player who scored at Euro 2024"


def test_prompts_carry_the_round_type_they_belong_to(world):
    """Unlimited lets players pick a round type: a top-5 league, the Champions League or international."""
    c = by_key(world)
    assert c["club:Qars:all"].category == "premier-league"      # Arsenal's top-5 league, from its league seasons
    assert c["clubpos:Qars:GK"].category == "premier-league"
    assert c["league:premier-league"].category == "premier-league"
    assert c["leaguepos:premier-league:FW"].category == "premier-league"
    assert c["won:premier-league"].category == "premier-league"
    assert c["champions:all"].category == "champions-league"
    assert c["won:champions-league"].category == "champions-league"
    assert c["intl:Qfra"].category == "international"
    assert c["scored:2014 World Cup"].category == "international"
    no_top5 = t.Candidate("club:Qbur:all", "club", "player", "Name a player who played for Burnley", {})
    assert t.category_of(world, no_top5) is None                # Burnley has no top-5 seasons in this fixture


def test_club_champions_league_prompts(world):
    cl = by_key(world)["clubcl:Qars"]
    assert (cl.family, cl.category) == ("club_cl", "champions-league")
    assert cl.text == "Name a player who played for Arsenal F.C. in the Champions League (2012–2026)"
    assert cl.facts == {"Q1": "3 Champions League apps for Arsenal F.C., 2012–2013"}
