"""One-line facts shown on the result card (spec §5). Plain text only: no emojis."""
import pandas as pd

POSITION_WORD = {"GK": "Goalkeeper", "DF": "Defender", "MF": "Midfielder", "FW": "Forward"}


def _int(x) -> int | None:
    return None if x is None or pd.isna(x) else int(x)


def years(start, end) -> str:
    s, e = _int(start), _int(end)
    if s and e:
        return str(s) if s == e else f"{s}–{e}"
    return str(s or e or "")


def span(lo, hi) -> str:
    """' (2014)' or ' (2010–2022)': the date range appended to a prompt."""
    lo, hi = int(lo), int(hi)
    return f" ({lo})" if lo == hi else f" ({lo}–{hi})"


def season_label(season) -> str:
    s = int(season)
    return f"{s}–{str(s + 1)[-2:]}"


def club_stint(apps, club: str, start, end) -> str:
    head = f"{int(apps)} apps for {club}" if _int(apps) else club
    span = years(start, end)
    return f"{head}, {span}" if span else head


def player_line(nation, positions, first, last) -> str:
    code = positions.split("|")[0] if isinstance(positions, str) and positions else None
    parts = [nation if isinstance(nation, str) else None, POSITION_WORD.get(code), years(first, last) or None]
    return " · ".join(p for p in parts if p)


def article(word: str) -> str:
    """'an' before a vowel sound: 'an England international', 'a Wales international', 'a United States ...'."""
    w = word.strip().upper()
    if w.startswith("UZ"):
        return "an"
    return "an" if w[:1] in "AEIO" else "a"


def caps_line(caps, nation: str) -> str | None:
    n = _int(caps)
    return f"{n} cap{'s' if n != 1 else ''} for {nation}" if n else None


def goals_line(goals, edition: str) -> str:
    n = int(goals)
    return f"{n} goal{'s' if n != 1 else ''} at the {edition}"


def apps_line(apps, where: str) -> str:
    n = int(apps)
    return f"{n} app{'s' if n != 1 else ''} at the {where}"


def title_line(competition: str, season) -> str:
    return f"{competition} winner {season_label(season)}"


def league_span_line(apps, league: str, first_season, last_season) -> str:
    return f"{int(apps)} {league} apps, {int(first_season)}–{int(last_season) + 1}"


def goals_span_line(goals, league: str, first_season, last_season) -> str:
    n = int(goals)
    return f"{n} {league} goal{'s' if n != 1 else ''}, {int(first_season)}–{int(last_season) + 1}"


def club_cl_line(apps, club: str, first_season, last_season) -> str:
    n = int(apps)
    return f"{n} Champions League app{'s' if n != 1 else ''} for {club}, {int(first_season)}–{int(last_season) + 1}"


def club_line(league, country) -> str:
    return " · ".join(p for p in (league, country) if isinstance(p, str))


def seasons_line(n, league: str) -> str:
    n = int(n)
    return f"{n} {league} season{'s' if n != 1 else ''} since 2012"


def manager_line(games, league: str, first_season, last_season) -> str:
    return f"{int(games)} {league} games, {int(first_season)}–{int(last_season) + 1}"


def stadium_line(games, home_club) -> str:
    base = f"{int(games)} matches since 2012"
    return f"Home of {home_club} · {base}" if isinstance(home_club, str) else base


def team_tournament_line(n, total, kind: str, first_year) -> str:
    """'4 of 6 World Cups since 2006': how many of the tournaments in the data a national team played."""
    plural = "World Cups" if kind == "World Cup" else "Euros"
    return f"{int(n)} of {int(total)} {plural} since {int(first_year)}"


def nation_line(n) -> str:
    n = int(n)
    return f"{n} major tournament{'s' if n != 1 else ''} since 2010"
