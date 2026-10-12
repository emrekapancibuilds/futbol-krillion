import numpy as np

from jobless import facts as f


def test_club_stint_variants():
    assert f.club_stint(254, "Arsenal F.C.", 1999, 2007) == "254 apps for Arsenal F.C., 1999–2007"
    assert f.club_stint(np.nan, "Arsenal F.C.", 1899, 1900) == "Arsenal F.C., 1899–1900"
    assert f.club_stint(np.nan, "Arsenal F.C.", np.nan, np.nan) == "Arsenal F.C."


def test_player_line_skips_missing_parts():
    assert f.player_line("France", "FW|MF", 1994, 2014) == "France · Forward · 1994–2014"
    assert f.player_line(None, "", np.nan, 2010) == "2010"


def test_season_and_title():
    assert f.season_label(2012) == "2012–13"
    assert f.title_line("Bundesliga", 2012.0) == "Bundesliga winner 2012–13"


def test_plural_rules():
    assert f.goals_line(1, "2014 World Cup") == "1 goal at the 2014 World Cup"
    assert f.goals_line(3, "Euro 2020") == "3 goals at the Euro 2020"
    assert f.nation_line(1) == "1 major tournament since 2010"


def test_span():
    assert f.span(2014, 2014) == " (2014)"
    assert f.span(2010.0, 2022.0) == " (2010–2022)"


def test_article_follows_the_sound_not_the_letter():
    from jobless.facts import article
    assert [article(w) for w in ["England", "Italy", "Austria", "United States", "Uruguay", "Ukraine", "Uzbekistan", "Wales"]] == \
        ["an", "an", "an", "a", "a", "a", "an", "a"]
