import pandas as pd
import pytest

from jobless import merge_players as m


@pytest.fixture
def sources():
    tm = {
        "tm_players": pd.DataFrame({
            "player_id": ["3207", "999", "777"],
            "name": ["Thierry Henry", "Danny Williams", "Jean Dupont"],
            "date_of_birth": ["1977-08-17 00:00:00", None, "1990-01-01 00:00:00"],
            "position": ["Attack", "Midfield", "Defender"],
            "international_caps": [123.0, None, None],
            "current_national_team_id": ["3377", None, None],
            "highest_market_value_in_eur": [70_000_000.0, None, 500_000.0],
            "last_season": [2014.0, 2016.0, 2013.0]}),
        "tm_clubs": pd.DataFrame({"club_id": ["11", "1132"], "name": ["Arsenal FC", "Burnley FC"],
                                  "domestic_competition_id": ["GB1", "GB1"]}),
        "tm_games": pd.DataFrame({
            "home_club_id": ["11", "3377"], "home_club_name": ["Arsenal FC", "France"],
            "away_club_id": ["1132", "3300"], "away_club_name": ["Burnley FC", "Brazil"]}),
        "tm_appearances": pd.DataFrame({
            "game_id": ["g1", "g2"], "player_id": ["3207", "3207"], "player_club_id": ["11", "3377"],
            "date": ["2012-01-09", "2010-06-11"], "goals": [1.0, 0.0]}),
        "tm_national_teams": pd.DataFrame({"national_team_id": ["3377", "3300"], "name": ["France", "Brazil"],
                                           "country_name": ["France", "Brazil"]}),
    }
    wd = {
        "wd_players": pd.DataFrame({
            "p": ["Q45901", "Q2", "Q7", "Q8"],
            "name": ["Thierry Henry", "Hugh Glass", "Jean Dupont", "Danny Williams"],
            "dob": ["1977-08-17T00:00:00Z", "1880-01-01T00:00:00Z", "1990-01-01T00:00:00Z", "1988-05-05T00:00:00Z"],
            "sitelinks": ["103", "0", "2", "3"],
            "article": ["https://en.wikipedia.org/wiki/Thierry_Henry", None, None, None],
            "tm_id": ["3207", None, None, None],
            "positions": ["forward", "goalkeeper", None, None]}),
        "wd_teams": pd.DataFrame({
            "team": ["Q9617", "Q47774", "Q99", "Q5"],
            "name": ["Arsenal F.C.", "France men's national association football team",
                     "France national under-21 football team", "Burnley F.C."],
            "sitelinks": ["125", "112", "20", "60"], "article": [None, None, None, None],
            "leagues": ["Q9448", None, None, None], "country": ["United Kingdom", "France", "France", "United Kingdom"],
            "venue": ["Emirates Stadium", None, None, None], "tm_club": ["11", "3377", None, None],
            "national": ["false", "true", "true", "false"], "club": ["true", "false", "false", "true"]}),
        "wd_club_map": pd.DataFrame({"tm": ["11", "3377"], "club": ["Q9617", "Q47774"]}),
        "wd_league_clubs": pd.DataFrame({"club": ["Q9617"], "league": ["Q9448"]}),
        "wd_stints": pd.DataFrame({
            "p": ["Q45901", "Q45901", "Q45901", "Q2"],
            "st": ["s1", "s2", "s3", "s4"],
            "team": ["Q9617", "Q47774", "Q99", "Q9617"],
            "start": ["1999-01-01T00:00:00Z", "1997-01-01T00:00:00Z", "1996-01-01T00:00:00Z", "1900-01-01T00:00:00Z"],
            "end": ["2007-01-01T00:00:00Z", "2010-01-01T00:00:00Z", "1997-01-01T00:00:00Z", "1899-01-01T00:00:00Z"],
            "apps": ["254", "123", "12", None], "goals": ["174", "51", "5", None]}),
        "wd_aliases": pd.DataFrame({"p": ["Q45901"], "alias": ["Titi"]}),
    }
    return tm, wd


def test_players_link_by_tm_id_and_name_dob_but_never_without_dob(sources):
    out = m.build(*sources)["players"].set_index("player_id")
    assert set(out.index) == {"Q45901", "Q2", "Q7", "Q8", "tm:999"}
    assert out.at["Q7", "tm_id"] == "777"          # name + DOB fallback
    assert pd.isna(out.at["Q8", "tm_id"])          # TM 'Danny Williams' has no DOB -> stays separate
    assert out.at["Q45901", "positions"] == "FW"


