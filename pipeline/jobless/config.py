"""Project-wide constants. Every number here comes from the design spec."""
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
CACHE = ROOT / "cache"
OUT = ROOT / "out"
EXPORT = ROOT / "export"
DATA = ROOT / "data"

USER_AGENT = "JoblessSoccerGame/0.1 (offline data pipeline)"

TM_BASE_URL = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data"
TM_TABLES = ["players", "clubs", "competitions", "appearances", "games", "national_teams", "game_events"]
TM_SNAPSHOT = "2026-07-06"

TIERS = [
    ("World Cup Bandwagon", 10),
    ("Glory Hunter", 40),
    ("Part-Time Fan", 80),
    ("Season Ticket Holder", 160),
    ("True Analyst", 320),
    ("Insane Ball Knowledge", 640),
    ("Jobless", 1000),
]
# Players: the last fame rank in each of tiers 1-6; everyone after rank 32,000 is Jobless. Fixed ranks, not
# percentages: what a fan knows doesn't grow when the database adds more obscure players.
# Middle boundaries loosened 2026-10-11 (user call): the fitted formula rated mid-level players too famous.
PLAYER_TIER_RANKS = [300, 1000, 2000, 5000, 12000, 32000]
# Clubs, nations, managers and stadiums: the upper bound of each tier as a fraction of that type's population.
TIER_UPPER_FRACTION = [0.006, 0.03, 0.08, 0.18, 0.36, 0.64, 1.0]


class League(NamedTuple):
    name: str     # display name
    phrase: str   # how it reads inside a prompt: "Name a player who won {phrase}"
    weight: float
    qid: str      # Wikidata item (verified 2026-10-10)
    tm: str | None  # Transfermarkt competition id; None = not in the dataset


LEAGUES = {
    "premier-league": League("Premier League", "the Premier League", 1.0, "Q9448", "GB1"),
    "la-liga": League("La Liga", "La Liga", 0.85, "Q324867", "ES1"),
    "serie-a": League("Serie A", "Serie A", 0.8, "Q15804", "IT1"),
    "bundesliga": League("Bundesliga", "the Bundesliga", 0.75, "Q82595", "L1"),
    "ligue-1": League("Ligue 1", "Ligue 1", 0.6, "Q13394", "FR1"),
    "eredivisie": League("Eredivisie", "the Eredivisie", 0.35, "Q167541", "NL1"),
    "primeira-liga": League("Primeira Liga", "the Primeira Liga", 0.35, "Q182994", "PO1"),
    "championship": League("Championship", "the Championship", 0.3, "Q19510", None),
    "mls": League("MLS", "MLS", 0.25, "Q18543", "MLS1"),
    "saudi-pro-league": League("Saudi Pro League", "the Saudi Pro League", 0.25, "Q255633", "SA1"),
    "super-lig": League("Süper Lig", "the Süper Lig", 0.2, "Q485568", "TR1"),
    "scottish-premiership": League("Scottish Premiership", "the Scottish Premiership", 0.2, "Q14377162", "SC1"),
    "belgian-pro-league": League("Belgian Pro League", "the Belgian Pro League", 0.2, "Q216022", "BE1"),
    "laliga-2": League("LaLiga 2", "LaLiga 2", 0.15, "Q35615", None),
    "serie-b": League("Serie B", "Serie B", 0.15, "Q194052", None),
    "2-bundesliga": League("2. Bundesliga", "the 2. Bundesliga", 0.15, "Q152665", None),
    "ligue-2": League("Ligue 2", "Ligue 2", 0.15, "Q217374", None),
}
LEAGUE_BY_QID = {lg.qid: key for key, lg in LEAGUES.items()}
LEAGUE_BY_TM = {lg.tm: key for key, lg in LEAGUES.items() if lg.tm}
OTHER_LEAGUE_WEIGHT = 0.1
CHAMPIONS_LEAGUE_WEIGHT = 1.2
TOURNAMENT_WEIGHT = 1.2
# Leagues whose champion is the top of the table (no play-offs); used for title data and prompts.
TABLE_DECIDED_LEAGUES = ["premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1", "eredivisie", "primeira-liga"]
EUROPEAN_COMPETITIONS = {"CL", "CLQ", "EL", "ELQ", "UCOL", "ECLQ", "USC"}
TOURNAMENTS = {"FIWC": "World Cup", "EURO": "Euro"}

FAME_WEIGHTS = {"league": 0.25, "club_peak": 0.15, "market_value": 0.20,
                "international": 0.10, "honours": 0.10, "attention": 0.20}
ENTITY_FAME_WEIGHTS = {
    "club": {"attention": 0.5, "top_flight": 0.3, "trophies": 0.2},
    "nation": {"attention": 0.6, "tournaments": 0.4},
    "manager": {"games": 0.6, "club_peak": 0.4},
    "stadium": {"hosted": 0.4, "attendance": 0.3, "home_prestige": 0.3},
}
ERA_CUTOFF_YEAR = 1990
ERA_SLOPE = 0.01
ERA_FLOOR = 0.6
LEGEND_TOP_N = 1000   # old players keep their full fame only if they are among the top 1,000 by attention
CLUB_PEAK_FULL_APPS = 30
CLUB_PEAK_UNKNOWN_APPS_FACTOR = 0.5
MAJOR_AWARD_SITELINKS = 40

WD_FOOTBALLER = "Q937857"
WD_CLUB_CLASS = "Q476028"
# A team counts as a club if one of its direct types sits under one of these roots. Many real clubs (Galatasaray
# SK, Legia Warsaw, Le Havre AC) are typed "sports club" or "association football team", not "football club".
WD_CLUB_ROOTS = [WD_CLUB_CLASS, "Q847017", "Q15944511"]   # football club, sports club, association football team
WD_NOT_CLUB_CLASSES = {"Q28140340"}                        # women's association football team
WD_NATIONAL_TEAM = "Q6979593"
