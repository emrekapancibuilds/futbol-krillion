"""Download the Transfermarkt-derived dataset and keep the columns the pipeline uses."""
import pandas as pd

from jobless.config import OUT, RAW, TM_BASE_URL, TM_TABLES
from jobless.http import Http

COLUMNS = {
    "players": ["player_id", "name", "first_name", "last_name", "date_of_birth", "position", "sub_position",
                "country_of_citizenship", "international_caps", "current_national_team_id",
                "highest_market_value_in_eur", "last_season"],
    "clubs": ["club_id", "name", "domestic_competition_id", "stadium_name", "last_season"],
    "competitions": ["competition_id", "name", "type", "sub_type", "country_name"],
    "appearances": ["game_id", "player_id", "player_club_id", "competition_id", "date", "goals", "assists",
                    "minutes_played"],
    "games": ["game_id", "competition_id", "season", "round", "date", "home_club_id", "away_club_id",
              "home_club_goals", "away_club_goals", "home_club_manager_name", "away_club_manager_name",
              "stadium", "attendance", "home_club_name", "away_club_name"],
    "national_teams": ["national_team_id", "name", "country_name"],
    # Per-player appearances for World Cups and Euros exist only for 2026; goal, card and substitution
    # events go back to 2006, so tournament data is built from these.
    "game_events": ["game_id", "type", "club_id", "player_id", "player_in_id", "description"],
}
NUMERIC = {"international_caps", "highest_market_value_in_eur", "last_season", "goals", "assists",
           "minutes_played", "season", "home_club_goals", "away_club_goals", "attendance"}


def download(http: Http, dest=RAW / "tm") -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for table in TM_TABLES:
        path = dest / f"{table}.csv.gz"
        if not path.exists():
            path.write_bytes(http.get(f"{TM_BASE_URL}/{table}.csv.gz"))


def load_table(path, table: str) -> pd.DataFrame:
    df = pd.read_csv(path, usecols=COLUMNS[table], dtype="string")[COLUMNS[table]]
    for col in df.columns:
        if col in NUMERIC:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
    return df


def build(src=RAW / "tm", out=OUT) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for table in TM_TABLES:
        load_table(src / f"{table}.csv.gz", table).to_parquet(out / f"tm_{table}.parquet", index=False)


def main() -> int:
    download(Http(cache_dir=None))
    build()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
