import gzip

import pandas as pd

from jobless import ingest_tm

PLAYERS_CSV = (
    "player_id,name,first_name,last_name,date_of_birth,position,sub_position,country_of_citizenship,"
    "international_caps,current_national_team_id,highest_market_value_in_eur,last_season,agent_name\n"
    "10,Miroslav Klose,Miroslav,Klose,1978-06-09 00:00:00,Attack,Centre-Forward,Germany,137,3262,30000000,2015,X\n"
    "26,Roman Weidenfeller,Roman,Weidenfeller,1980-08-06 00:00:00,Goalkeeper,Goalkeeper,Germany,,,8000000,2017,Y\n")


def write_gz(path, text):
    with gzip.open(path, "wt") as f:
        f.write(text)


def test_load_players_keeps_ids_as_strings_and_numbers_numeric(tmp_path):
    path = tmp_path / "players.csv.gz"
    write_gz(path, PLAYERS_CSV)
    df = ingest_tm.load_table(path, "players")
    assert list(df.columns) == ingest_tm.COLUMNS["players"]
    assert df.loc[0, "player_id"] == "10"
    assert df.loc[0, "highest_market_value_in_eur"] == 30_000_000
    assert pd.isna(df.loc[1, "international_caps"])


def test_download_only_fetches_missing_tables(tmp_path, monkeypatch):
    monkeypatch.setattr(ingest_tm, "TM_TABLES", ["players", "clubs"])
    (tmp_path / "players.csv.gz").write_bytes(b"already here")
    fetched = []

    class FakeHttp:
        def get(self, url, headers=None, cache_key=None):
            fetched.append(url)
            return b"data"

    ingest_tm.download(FakeHttp(), dest=tmp_path)
    assert fetched == [f"{ingest_tm.TM_BASE_URL}/clubs.csv.gz"]
    assert (tmp_path / "clubs.csv.gz").read_bytes() == b"data"
