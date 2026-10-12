import numpy as np
import pandas as pd
import pytest

from jobless.templates import World


@pytest.fixture
def world() -> World:
    players = pd.DataFrame({
        "player_id": ["Q1", "Q2", "Q3", "Q4"],
        "name": ["Thierry Henry", "Hugh Glass", "David Seaman", "Unknown Dates"],
        "nation_id": ["Qfra", None, "Qeng", None], "positions": ["FW", "GK", "GK", "MF"],
        "first_year": [1994.0, 1899.0, 1982.0, np.nan], "last_year": [2015.0, 1900.0, 2004.0, np.nan],
    }).set_index("player_id")
    stints = pd.DataFrame({
        "player_id": ["Q1", "Q2", "Q3", "Q4", "Q1"],
        "club_id": ["Qars", "Qars", "Qars", "Qars", "Qjuv"],
        "start_year": [1999.0, 1899.0, 1990.0, np.nan, 1999.0], "end_year": [2007.0, 1900.0, 2003.0, np.nan, 1999.0],
        "apps": [254.0, np.nan, 564.0, 3.0, 16.0], "goals": [174.0, np.nan, 0.0, 0.0, 3.0], "source": "wd"})
    clubs = pd.DataFrame({"club_id": ["Qars", "Qjuv", "Qbur"], "name": ["Arsenal F.C.", "Juventus FC", "Burnley F.C."],
                          "league_key": ["premier-league", "serie-a", "premier-league"],
                          "country": ["United Kingdom", "Italy", "United Kingdom"]}).set_index("club_id")
    nations = pd.DataFrame({"nation_id": ["Qfra", "Qeng"], "name": ["France", "England"]}).set_index("nation_id")
    league_apps = pd.DataFrame({"player_id": ["Q1", "Q1"], "league_key": ["premier-league", "premier-league"],
                                "season": [2012.0, 2013.0], "club_id": ["Qars", "Qars"], "apps": [4, 2], "goals": [1, 0]})
    cl_apps = pd.DataFrame({"player_id": ["Q1"], "season": [2012.0], "club_id": ["Qars"], "apps": [3]})
    champions = pd.DataFrame({"competition_key": ["premier-league", "champions-league"], "season": [2013.0, 2012.0],
                              "club_id": ["Qars", "Qars"]})
    tournament_apps = pd.DataFrame({"player_id": ["Q1"], "edition": ["2014 World Cup"], "kind": ["World Cup"],
                                    "label_year": [2014], "nation_id": ["Qfra"], "apps": [5], "goals": [2.0]})
    nation_tournaments = pd.DataFrame({"edition": ["2014 World Cup"], "kind": ["World Cup"], "label_year": [2014],
                                       "nation_id": ["Qfra"]})
    manager_spells = pd.DataFrame({"manager_id": ["mgr:arsene wenger"], "club_id": ["Qars"],
                                   "league_key": ["premier-league"], "season": [2012.0], "games": [38]})
    stadiums = pd.DataFrame({"stadium_id": ["std:emirates stadium"], "name": ["Emirates Stadium"], "games": [200],
                             "attendance": [1e7], "home_club_id": ["Qars"]}).set_index("stadium_id")
    stadium_games = pd.DataFrame({"stadium_id": ["std:emirates stadium"], "competition_id": ["CL"], "season": [2015.0]})
    editions = pd.DataFrame({"competition_id": ["FIWC"], "season": [2013.0], "kind": ["World Cup"], "year": [2014],
                             "label_year": [2014], "edition": ["2014 World Cup"]})
    euro_clubs = pd.DataFrame({"club_id": ["Qars", "Qjuv"], "competition_id": ["CL", "CL"], "season": [2015.0, 2015.0]})
    prestige = pd.Series({"Qars": 0.9, "Qjuv": 0.95, "Qbur": 0.3})
    return World(players, stints, clubs, nations, league_apps, cl_apps, champions, tournament_apps, nation_tournaments,
                 manager_spells, stadiums, stadium_games, editions, euro_clubs, prestige)
