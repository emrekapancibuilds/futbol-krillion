"""60-day English Wikipedia page views via the MediaWiki batch API (50 titles per request).

Wikipedia throttles this hard from a single machine (measured: ~8 requests/minute after a burst, so a full
run of ~70k titles can take many hours). The step is therefore optional and incremental: it saves what it
has every 5,000 titles, every response is cached (re-running resumes), and fame treats titles that were never
fetched as missing data rather than as zero views.
"""
import json
import urllib.parse

import pandas as pd

from jobless.config import CACHE, OUT
from jobless.http import Http

API = "https://en.wikipedia.org/w/api.php"


def title_from_article(url: str) -> str:
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ")


def fetch_batch(http, titles: list[str]) -> dict[str, int]:
    """Total views over the last 60 days for each requested title (follows redirects and continuation)."""
    form = {"action": "query", "prop": "pageviews", "titles": "|".join(titles), "pvipdays": "60",
            "format": "json", "formatversion": "2", "redirects": "1"}
    views: dict[str, int] = {}
    back: dict[str, str] = {}  # resolved title -> title we asked for
    cont: dict = {}
    while True:
        params = form | cont
        payload = json.loads(http.post_form(API, params, cache_key="pv:" + json.dumps(params, sort_keys=True)))
        query = payload.get("query", {})
        for m in query.get("normalized", []) + query.get("redirects", []):
            back[m["to"]] = back.get(m["from"], m["from"])
        for page in query.get("pages", []):
            if "pageviews" in page:
                views[back.get(page["title"], page["title"])] = sum(v or 0 for v in page["pageviews"].values())
        if "continue" not in payload:
            return views
        cont = payload["continue"]


def views_for(articles: pd.Series, pageviews: pd.DataFrame) -> pd.Series:
    """Map article URLs to 60-day views. NaN when there is no article or the title hasn't been fetched yet;
    0 when it was fetched and had no views."""
    by_title = pageviews.set_index("title")["views60"]
    titles = articles.map(lambda a: title_from_article(a) if isinstance(a, str) else None)
    return titles.map(by_title).astype("float64")


def load(out=OUT) -> pd.DataFrame:
    """The page-view table, or an empty one when the step hasn't run (fame then uses sitelinks alone)."""
    path = out / "pageviews.parquet"
    return pd.read_parquet(path) if path.exists() else pd.DataFrame({"title": pd.Series(dtype="str"),
                                                                     "views60": pd.Series(dtype="float64")})


def main(batch_size: int = 50) -> int:
    articles = pd.concat([pd.read_parquet(OUT / "wd_players.parquet")["article"],
                          pd.read_parquet(OUT / "wd_teams.parquet")["article"]]).dropna().unique()
    titles = sorted({title_from_article(a) for a in articles})
    http = Http(CACHE / "pageviews", min_interval=0.2)
    rows = []
    for i in range(0, len(titles), batch_size):
        chunk = titles[i:i + batch_size]
        got = fetch_batch(http, chunk)
        rows.extend({"title": t, "views60": got.get(t, 0)} for t in chunk)
        if (i + batch_size) % 5000 < batch_size:
            pd.DataFrame(rows).to_parquet(OUT / "pageviews.parquet", index=False)  # usable partial result
            print(f"{i + batch_size:,}/{len(titles):,} titles", flush=True)
    pd.DataFrame(rows).to_parquet(OUT / "pageviews.parquet", index=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
