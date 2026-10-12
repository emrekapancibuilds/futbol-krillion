"""Prompt templates (spec §5). Each generator yields Candidates: prompt text + answer ids + fact lines."""
import dataclasses
import itertools
from dataclasses import dataclass

import pandas as pd

from jobless import facts
from jobless.config import EUROPEAN_COMPETITIONS, LEAGUES, OUT, TABLE_DECIDED_LEAGUES, TOURNAMENTS
from jobless.text import club_fold

MIN_CLUB_PLAYERS = 40
MIN_PAIR_PLAYERS = 15
TOP_CLUBS_FOR_PAIRS = 60
TM_ERA = " (2012–2026)"
ERAS = [("all", None, None, ""), ("1992", 1992, 2026, " (1992–2026)"), ("2012", 2012, 2026, " (2012–2026)")]
POSITIONS = {"GK": "goalkeeper", "DF": "defender", "MF": "midfielder", "FW": "forward"}
# Dailies stick to Europe's top 5 leagues for now (user, 2026-10-11); everything else is for Unlimited.
TOP5 = {"premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1"}
MAINSTREAM_NATION_MIN_PLAYERS = 60   # a national team counts when this many of its players played in the top 5
MAINSTREAM_CLUB_MIN_SEASONS = 8      # a club counts when it is in the top 5 now, or spent this many seasons there


@dataclass
class Candidate:
    key: str
    family: str
    entity_type: str
    text: str
    facts: dict[str, str]  # answer entity id -> fact line
    mainstream: bool = True  # fit for the free daily (top 5 leagues); False = Unlimited only
    category: str | None = None  # Unlimited round type: a top-5 league key, "champions-league" or "international"
    scores: dict[str, float] | None = None  # team prompts: how well known each team is, to rank them inside the category


@dataclass
class World:
    players: pd.DataFrame      # index player_id
    stints: pd.DataFrame
    clubs: pd.DataFrame        # index club_id
    nations: pd.DataFrame      # index nation_id
    league_apps: pd.DataFrame
    cl_apps: pd.DataFrame
    champions: pd.DataFrame
    tournament_apps: pd.DataFrame
    nation_tournaments: pd.DataFrame
    manager_spells: pd.DataFrame
    stadiums: pd.DataFrame     # index stadium_id
    stadium_games: pd.DataFrame
    editions: pd.DataFrame
    euro_clubs: pd.DataFrame
    club_prestige: pd.Series
    top5_clubs: frozenset | None = None   # filled on first use by _top5
    club_league: dict | None = None       # club -> the top-5 league it spent most seasons in; filled by _club_league
    team_editions: pd.DataFrame | None = None   # who played each World Cup / Euro, including one still being played

    def player_fact(self, pid: str) -> str:
        p = self.players.loc[pid]
        nation = self.nations["name"].get(p["nation_id"]) if isinstance(p["nation_id"], str) else None
        return facts.player_line(nation, p["positions"], p["first_year"], p["last_year"])


def load_world(out=OUT) -> World:
    read = lambda name: pd.read_parquet(out / f"{name}.parquet")
    return World(players=read("players").set_index("player_id"), stints=read("stints"),
                 clubs=read("clubs").set_index("club_id"), nations=read("nations").set_index("nation_id"),
                 league_apps=read("league_apps"), cl_apps=read("cl_apps"), champions=read("champions"),
                 tournament_apps=read("tournament_apps"), nation_tournaments=read("nation_tournaments"),
                 manager_spells=read("manager_spells"), stadiums=read("stadiums").set_index("stadium_id"),
                 stadium_games=read("stadium_games"), editions=read("editions"), euro_clubs=read("euro_clubs"),
                 club_prestige=read("fame_clubs").set_index("entity_id")["prestige"],
                 team_editions=read("team_editions") if (out / "team_editions.parquet").exists() else None)


def in_era(stints: pd.DataFrame, lo, hi) -> pd.Series:
    """Stints overlapping [lo, hi]. Undated stints only count for all-time prompts (lo is None)."""
    if lo is None:
        return pd.Series(True, index=stints.index)
    s, e = stints["start_year"], stints["end_year"]
    return (s.fillna(e) <= hi) & (e.fillna(s) >= lo)


def _best_stints(st: pd.DataFrame) -> pd.DataFrame:
    return st.sort_values("apps", ascending=False, na_position="last").drop_duplicates("player_id")


