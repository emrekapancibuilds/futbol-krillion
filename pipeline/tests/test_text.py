import pytest

from jobless.text import club_display, club_fold, club_short_name, fold, year


@pytest.mark.parametrize("raw,short", [
    ("Chelsea FC", "Chelsea"), ("FC Barcelona", "Barcelona"), ("AFC Bournemouth", "Bournemouth"),
    ("Arsenal F.C.", "Arsenal"), ("Real Madrid", "Real Madrid"), ("AC Milan", "AC Milan"),
    ("1. FC Köln", "1. FC Köln"), ("FC", "FC")])
def test_club_display(raw, short):
    assert club_display(raw) == short


def test_fold_and_club_fold():
    assert fold("Mesut Özil") == "mesut ozil"
    assert club_fold("Burnley F.C.") == club_fold("Burnley FC") == "burnley"


def test_year():
    assert year("1999-01-01T00:00:00Z") == 1999.0
    assert year(None) != year(None)  # NaN


@pytest.mark.parametrize("forms,short", [
    (["Società Sportiva Lazio S.p.A.", "SS Lazio"], "SS Lazio"),
    (["Panthessalonikios Athlitikos Omilos Konstantinoupoliton", "PAOK FC"], "PAOK"),
    (['Футбольный клуб "Локомотив" Москва', "FC Lokomotiv Moscow"], "Lokomotiv Moscow"),
    (["Dnipro Dnipropetrovsk (-2020)", None], "Dnipro Dnipropetrovsk"),
    (["B SAD", "B-SAD"], "B SAD"),                     # tie: the first form (Transfermarkt) wins
    (["Arsenal FC", "Arsenal F.C."], "Arsenal"),
    ([None, "Galatasaray S.K."], "Galatasaray S.K."),
    (['Футбольный клуб "Локомотив" Москва', None], 'Футбольный клуб "Локомотив" Москва'),  # nothing better
])
def test_club_short_name_is_the_shortest_latin_form(forms, short):
    assert club_short_name(forms) == short