def test_non_footballers_from_rosters_are_dropped(sources):
    tm, wd = sources
    wd["wd_players"] = pd.concat([wd["wd_players"], pd.DataFrame({"p": ["Q900"], "name": ["A Coach"], "footballer": ["false"]})])
    wd["wd_players"]["footballer"] = wd["wd_players"]["footballer"].fillna("true")
    wd["wd_stints"] = pd.concat([wd["wd_stints"], pd.DataFrame({"p": ["Q900"], "st": ["s9"], "team": ["Q9617"],
                                                                "start": [None], "end": [None], "apps": [None], "goals": [None]})])
    out = m.build(tm, wd)
    assert "Q900" not in set(out["players"]["player_id"])
    assert "Q900" not in set(out["stints"]["player_id"])


def test_international_uses_senior_team_only(sources):
    out = m.build(*sources)["players"].set_index("player_id")
    assert out.at["Q45901", "nation_id"] == "Q47774"
    assert out.at["Q45901", "caps"] == 123
    assert out.at["Q45901", "last_year"] == 2015   # TM last season 2014 -> 2014-15


def test_stints_swap_reversed_dates_skip_youth_and_include_tm(sources):
    st = m.build(*sources)["stints"]
    glass = st[st["player_id"] == "Q2"].iloc[0]
    assert (glass["start_year"], glass["end_year"]) == (1899, 1900)
    assert "Q99" not in set(st["club_id"]) and "Q47774" not in set(st["club_id"])
    tm_row = st[(st["source"] == "tm") & (st["player_id"] == "Q45901")].iloc[0]
    assert (tm_row["club_id"], tm_row["apps"]) == ("Q9617", 1)


def test_clubs_map_unlinked_tm_club_by_name_and_exclude_national_teams(sources):
    out = m.build(*sources)
    clubs = out["clubs"].set_index("club_id")
    assert clubs.at["Q9617", "league_key"] == "premier-league"
    assert (clubs.at["Q9617", "name"], clubs.at["Q9617", "full_name"]) == ("Arsenal", "Arsenal F.C.")
    names = out["names"]
    assert {"Arsenal", "Arsenal FC", "Arsenal F.C."} <= set(names.loc[names["entity_id"] == "Q9617", "name"])
    assert "tmc:1132" not in clubs.index            # 'Burnley FC' folded onto Burnley F.C.
    assert "tmc:3377" not in clubs.index and "tmc:3300" not in clubs.index
    tm_to_club = out["tm_to_club"].set_index("tm_club_id")["club_id"]
    assert tm_to_club["1132"] == "Q5"


def test_cities_and_countries_in_stints_are_not_clubs():
    teams = m.classify_teams(pd.DataFrame({
        "team": ["Qcity", "Qclub", "Qtm"], "name": ["Liverpool", "Liverpool F.C.", "Odd Item"], "sitelinks": [250, 120, 3],
        "national": ["false", "false", "false"], "club": ["false", "true", "false"], "tm_club": [None, None, "31"]}))
    assert teams.set_index("team")["kind"].to_dict() == {"Qcity": "other", "Qclub": "club", "Qtm": "club"}


def test_ambiguous_club_names_do_not_merge():
    teams = m.classify_teams(pd.DataFrame({
        "team": ["Q1", "Q2"], "name": ["Nacional", "Nacional"], "sitelinks": [None, None], "article": [None, None],
        "leagues": [None, None], "country": ["Uruguay", "Portugal"], "venue": [None, None],
        "tm_club": [None, None], "national": ["false", "false"], "club": ["true", "true"]}))
    clubs, tm_to_club, _ = m.build_clubs(teams, pd.DataFrame({"tm": [], "club": []}), pd.DataFrame({"club": [], "league": []}),
                                      pd.DataFrame({"club_id": ["50"], "name": ["Nacional"], "domestic_competition_id": ["PO1"]}),
                                      pd.DataFrame({"home_club_id": [], "home_club_name": [], "away_club_id": [], "away_club_name": []}),
                                      pd.DataFrame({"national_team_id": []}))
    assert tm_to_club["50"] == "tmc:50"