def _top5(w: World, club_id: str) -> bool:
    """In a top-5 league in the latest season, or there for a long stretch since 2012. A Wikidata league
    label alone is not enough: it often still names a league the club left years ago."""
    if w.top5_clubs is None:
        apps = w.league_apps[w.league_apps["league_key"].isin(TOP5)]
        seasons = apps.groupby("club_id")["season"].agg(["nunique", "max"])
        latest = w.league_apps["season"].max()
        w.top5_clubs = frozenset(seasons.index[(seasons["max"] >= latest) | (seasons["nunique"] >= MAINSTREAM_CLUB_MIN_SEASONS)])
    return club_id in w.top5_clubs


def _club_league(w: World, club_id: str) -> str | None:
    if w.club_league is None:
        apps = w.league_apps[w.league_apps["league_key"].isin(TOP5)]
        seasons = apps.groupby(["club_id", "league_key"])["season"].nunique().reset_index()
        best = seasons.sort_values("season", ascending=False).drop_duplicates("club_id")
        w.club_league = dict(zip(best["club_id"], best["league_key"]))
    return w.club_league.get(club_id)


def category_of(w: World, c: Candidate) -> str | None:
    """The Unlimited round type a prompt belongs to, read from its key."""
    kind, _, rest = c.key.partition(":")
    first = rest.split(":")[0]
    if kind in ("club", "clubpos"):
        return _club_league(w, first)
    if kind in ("clubcl", "champions") or c.key in ("won:champions-league", "stadiums:cl", "clubs:champions-league"):
        return "champions-league"
    if kind in ("intl", "natpos", "scored", "nations") or c.key == "stadiums:tournaments":
        return "international"
    if kind in ("league", "leaguepos", "scorers", "managers", "clubs", "won"):
        return first if first in TOP5 else None
    if kind == "natleague":
        league = rest.split(":")[1]
        return league if league in TOP5 else None
    return None


def _club_name(w: World, club_id: str) -> str | None:
    name = w.clubs["name"].get(club_id)
    return name if isinstance(name, str) else None


def club_prompts(w: World):
    for club_id, st in w.stints.groupby("club_id"):
        name = _club_name(w, club_id)
        if not name or st["player_id"].nunique() < MIN_CLUB_PLAYERS:
            continue
        for era_key, lo, hi, suffix in ERAS:
            best = _best_stints(st[in_era(st, lo, hi)])
            if best.empty:
                continue
            yield Candidate(f"club:{club_id}:{era_key}", "club", "player", f"Name a player who played for {name}{suffix}",
                            {r.player_id: facts.club_stint(r.apps, name, r.start_year, r.end_year)
                             for r in best.itertuples()}, _top5(w, club_id))


def club_position_prompts(w: World):
    positions = w.players["positions"].fillna("")
    for club_id, st in w.stints.groupby("club_id"):
        name = _club_name(w, club_id)
        if not name or st["player_id"].nunique() < MIN_CLUB_PLAYERS:
            continue
        best = _best_stints(st)
        codes = best["player_id"].map(positions).fillna("")
        for code, word in POSITIONS.items():
            sel = best[codes.str.split("|").map(lambda c: code in c)]
            if not sel.empty:
                yield Candidate(f"clubpos:{club_id}:{code}", "club_position", "player",
                                f"Name a {word} who played for {name}",
                                {r.player_id: facts.club_stint(r.apps, name, r.start_year, r.end_year)
                                 for r in sel.itertuples()}, _top5(w, club_id))


def two_club_prompts(w: World):
    top = [c for c in w.club_prestige.sort_values(ascending=False).index if _club_name(w, c)][:TOP_CLUBS_FOR_PAIRS]
    members = {c: set(g) for c, g in w.stints[w.stints["club_id"].isin(top)].groupby("club_id")["player_id"]}
    for a, b in itertools.combinations(top, 2):
        both = members.get(a, set()) & members.get(b, set())
        if len(both) >= MIN_PAIR_PLAYERS:
            yield Candidate(f"two:{a}:{b}", "two_clubs", "player",
                            f"Name a player who played for both {_club_name(w, a)} and {_club_name(w, b)}",
                            {pid: w.player_fact(pid) for pid in sorted(both)}, _top5(w, a) and _top5(w, b))


