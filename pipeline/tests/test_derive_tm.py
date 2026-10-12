import pandas as pd
import pytest

from jobless import derive_tm as d


def game(gid, comp, season, home, away, hg, ag, round_="1", date=None, stadium=None, hm=None, am=None, att=None):
    return {"game_id": gid, "competition_id": comp, "season": float(season), "round": round_,
            "date": date or f"{season}-09-01", "home_club_id": home, "away_club_id": away,
            "home_club_goals": float(hg), "away_club_goals": float(ag), "home_club_manager_name": hm,
            "away_club_manager_name": am, "stadium": stadium, "attendance": att}


@pytest.fixture
def world():
    league = []
    results = {("A", "B"): (2, 0), ("B", "A"): (1, 1), ("A", "C"): (3, 0), ("C", "A"): (0, 1),
               ("B", "C"): (2, 2), ("C", "B"): (0, 1)}
    for i, ((h, a), (hg, ag)) in enumerate(results.items()):
        league.append(game(f"L{i}", "GB1", 2015, h, a, hg, ag, stadium="Emirates Stadium" if h == "A" else None,
                           hm="Arsène Wenger" if h == "A" else "Sean Dyche", am=None, att=60000))
    cl_final = [game("F1", "CL", 2015, "B", "A", 1, 1 + 0, round_="Final", date="2016-05-28", stadium="San Siro"),
                game("F2", "CL", 2016, "A", "B", 4, 6, round_="Final", date="2017-06-03")]
    wc = [game(f"W{i}", "FIWC", 2013, "N1", "N2", 1, 0, date="2014-06-15") for i in range(29)]
    wc.append(game("W29", "FIWC", 2013, "N1", "N2", 1, 0, round_="Final", date="2014-07-13"))
    euro = [game(f"E{i}", "EURO", 2020, "N1", "N2", 0, 0, date="2021-06-12") for i in range(29)]
    euro.append(game("E29", "EURO", 2020, "N2", "N1", 2, 1, round_="Final", date="2021-07-11"))
    partial = [game(f"P{i}", "FIWC", 2025, "N1", "N2", 0, 0, date="2026-06-20") for i in range(40)]
    games = pd.DataFrame(league + cl_final + wc + euro + partial)
    games["home_club_name"] = games["home_club_id"]
    games["away_club_name"] = games["away_club_id"]
    apps = pd.DataFrame({
        "game_id": ["L0", "L1", "F2"], "player_id": ["10", "10", "10"], "player_club_id": ["A", "A", "A"],
        "competition_id": ["GB1", "GB1", "CL"], "date": ["2015-09-01"] * 3, "goals": [1.0, 0.0, 0.0]})
    events = pd.DataFrame({
        "game_id": ["W0", "W29", "W29", "W1"],
        "type": ["Goals", "Goals", "Substitutions", "Goals"],
        "club_id": ["N1", "N1", "N1", "N2"],
        "player_id": ["10", "10", "11", "12"],
        "player_in_id": [None, None, "13", None],
        "description": [", Header", ", Penalty", ", Tactical", ", Own-goal"]})
    tm_to_club = pd.Series({"A": "Qa", "B": "Qb", "C": "Qc"})
    pid_for_tm = pd.Series({"10": "Q10", "11": "Q11", "12": "Q12", "13": "Q13"})
    nation_for_tm = pd.Series({"N1": "Qn1", "N2": "Qn2"})
    return d.derive(games, apps, events, tm_to_club, pid_for_tm, nation_for_tm)


def test_league_champion_from_table_and_cl_winner_including_penalty_goals(world):
    ch = world["champions"].set_index(["competition_key", "season"])["club_id"]
    assert ch[("premier-league", 2015.0)] == "Qa"
    assert ch[("champions-league", 2016.0)] == "Qb"      # 4-6 (penalties included) -> away side


def test_league_and_cl_apps(world):
    la = world["league_apps"]
    assert la.loc[0, ["player_id", "league_key", "club_id", "apps"]].tolist() == ["Q10", "premier-league", "Qa", 2]
    assert world["cl_apps"].loc[0, "apps"] == 1


def test_editions_need_a_final_and_label_euro_2020(world):
    assert sorted(world["editions"]["edition"]) == ["2014 World Cup", "Euro 2020"]


def test_tournament_apps_come_from_events_and_skip_own_goals(world):
    t = world["tournament_apps"].set_index("player_id")
    assert (t.loc["Q10", "edition"], t.loc["Q10", "nation_id"], t.loc["Q10", "apps"], t.loc["Q10", "goals"]) == \
        ("2014 World Cup", "Qn1", 2, 2)
    assert t.loc["Q11", "goals"] == 0 and t.loc["Q13", "apps"] == 1   # subbed off / subbed on
    assert t.loc["Q12", "goals"] == 0                                 # own goal is not a goal


def test_managers_and_stadiums(world):
    spells = world["manager_spells"]
    assert spells.loc[spells["manager_id"] == "mgr:arsene wenger", "games"].sum() == 2  # A is at home twice
    names = world["managers"].set_index("manager_id")["name"]
    assert names["mgr:arsene wenger"] == "Arsène Wenger"
    st = world["stadiums"].set_index("stadium_id")
    assert st.at["std:emirates stadium", "home_club_id"] == "Qa"
    assert st.at["std:emirates stadium", "games"] == 2


def test_euro_clubs(world):
    assert set(world["euro_clubs"]["club_id"]) == {"Qa", "Qb"}
