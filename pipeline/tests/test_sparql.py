import json

from jobless import sparql
from jobless import wd_queries as q


def test_flatten_strips_entity_prefix_and_keeps_literals():
    payload = {"results": {"bindings": [
        {"p": {"type": "uri", "value": "http://www.wikidata.org/entity/Q1"},
         "name": {"type": "literal", "value": "Thierry Henry"},
         "article": {"type": "uri", "value": "https://en.wikipedia.org/wiki/Thierry_Henry"}},
        {"p": {"type": "uri", "value": "http://www.wikidata.org/entity/Q2"}}]}}
    assert sparql.flatten(payload) == [
        {"p": "Q1", "name": "Thierry Henry", "article": "https://en.wikipedia.org/wiki/Thierry_Henry"},
        {"p": "Q2"}]


def test_batched():
    assert list(sparql.batched(["a", "b", "c"], 2)) == [["a", "b"], ["c"]]


def test_run_posts_the_query_with_a_cache_key():
    seen = {}

    class FakeHttp:
        def post_form(self, url, form, headers=None, cache_key=None):
            seen.update(url=url, form=form, headers=headers, cache_key=cache_key)
            return json.dumps({"results": {"bindings": []}}).encode()

    assert sparql.run(FakeHttp(), "SELECT 1") == []
    assert seen["url"] == sparql.WDQS
    assert seen["form"] == {"query": "SELECT 1"}
    assert seen["headers"]["Accept"] == "application/sparql-results+json"
    assert seen["cache_key"] == "wdqs:SELECT 1"


def test_values_quotes_literals_and_prefixes_items():
    assert 'VALUES ?tm { "10" "26" }' in q.players_by_tm_id(["10", "26"])
    assert "VALUES ?p { wd:Q1 wd:Q2 }" in q.player_details(["Q1", "Q2"])


def test_every_query_starts_with_its_marker():
    for builder in q.ALL:
        assert builder(["Q1"]).startswith(f"#jobless:{builder.__name__}\n")


def test_details_query_flags_footballers():
    assert "AS ?footballer" in q.player_details(["Q1"]) and "wdt:P106 wd:Q937857" in q.player_details(["Q1"])


def test_stints_query_reads_apps_and_goals_qualifiers():
    text = q.player_stints(["Q1"])
    assert "pq:P1350 ?apps" in text and "pq:P1351 ?goals" in text