def nation_league_prompts(w: World):
    la = w.league_apps.assign(nation_id=w.league_apps["player_id"].map(w.players["nation_id"])).dropna(subset=["nation_id"])
    for (nation_id, league_key), g in la.groupby(["nation_id", "league_key"]):
        nation = w.nations["name"].get(nation_id)
        if not isinstance(nation, str) or "team" in nation.lower():
            continue
        league = LEAGUES[league_key]
        tot = g.groupby("player_id").agg(apps=("apps", "sum"), first=("season", "min"), last=("season", "max"))
        yield Candidate(f"natleague:{nation_id}:{league_key}", "nation_league", "player",
                        f"Name {facts.article(nation)} {nation} international who played in {league.phrase}{TM_ERA}",
                        {pid: facts.league_span_line(r.apps, league.name, r.first, r.last) for pid, r in tot.iterrows()},
                        league_key in TOP5)


def league_prompts(w: World):
    """Broad: one league, every player in it since 2012."""
    for league_key, g in w.league_apps.groupby("league_key"):
        league = LEAGUES[league_key]
        tot = g.groupby("player_id").agg(apps=("apps", "sum"), first=("season", "min"), last=("season", "max"))
        yield Candidate(f"league:{league_key}", "league", "player", f"Name a player who played in {league.phrase}{TM_ERA}",
                        {pid: facts.league_span_line(r.apps, league.name, r.first, r.last) for pid, r in tot.iterrows()},
                        league_key in TOP5)


def champions_prompts(w: World):
    if w.cl_apps.empty:
        return
    tot = w.cl_apps.groupby("player_id").agg(apps=("apps", "sum"), first=("season", "min"), last=("season", "max"))
    yield Candidate("champions:all", "champions", "player", f"Name a player who played in the Champions League{TM_ERA}",
                    {pid: facts.league_span_line(r.apps, "Champions League", r.first, r.last) for pid, r in tot.iterrows()})


def _national_teams(w: World):
    """(nation_id, name, player ids, mainstream) for every national team with a usable name. Mainstream: a FIFA
    side (it has a Transfermarkt team) with enough of its players in the top 5 leagues."""
    top5_players = w.league_apps.loc[w.league_apps["league_key"].isin(TOP5), "player_id"].unique()
    in_top5 = w.players["nation_id"].reindex(top5_players).value_counts()
    for nation_id, ids in w.players.groupby("nation_id").groups.items():
        nation = w.nations["name"].get(nation_id)
        if not isinstance(nation, str) or "team" in nation.lower():   # beach soccer, regional and other odd teams
            continue
        fifa = "tm_team_id" not in w.nations or pd.notna(w.nations["tm_team_id"].get(nation_id))
        yield nation_id, nation, ids, fifa and int(in_top5.get(nation_id, 0)) >= MAINSTREAM_NATION_MIN_PLAYERS


def _caps_fact(w: World, pid: str, nation: str) -> str:
    caps = w.players["caps"].get(pid) if "caps" in w.players else None
    return facts.caps_line(caps, nation) or w.player_fact(pid)


def international_prompts(w: World):
    """Broad: every player capped by one national team."""
    for nation_id, nation, ids, mainstream in _national_teams(w):
        yield Candidate(f"intl:{nation_id}", "internationals", "player", f"Name {facts.article(nation)} {nation} international",
                        {pid: _caps_fact(w, pid, nation) for pid in ids}, mainstream)


def nation_position_prompts(w: World):
    """Easy: 'Name a forward who played for Brazil'."""
    positions = w.players["positions"].fillna("")
    for nation_id, nation, ids, mainstream in _national_teams(w):
        for code, word in POSITIONS.items():
            sel = [pid for pid in ids if code in positions.get(pid, "").split("|")]
            if sel:
                yield Candidate(f"natpos:{nation_id}:{code}", "nation_position", "player",
                                f"Name a {word} who played for {nation}", {pid: _caps_fact(w, pid, nation) for pid in sel},
                                mainstream)


def club_cl_prompts(w: World):
    """'Name a player who played for Real Madrid in the Champions League (2012–2026)'."""
    for club_id, g in w.cl_apps.groupby("club_id"):
        name = _club_name(w, club_id)
        if not name:
            continue
        tot = g.groupby("player_id").agg(apps=("apps", "sum"), first=("season", "min"), last=("season", "max"))
        yield Candidate(f"clubcl:{club_id}", "club_cl", "player",
                        f"Name a player who played for {name} in the Champions League{TM_ERA}",
                        {pid: facts.club_cl_line(r.apps, name, r.first, r.last) for pid, r in tot.iterrows()},
                        _top5(w, club_id))