def test_nations_strip_team_suffix_and_keep_unlinked_tm_teams(sources):
    nations = m.build(*sources)["nations"].set_index("nation_id")
    assert nations.at["Q47774", "name"] == "France"
    assert nations.at["tmn:3300", "name"] == "Brazil"
    assert "Q99" not in nations.index


def test_names_include_aliases(sources):
    names = m.build(*sources)["names"]
    henry = set(names.loc[names["entity_id"] == "Q45901", "name"])
    assert henry == {"Thierry Henry", "Titi"}


def test_women_players_are_dropped(sources):
    tm, wd = sources
    wd["wd_female"] = pd.DataFrame({"p": ["Q7"]})
    out = m.build(tm, wd)
    assert "Q7" not in set(out["players"]["player_id"])
    assert "Q7" not in set(out["stints"]["player_id"])
    assert "777" not in set(out["tm_to_player"]["tm_id"])     # her TM-matched row does not come back as tm:777
    assert "tm:777" not in set(out["players"]["player_id"])


def _clubs(teams, club_map, tm_clubs):
    empty_games = pd.DataFrame({"home_club_id": [], "home_club_name": [], "away_club_id": [], "away_club_name": []})
    base = {"sitelinks": None, "article": None, "leagues": None, "country": None, "venue": None, "tm_club": None,
            "national": "false", "club": "true"}
    t = m.classify_teams(pd.DataFrame([{**base, **row} for row in teams]))
    return m.build_clubs(t, pd.DataFrame(club_map, columns=["tm", "club"]), pd.DataFrame({"club": [], "league": []}),
                         pd.DataFrame(tm_clubs, columns=["club_id", "name", "domestic_competition_id"]), empty_games,
                         pd.DataFrame({"national_team_id": []}))


def test_tm_link_shared_by_two_items_stays_with_the_one_whose_name_matches():
    """B SAD: both C.F. Os Belenenses and B-SAD carry Transfermarkt id 2457 ('B SAD')."""
    clubs, tm_to_club, _ = _clubs(
        [{"team": "Qbel", "name": "C.F. Os Belenenses", "sitelinks": "45", "tm_club": "2457"},
         {"team": "Qbsad", "name": "B-SAD", "sitelinks": "24", "tm_club": "2457"}],
        [("2457", "Qbel"), ("2457", "Qbsad")],
        [("2457", "B SAD", "PO1"), ("68608", "CF Os Belenenses", None)])
    assert tm_to_club["2457"] == "Qbsad"
    assert tm_to_club["68608"] == "Qbel"          # the unlinked TM Belenenses now merges into the real item
    clubs = clubs.set_index("club_id")
    assert clubs.at["Qbel", "name"] == "Os Belenenses"
    assert clubs.at["Qbsad", "name"] == "B SAD"


def test_thin_twin_hands_its_tm_link_to_the_real_item():
    """Augsburg: Q97905916 (0 sitelinks) carries TM id 167, the real Q15755 carries the history."""
    clubs, tm_to_club, redirect = _clubs(
        [{"team": "Qreal", "name": "FC Augsburg", "sitelinks": "75"},
         {"team": "Qtwin", "name": "FC Augsburg", "sitelinks": "0", "tm_club": "167"}],
        [("167", "Qtwin")], [("167", "FC Augsburg", "L1")])
    assert tm_to_club["167"] == "Qreal"
    assert redirect == {"Qtwin": "Qreal"}
    assert "Qtwin" not in set(clubs["club_id"])
    assert clubs.set_index("club_id").at["Qreal", "tm_club_id"] == "167"


def test_twin_stints_move_to_the_real_item(sources):
    tm, wd = sources
    wd["wd_teams"] = pd.concat([wd["wd_teams"], pd.DataFrame({
        "team": ["Qtwin"], "name": ["Arsenal F.C."], "sitelinks": ["0"], "article": [None], "leagues": [None],
        "country": [None], "venue": [None], "tm_club": [None], "national": ["false"], "club": ["true"]})])
    wd["wd_stints"] = pd.concat([wd["wd_stints"], pd.DataFrame({
        "p": ["Q7"], "st": ["s9"], "team": ["Qtwin"], "start": [None], "end": [None], "apps": [None], "goals": [None]})])
    # Qtwin has no TM link, so it is not a thin twin: it stays a club of its own (the prompt guard handles names)
    assert "Qtwin" in set(m.build(tm, wd)["stints"]["club_id"])
    wd["wd_teams"].loc[wd["wd_teams"]["team"] == "Qtwin", "tm_club"] = "555"
    wd["wd_teams"].loc[wd["wd_teams"]["team"] == "Q9617", "tm_club"] = None
    wd["wd_club_map"] = pd.DataFrame({"tm": ["555", "3377"], "club": ["Qtwin", "Q47774"]})
    out = m.build(tm, wd)
    assert "Qtwin" not in set(out["stints"]["club_id"])
    assert "Q7" in set(out["stints"].loc[out["stints"]["club_id"] == "Q9617", "player_id"])


