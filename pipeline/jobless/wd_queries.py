"""SPARQL text for every Wikidata query the pipeline runs. Pure functions, no I/O.

Each query starts with a '#jobless:<name>' comment so logs and test fakes can tell them apart.
"""
from jobless.config import WD_CLUB_CLASS, WD_FOOTBALLER


def _values(var: str, ids: list[str], literal: bool = False) -> str:
    items = " ".join(f'"{i}"' if literal else f"wd:{i}" for i in ids)
    return f"VALUES ?{var} {{ {items} }}"


def players_by_tm_id(tm_ids: list[str]) -> str:
    return f"#jobless:players_by_tm_id\nSELECT ?tm ?p WHERE {{ {_values('tm', tm_ids, True)} ?p wdt:P2446 ?tm . }}"


def clubs_by_tm_id(tm_ids: list[str]) -> str:
    return f"#jobless:clubs_by_tm_id\nSELECT ?tm ?club WHERE {{ {_values('tm', tm_ids, True)} ?club wdt:P7223 ?tm . }}"


def clubs_in_leagues(league_qids: list[str]) -> str:
    return (f"#jobless:clubs_in_leagues\nSELECT DISTINCT ?club ?league WHERE {{ {_values('league', league_qids)} "
            f"?club wdt:P118 ?league ; wdt:P31/wdt:P279* wd:{WD_CLUB_CLASS} . }}")


def players_of_clubs(club_qids: list[str]) -> str:
    # No occupation filter here: it made the query 5x slower. player_details flags footballers instead.
    return f"#jobless:players_of_clubs\nSELECT DISTINCT ?p WHERE {{ {_values('club', club_qids)} ?p wdt:P54 ?club . }}"


def player_details(qids: list[str]) -> str:
    return f"""#jobless:player_details
SELECT ?p (SAMPLE(?label) AS ?name) (SAMPLE(?dob) AS ?dob) (SAMPLE(?links) AS ?sitelinks)
       (SAMPLE(?article) AS ?article) (SAMPLE(?tm) AS ?tm_id)
       (GROUP_CONCAT(DISTINCT ?posLabel; separator="|") AS ?positions) (SAMPLE(?isPlayer) AS ?footballer)
WHERE {{
  {_values('p', qids)}
  OPTIONAL {{ ?p rdfs:label ?label . FILTER(LANG(?label) = "en") }}
  OPTIONAL {{ ?p wdt:P569 ?dob }}
  OPTIONAL {{ ?p wikibase:sitelinks ?links }}
  OPTIONAL {{ ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }}
  OPTIONAL {{ ?p wdt:P2446 ?tm }}
  OPTIONAL {{ ?p wdt:P413 ?pos . ?pos rdfs:label ?posLabel . FILTER(LANG(?posLabel) = "en") }}
  BIND(EXISTS {{ ?p wdt:P106 wd:{WD_FOOTBALLER} }} AS ?isPlayer)
}} GROUP BY ?p"""


def female_players() -> str:
    """Every woman footballer (~50 s, one query; batching over our 175k players took hours). The game is men's
    football only (spec §12), but Wikidata often links women players to the parent club item, so they turn up
    in men's club rosters."""
    return f"#jobless:female_players\nSELECT ?p WHERE {{ ?p wdt:P106 wd:{WD_FOOTBALLER} ; wdt:P21 wd:Q6581072 . }}"


def player_aliases(qids: list[str]) -> str:
    return (f"#jobless:player_aliases\nSELECT ?p ?alias WHERE {{ {_values('p', qids)} "
            f'?p skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }}')


def player_stints(qids: list[str]) -> str:
    return f"""#jobless:player_stints
SELECT ?p ?st ?team ?start ?end ?apps ?goals WHERE {{
  {_values('p', qids)}
  ?p p:P54 ?st . ?st ps:P54 ?team .
  OPTIONAL {{ ?st pq:P580 ?start }} OPTIONAL {{ ?st pq:P582 ?end }}
  OPTIONAL {{ ?st pq:P1350 ?apps }} OPTIONAL {{ ?st pq:P1351 ?goals }}
}}"""


def player_awards(qids: list[str]) -> str:
    return f"#jobless:player_awards\nSELECT ?p ?award WHERE {{ {_values('p', qids)} ?p wdt:P166 ?award . }}"


def team_details(qids: list[str]) -> str:
    return f"""#jobless:team_details
SELECT ?team (SAMPLE(?label) AS ?name) (SAMPLE(?links) AS ?sitelinks) (SAMPLE(?article) AS ?article)
       (GROUP_CONCAT(DISTINCT STRAFTER(STR(?league), "entity/"); separator="|") AS ?leagues)
       (SAMPLE(?countryLabel) AS ?country) (SAMPLE(?venueLabel) AS ?venue) (SAMPLE(?tmc) AS ?tm_club)
       (GROUP_CONCAT(DISTINCT STRAFTER(STR(?cls), "entity/"); separator="|") AS ?classes)
WHERE {{
  {_values('team', qids)}
  OPTIONAL {{ ?team rdfs:label ?label . FILTER(LANG(?label) = "en") }}
  OPTIONAL {{ ?team wikibase:sitelinks ?links }}
  OPTIONAL {{ ?article schema:about ?team ; schema:isPartOf <https://en.wikipedia.org/> }}
  OPTIONAL {{ ?team wdt:P118 ?league }}
  OPTIONAL {{ ?team wdt:P17 ?c . ?c rdfs:label ?countryLabel . FILTER(LANG(?countryLabel) = "en") }}
  OPTIONAL {{ ?team wdt:P115 ?v . ?v rdfs:label ?venueLabel . FILTER(LANG(?venueLabel) = "en") }}
  OPTIONAL {{ ?team wdt:P7223 ?tmc }}
  OPTIONAL {{ ?team wdt:P31 ?cls }}
}} GROUP BY ?team"""


def subclasses(roots: list[str]) -> str:
    """Every class under the given roots. Matching a team's direct P31 against this list in Python is much
    cheaper than a P279* walk per team inside team_details (that version got this machine rate-limited)."""
    return f"#jobless:subclasses\nSELECT DISTINCT ?cls WHERE {{ {_values('root', roots)} ?cls wdt:P279* ?root . }}"


def award_details(qids: list[str]) -> str:
    return f"""#jobless:award_details
SELECT ?award (SAMPLE(?label) AS ?name) (SAMPLE(?links) AS ?sitelinks) WHERE {{
  {_values('award', qids)}
  OPTIONAL {{ ?award rdfs:label ?label . FILTER(LANG(?label) = "en") }}
  OPTIONAL {{ ?award wikibase:sitelinks ?links }}
}} GROUP BY ?award"""


ALL = [players_by_tm_id, clubs_by_tm_id, clubs_in_leagues, players_of_clubs, player_details,
       player_aliases, player_stints, player_awards, team_details, award_details, subclasses]