def league_scorer_prompts(w: World):
    """Easy: 'Name a player who scored in the Premier League (2012–2026)'."""
    for league_key, g in w.league_apps[w.league_apps["goals"] > 0].groupby("league_key"):
        league = LEAGUES[league_key]
        tot = g.groupby("player_id").agg(goals=("goals", "sum"), first=("season", "min"), last=("season", "max"))
        yield Candidate(f"scorers:{league_key}", "league_scorers", "player", f"Name a player who scored in {league.phrase}{TM_ERA}",
                        {pid: facts.goals_span_line(r.goals, league.name, r.first, r.last) for pid, r in tot.iterrows()},
                        league_key in TOP5)


def league_position_prompts(w: World):
    """Easy: 'Name a forward who played in the Premier League (2012–2026)'."""
    positions = w.players["positions"].fillna("")
    for league_key, g in w.league_apps.groupby("league_key"):
        league = LEAGUES[league_key]
        tot = g.groupby("player_id").agg(apps=("apps", "sum"), first=("season", "min"), last=("season", "max"))
        codes = [positions.get(pid, "").split("|") for pid in tot.index]
        for code, word in POSITIONS.items():
            sel = tot[[code in c for c in codes]]
            if not sel.empty:
                yield Candidate(f"leaguepos:{league_key}:{code}", "league_position", "player",
                                f"Name a {word} who played in {league.phrase}{TM_ERA}",
                                {pid: facts.league_span_line(r.apps, league.name, r.first, r.last) for pid, r in sel.iterrows()},
                                league_key in TOP5)


def tournament_prompts(w: World):
    """Scorer prompts only: the data has every tournament goal since 2006 but not full squads."""
    ta = w.tournament_apps[w.tournament_apps["goals"] > 0]
    for edition, g in ta.groupby("edition"):
        goals = g.groupby("player_id")["goals"].sum()
        at = edition if edition.startswith("Euro") else f"the {edition}"      # 'at Euro 2024', 'at the 2014 World Cup'
        yield Candidate(f"scored:{edition}", "tournament", "player", f"Name a player who scored at {at}",
                        {pid: facts.goals_line(n, edition) for pid, n in goals.items()})
    for kind, label in (("World Cup", "a World Cup"), ("Euro", "the Euros")):
        g = ta[ta["kind"] == kind]
        if g.empty:
            continue
        span = facts.span(w.editions.loc[w.editions["kind"] == kind, "label_year"].min(),
                          w.editions.loc[w.editions["kind"] == kind, "label_year"].max())
        goals = g.groupby("player_id")["goals"].sum()
        yield Candidate(f"scored:{kind}", "tournament", "player", f"Name a player who scored at {label}{span}",
                        {pid: f"{int(n)} {kind} goal{'s' if n != 1 else ''}" for pid, n in goals.items()})
        for nation_id, gn in g.groupby("nation_id"):
            nation = w.nations["name"].get(nation_id)
            if isinstance(nation, str):
                ng = gn.groupby("player_id")["goals"].sum()
                yield Candidate(f"scored:{kind}:{nation_id}", "tournament", "player",
                                f"Name a player who scored for {nation} at {label}{span}",
                                {pid: f"{int(n)} {kind} goal{'s' if n != 1 else ''}" for pid, n in ng.items()})


def honours_prompts(w: World):
    for league_key in TABLE_DECIDED_LEAGUES:
        champs = w.champions[w.champions["competition_key"] == league_key]
        won = w.league_apps.merge(champs, left_on=["league_key", "season", "club_id"],
                                  right_on=["competition_key", "season", "club_id"])
        if won.empty:
            continue
        first = won.groupby("player_id")["season"].min()
        league = LEAGUES[league_key]
        yield Candidate(f"won:{league_key}", "honours", "player", f"Name a player who won {league.phrase}{TM_ERA}",
                        {pid: facts.title_line(league.name, s) for pid, s in first.items()}, league_key in TOP5)
    cl = w.champions[w.champions["competition_key"] == "champions-league"]
    won = w.cl_apps.merge(cl[["season", "club_id"]], on=["season", "club_id"])
    if not won.empty:
        span = facts.span(cl["season"].min() + 1, cl["season"].max() + 1)
        first = won.groupby("player_id")["season"].min()
        yield Candidate("won:champions-league", "honours", "player", f"Name a player who won the Champions League{span}",
                        {pid: facts.title_line("Champions League", s) for pid, s in first.items()})