def test_name_merge_skips_linked_clubs_and_names_shared_on_the_tm_side():
    clubs, tm_to_club, _ = _clubs(
        [{"team": "Qfey", "name": "Feyenoord", "tm_club": "234"},
         {"team": "Qnac", "name": "Nacional"}],
        [("234", "Qfey")],
        [("234", "Feyenoord Rotterdam", "NL1"), ("999", "SC Feyenoord", None),
         ("50", "Nacional", "PO1"), ("51", "Nacional", None)])
    assert tm_to_club["999"] == "tmc:999"          # Feyenoord already has its own TM club
    assert tm_to_club["50"] == "tmc:50" and tm_to_club["51"] == "tmc:51"


@pytest.mark.parametrize("name", ["FC Bayern Munich II", "FC Porto B", "Real Madrid Castilla", "Real Madrid C",
                                  "Jong Ajax", "Barcelona Atlètic", "Valencia CF Mestalla", "Athletic Bilbao B",
                                  "Hertha BSC II", "Sevilla Atlético"])
def test_reserve_teams_are_not_clubs(name):
    t = m.classify_teams(pd.DataFrame({"team": ["Q1"], "name": [name], "sitelinks": [5], "national": ["false"],
                                       "club": ["true"], "tm_club": [None]}))
    assert t.at[0, "kind"] == "other"


@pytest.mark.parametrize("name", ["Bayern Munich", "B SAD", "Club Brugge", "AC Milan", "SC Freiburg", "Atlético Madrid",
                                  "Aston Villa", "PSV Eindhoven", "Liefering"])
def test_first_teams_stay_clubs(name):
    t = m.classify_teams(pd.DataFrame({"team": ["Q1"], "name": [name], "sitelinks": [5], "national": ["false"],
                                       "club": ["true"], "tm_club": [None]}))
    assert t.at[0, "kind"] == "club"


def test_reserve_team_known_only_by_its_tm_name_is_dropped(sources):
    tm, wd = sources
    tm["tm_clubs"] = pd.concat([tm["tm_clubs"], pd.DataFrame({"club_id": ["27"], "name": ["Bayern Munich II"],
                                                              "domestic_competition_id": [None]})])
    wd["wd_teams"] = pd.concat([wd["wd_teams"], pd.DataFrame({
        "team": ["Qbay2"], "name": ["Bayern Munich Two"], "sitelinks": ["5"], "article": [None],
        "leagues": [None], "country": [None], "venue": [None], "tm_club": ["27"], "national": ["false"],
        "club": ["true"]})])
    wd["wd_stints"] = pd.concat([wd["wd_stints"], pd.DataFrame({
        "p": ["Q7"], "st": ["s9"], "team": ["Qbay2"], "start": [None], "end": [None], "apps": [None], "goals": [None]})])
    out = m.build(tm, wd)
    assert "Qbay2" not in set(out["clubs"]["club_id"])
    assert "Qbay2" not in set(out["stints"]["club_id"])


def test_a_team_whose_label_is_not_a_plain_national_team_keeps_its_own_name(sources):
    """The Basque Country team's country is France: it must not be called 'France'."""
    tm, wd = sources
    wd["wd_teams"] = pd.concat([wd["wd_teams"], pd.DataFrame({
        "team": ["Qbasque"], "name": ["Basque Country autonomous football team"], "sitelinks": ["33"], "article": [None],
        "leagues": [None], "country": ["France"], "venue": [None], "tm_club": [None], "national": ["true"], "club": ["false"]})])
    nations = m.build(tm, wd)["nations"].set_index("nation_id")
    assert nations.at["Qbasque", "name"] == "Basque Country autonomous football team"
    assert nations.at["Q47774", "name"] == "France"
