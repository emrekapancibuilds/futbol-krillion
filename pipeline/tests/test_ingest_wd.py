import json

import pandas as pd

from jobless import ingest_wd


def uri(q):
    return {"type": "uri", "value": f"http://www.wikidata.org/entity/{q}"}


def lit(v):
    return {"type": "literal", "value": str(v)}


CANNED = {
    "clubs_by_tm_id": [{"tm": lit("11"), "club": uri("Q9617")}],
    "clubs_in_leagues": [{"club": uri("Q9617"), "league": uri("Q9448")},
                         {"club": uri("Q18656"), "league": uri("Q9448")}],
    "players_by_tm_id": [{"tm": lit("3207"), "p": uri("Q45901")}],
    "players_of_clubs": [{"p": uri("Q45901")}, {"p": uri("Q2")}],
    "player_details": [{"p": uri("Q45901"), "name": lit("Thierry Henry"), "sitelinks": lit(103),
                        "tm_id": lit("3207")},
                       {"p": uri("Q2"), "name": lit("Hugh Glass"), "sitelinks": lit(0)}],
    "player_aliases": [{"p": uri("Q45901"), "alias": lit("Titi")}],
    "player_stints": [{"p": uri("Q45901"), "st": uri("statement/s1"), "team": uri("Q9617"),
                       "start": lit("1999-01-01T00:00:00Z"), "apps": lit(254), "goals": lit(174)}],
    "player_awards": [{"p": uri("Q45901"), "award": uri("Q999")}],
    "team_details": [{"team": uri("Q9617"), "name": lit("Arsenal F.C."), "classes": lit("Q476028")},
                     {"team": uri("Q18656"), "name": lit("France men's national association football team"),
                      "classes": lit("Q135408445")},
                     {"team": uri("Q20"), "name": lit("Galatasaray SK"), "classes": lit("Q847017")},
                     {"team": uri("Q21"), "name": lit("Arsenal W.F.C."), "classes": lit("Q28140340")}],
    "award_details": [{"award": uri("Q999"), "name": lit("Golden Boot"), "sitelinks": lit(50)}],
    "female_players": [{"p": uri("Q2")}, {"p": uri("Q777")}],   # Q777 is a women's player we never pulled
}


class FakeWd:
    def __init__(self):
        self.calls = []

    def post_form(self, url, form, headers=None, cache_key=None):
        marker = form["query"].split("\n", 1)[0].removeprefix("#jobless:")
        self.calls.append(marker)
        if marker == "subclasses":   # national-team root vs club root
            tree = {"Q6979593": ["Q6979593", "Q135408445"], "Q476028": ["Q476028"], "Q847017": ["Q847017"],
                    "Q15944511": ["Q15944511", "Q28140340"]}   # Q28140340 = women's association football team
            rows = [{"cls": uri(c)} for root, sub in tree.items() if f"wd:{root}" in form["query"] for c in sub]
            return json.dumps({"results": {"bindings": rows}}).encode()
        return json.dumps({"results": {"bindings": CANNED[marker]}}).encode()


def test_collect_unions_player_sources_and_returns_every_frame():
    out = ingest_wd.collect(FakeWd(), pd.DataFrame({"player_id": ["3207"]}),
                            pd.DataFrame({"club_id": ["11"]}), pd.DataFrame({"national_team_id": ["3377"]}))
    assert set(out) == {"wd_club_map", "wd_league_clubs", "wd_tm_map", "wd_players", "wd_aliases",
                        "wd_stints", "wd_awards", "wd_teams", "wd_award_info", "wd_female"}
    assert sorted(out["wd_players"]["p"]) == ["Q2", "Q45901"]
    assert out["wd_stints"].loc[0, "apps"] == "254"
    assert list(out["wd_teams"].columns) == ingest_wd.TEAM_COLS
    teams = out["wd_teams"].set_index("team")
    assert (teams.at["Q9617", "club"], teams.at["Q9617", "national"]) == ("true", "false")
    assert (teams.at["Q18656", "club"], teams.at["Q18656", "national"]) == ("false", "true")


def test_multi_sport_clubs_count_but_womens_teams_do_not():
    """Galatasaray SK, Legia Warsaw, Le Havre AC... are typed 'sports club', not 'association football club'."""
    teams = ingest_wd.collect(FakeWd(), pd.DataFrame({"player_id": ["3207"]}), pd.DataFrame({"club_id": ["11"]}),
                              pd.DataFrame({"national_team_id": ["3377"]}))["wd_teams"].set_index("team")
    assert teams.at["Q20", "club"] == "true"
    assert teams.at["Q21", "club"] == "false"


def test_rows_batches_and_skips_blank_and_unknown_value_ids():
    fake = FakeWd()
    unknown = "http://www.wikidata.org/.well-known/genid/3d38bdf4fce91b9663"
    ingest_wd._rows(fake, ingest_wd.q.players_of_clubs, ["Q1", "Q2", None, "", unknown, "Q3", "Q4", "Q5"], 2)
    assert fake.calls == ["players_of_clubs"] * 3


def test_women_players_are_listed_so_merge_can_drop_them():
    """Wikidata often links women players to the parent club item (Lucy Bronze -> FC Barcelona)."""
    fake = FakeWd()
    out = ingest_wd.female_players(fake, ["Q45901", "Q2"])
    assert out["p"].tolist() == ["Q2"]
    assert fake.calls == ["female_players"]            # one query for all of them, not one per batch
    assert "wdt:P21 wd:Q6581072" in ingest_wd.q.female_players()