def _club_scores(w: World, seasons: pd.Series) -> dict[str, float]:
    """How well known clubs are, for ranking them inside one team prompt: seasons spent in the category (every year
    in the Champions League beats an occasional visit), Champions League history (the clearest sign of a big club),
    and overall standing, equally weighted."""
    prestige = w.club_prestige.reindex(seasons.index).fillna(0)
    cl = (w.cl_apps.groupby("club_id")["season"].nunique() if not w.cl_apps.empty else pd.Series(dtype=float))
    cl = cl.reindex(seasons.index).fillna(0)
    return ((seasons.rank(pct=True) + cl.rank(pct=True) + prestige.rank(pct=True)) / 3 + prestige / 1e3).to_dict()


def club_family_prompts(w: World):
    """Teams: 'Name a team that played in La Liga'. Ranked against the other teams of the category (tiers.team_cap)."""
    for league_key, g in w.league_apps.groupby("league_key"):
        league = LEAGUES[league_key]
        seasons = g.groupby("club_id")["season"].nunique()
        yield Candidate(f"clubs:{league_key}", "clubs", "club", f"Name a team that played in {league.phrase}{TM_ERA}",
                        {cid: facts.seasons_line(n, league.name) for cid, n in seasons.items()}, league_key in TOP5,
                        scores=_club_scores(w, seasons))
    if not w.cl_apps.empty:
        seasons = w.cl_apps.groupby("club_id")["season"].nunique()
        yield Candidate("clubs:champions-league", "clubs", "club", f"Name a team that played in the Champions League{TM_ERA}",
                        {cid: facts.seasons_line(n, "Champions League") for cid, n in seasons.items()},
                        scores=_club_scores(w, seasons))
    clubs = w.euro_clubs["club_id"].drop_duplicates()
    euro_seasons = w.euro_clubs.drop_duplicates(["club_id", "season"]).groupby("club_id").size()
    league_name = lambda cid: LEAGUES[w.clubs["league_key"].get(cid)].name if w.clubs["league_key"].get(cid) in LEAGUES else None
    lines = {cid: facts.club_line(league_name(cid), w.clubs["country"].get(cid)) or "European competition since 2012"
             for cid in clubs}
    yield Candidate("clubs:europe", "clubs", "club", f"Name a team that played in a European competition{TM_ERA}", lines,
                    scores=_club_scores(w, euro_seasons))
    countries = clubs.map(w.clubs["country"])
    for country, ids in clubs.groupby(countries):
        yield Candidate(f"clubs:europe:{country}", "clubs", "club",
                        f"Name a team from {country} that played in Europe{TM_ERA}", {cid: lines[cid] for cid in ids},
                        False, scores=_club_scores(w, euro_seasons.reindex(ids).fillna(0)))


def manager_prompts(w: World):
    for league_key, g in w.manager_spells.groupby("league_key"):
        league = LEAGUES[league_key]
        agg = g.groupby("manager_id").agg(games=("games", "sum"), first=("season", "min"), last=("season", "max"))
        yield Candidate(f"managers:{league_key}", "managers", "manager", f"Name a manager in {league.phrase}{TM_ERA}",
                        {mid: facts.manager_line(r.games, league.name, r.first, r.last) for mid, r in agg.iterrows()},
                        league_key in TOP5)


def stadium_prompts(w: World):
    def lines(ids):
        return {sid: facts.stadium_line(w.stadiums["games"].get(sid, 0),
                                        _club_name(w, w.stadiums["home_club_id"].get(sid))) for sid in ids}

    cl = w.stadium_games[w.stadium_games["competition_id"].isin({"CL", "CLQ"})]["stadium_id"].unique()
    yield Candidate("stadiums:cl", "stadiums", "stadium", f"Name a stadium that has hosted a Champions League match{TM_ERA}",
                    lines(cl))
    tour = w.stadium_games.merge(w.editions[["competition_id", "season"]], on=["competition_id", "season"])
    if not tour.empty:
        yield Candidate("stadiums:tournaments", "stadiums", "stadium",
                        f"Name a stadium that has hosted a World Cup or Euros match (since {int(w.editions['label_year'].min())})",
                        lines(tour["stadium_id"].unique()))


