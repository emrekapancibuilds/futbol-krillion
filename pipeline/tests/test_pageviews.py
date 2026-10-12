import json

import pandas as pd

from jobless import pageviews


def test_title_from_article():
    assert pageviews.title_from_article("https://en.wikipedia.org/wiki/Mesut_%C3%96zil") == "Mesut Özil"


class FakeApi:
    def __init__(self, responses):
        self.responses = responses
        self.forms = []

    def post_form(self, url, form, headers=None, cache_key=None):
        self.forms.append(form)
        return json.dumps(self.responses.pop(0)).encode()


def test_fetch_batch_follows_continuation_and_maps_redirects():
    api = FakeApi([
        {"continue": {"pvipcontinue": "x", "continue": "||"}, "query": {
            "redirects": [{"from": "Thierry Henry (footballer)", "to": "Thierry Henry"}],
            "pages": [{"title": "Thierry Henry", "pageviews": {"2026-08-01": 100, "2026-08-02": None}},
                      {"title": "Hugh Glass"}]}},
        {"query": {"pages": [{"title": "Hugh Glass", "pageviews": {"2026-08-01": 3}}]}},
    ])
    got = pageviews.fetch_batch(api, ["Thierry Henry (footballer)", "Hugh Glass"])
    assert got == {"Thierry Henry (footballer)": 100, "Hugh Glass": 3}
    assert api.forms[1]["pvipcontinue"] == "x"


def test_views_for_distinguishes_no_views_from_not_fetched():
    pv = pd.DataFrame({"title": ["Thierry Henry", "Nobody"], "views60": [100, 0]})
    arts = pd.Series(["https://en.wikipedia.org/wiki/Thierry_Henry", "https://en.wikipedia.org/wiki/Nobody",
                      "https://en.wikipedia.org/wiki/Not_Fetched_Yet", None])
    out = pageviews.views_for(arts, pv)
    assert out.iloc[0] == 100 and out.iloc[1] == 0
    assert pd.isna(out.iloc[2]) and pd.isna(out.iloc[3])


def test_load_returns_an_empty_table_when_the_step_has_not_run(tmp_path):
    pv = pageviews.load(tmp_path)
    assert list(pv.columns) == ["title", "views60"] and pv.empty
