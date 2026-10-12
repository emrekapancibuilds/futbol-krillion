"""Run SPARQL against the Wikidata Query Service and flatten the JSON results."""
import json
from collections.abc import Iterator

WDQS = "https://query.wikidata.org/sparql"
ENTITY_PREFIX = "http://www.wikidata.org/entity/"


def qid(value: str) -> str:
    return value.removeprefix(ENTITY_PREFIX)


def flatten(payload: dict) -> list[dict[str, str]]:
    return [{k: qid(v["value"]) if v["type"] == "uri" else v["value"] for k, v in b.items()}
            for b in payload["results"]["bindings"]]


def run(http, query: str) -> list[dict[str, str]]:
    raw = http.post_form(WDQS, {"query": query},
                         headers={"Accept": "application/sparql-results+json"},
                         cache_key="wdqs:" + query)
    return flatten(json.loads(raw))


def batched(items: list[str], size: int) -> Iterator[list[str]]:
    for i in range(0, len(items), size):
        yield items[i:i + size]