def _team_editions(w: World) -> pd.DataFrame:
    return w.team_editions if w.team_editions is not None else w.nation_tournaments


def _nation_scores(w: World, ids, kind: str | None = None) -> dict[str, float]:
    """How well known national teams are, for ranking them inside one tournament prompt: half the share of the
    tournaments they played (World Cups or Euros, whichever they played more of), half their Wikipedia attention.
    Nation fame itself is built for ranking all 300+ nations and is shared with player fame, so it is left alone."""
    te = _team_editions(w)
    total = te.groupby("kind")["edition"].nunique()
    played = te.groupby(["nation_id", "kind"])["edition"].nunique().unstack(fill_value=0)
    kinds = [k for k in ([kind] if kind else list(total.index)) if k in played]
    ids = list(ids)
    share = pd.concat([played.reindex(ids).fillna(0)[k] / total[k] for k in kinds], axis=1).max(axis=1)
    links = (pd.to_numeric(w.nations["sitelinks"], errors="coerce") if "sitelinks" in w.nations else
             pd.Series(0.0, index=w.nations.index)).reindex(ids).fillna(0)
    return (0.5 * share.rank(pct=True) + 0.5 * links.rank(pct=True) + links / 1e6).to_dict()


def nation_prompts(w: World):
    """Teams: 'Name a team that played at the 2014 World Cup', one prompt per tournament and one over all of them."""
    te = _team_editions(w)
    for kind, label in (("World Cup", "a World Cup"), ("Euro", "the Euros")):
        g = te[te["kind"] == kind]
        if g.empty:
            continue
        total, first = g["edition"].nunique(), int(g["label_year"].min())
        counts = g.groupby("nation_id")["edition"].nunique()
        line = lambda n, kind=kind, total=total, first=first: facts.team_tournament_line(n, total, kind, first)
        yield Candidate(f"nations:{kind}", "nations", "nation",
                        f"Name a team that played at {label}{facts.span(first, g['label_year'].max())}",
                        {nid: line(n) for nid, n in counts.items()}, scores=_nation_scores(w, counts.index))
        for edition, ge in g.groupby("edition"):
            at = edition if edition.startswith("Euro") else f"the {edition}"       # 'at Euro 2024', 'at the 2014 World Cup'
            ids = ge["nation_id"].unique()
            yield Candidate(f"nations:{edition}", "nations", "nation", f"Name a team that played at {at}",
                            {nid: line(counts[nid]) for nid in ids}, scores=_nation_scores(w, ids))


FAMILIES = [club_prompts, club_position_prompts, two_club_prompts, nation_league_prompts, tournament_prompts,
            honours_prompts, club_family_prompts, manager_prompts, stadium_prompts, nation_prompts,
            league_prompts, champions_prompts, international_prompts, nation_position_prompts, league_position_prompts,
            league_scorer_prompts, club_cl_prompts]


def shadowed_clubs(clubs: pd.DataFrame) -> set[str]:
    """Clubs whose prompt name another club also folds to, unless they are the clear best known of the group.
    'Name a player who played for barcelona' from a mislabelled item would otherwise read as FC Barcelona."""
    names = clubs["name"].where(clubs["name"].map(lambda n: isinstance(n, str))).dropna().map(club_fold)
    links = pd.to_numeric(clubs["sitelinks"], errors="coerce").fillna(0) if "sitelinks" in clubs else \
        pd.Series(0.0, index=clubs.index)
    out = set()
    for _, ids in names.groupby(names).groups.items():
        if len(ids) > 1:
            top = links[ids].max()
            leaders = [i for i in ids if links[i] == top]
            out |= {i for i in ids if len(leaders) > 1 or i != leaders[0]}
    return out


def generate(w: World) -> list[Candidate]:
    hidden = shadowed_clubs(w.clubs)
    if hidden:
        w = dataclasses.replace(w, clubs=w.clubs.assign(name=w.clubs["name"].where(~w.clubs.index.isin(hidden))))
    out = [c for family in FAMILIES for c in family(w) if c.facts]
    for c in out:
        c.category = c.category or category_of(w, c)
    return out
