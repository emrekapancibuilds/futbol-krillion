import http.client
import urllib.error

import pytest

from jobless.http import Http


class FakeResp:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.data


def make_opener(script):
    calls = []

    def opener(req, timeout):
        calls.append(req)
        item = script.pop(0)
        if isinstance(item, Exception):
            raise item
        return FakeResp(item)

    return opener, calls


def http_error(code, retry_after=None):
    headers = {"Retry-After": retry_after} if retry_after else {}
    return urllib.error.HTTPError("http://x", code, "err", headers, None)


def test_retries_throttling_and_honours_retry_after(tmp_path):
    opener, calls = make_opener([http_error(429, "3"), http_error(503), b"ok"])
    sleeps, logs = [], []
    assert Http(tmp_path, opener=opener, sleep=sleeps.append, log=logs.append).get("http://x") == b"ok"
    assert len(calls) == 3
    assert sleeps == [3.0, 2.0]
    assert logs[0] == "HTTP 429 from http://x; retry 1/9 in 3s"


def test_huge_retry_after_is_capped_so_a_run_never_stalls_silently(tmp_path):
    opener, _ = make_opener([http_error(429, "99999"), b"ok"])
    sleeps = []
    Http(tmp_path, opener=opener, sleep=sleeps.append, log=lambda m: None).get("http://x")
    assert sleeps == [1800.0]


def test_min_interval_paces_consecutive_requests(tmp_path):
    opener, _ = make_opener([b"a", b"b"])
    now = [100.0]
    sleeps = []
    h = Http(tmp_path, opener=opener, sleep=sleeps.append, clock=lambda: now[0], min_interval=1.0)
    h.get("http://x")
    now[0] += 0.25
    h.get("http://y")
    assert sleeps == [0.75]


def test_rest_factor_pauses_in_proportion_to_the_last_request(tmp_path):
    now = [0.0]

    def slow_opener(req, timeout):
        now[0] += 10.0          # the request itself takes 10 s
        return FakeResp(b"ok")

    sleeps = []
    h = Http(tmp_path, opener=slow_opener, sleep=sleeps.append, clock=lambda: now[0], min_interval=1.0, rest_factor=1.0)
    h.get("http://x")
    h.get("http://y")
    assert sleeps == [10.0]


def test_network_outage_backs_off_for_minutes_before_giving_up(tmp_path):
    outage = urllib.error.URLError("nodename nor servname provided, or not known")
    opener, calls = make_opener([outage] * 9 + [b"ok"])
    sleeps = []
    assert Http(tmp_path, opener=opener, sleep=sleeps.append, log=lambda m: None).get("http://x") == b"ok"
    assert sleeps == [1, 2, 4, 8, 16, 32, 64, 128, 256]   # ~8.5 minutes of patience by default


def test_dropped_connection_mid_response_is_retried(tmp_path):
    opener, calls = make_opener([http.client.IncompleteRead(b""), ConnectionResetError(), b"ok"])
    assert Http(tmp_path, opener=opener, sleep=lambda s: None, log=lambda m: None).get("http://x") == b"ok"
    assert len(calls) == 3


def test_non_retryable_error_raises_immediately(tmp_path):
    opener, calls = make_opener([http_error(404)])
    with pytest.raises(urllib.error.HTTPError):
        Http(tmp_path, opener=opener, sleep=lambda s: None).get("http://x")
    assert len(calls) == 1


def test_gives_up_after_max_tries(tmp_path):
    opener, calls = make_opener([http_error(429)] * 3)
    with pytest.raises(urllib.error.HTTPError):
        Http(tmp_path, opener=opener, sleep=lambda s: None, max_tries=3, log=lambda m: None).get("http://x")
    assert len(calls) == 3


def test_cache_hit_skips_network(tmp_path):
    opener, calls = make_opener([b"first"])
    h = Http(tmp_path, opener=opener, sleep=lambda s: None)
    assert h.get("http://x", cache_key="k") == b"first"
    assert h.get("http://x", cache_key="k") == b"first"
    assert len(calls) == 1


def test_post_form_sends_body_and_user_agent(tmp_path):
    opener, calls = make_opener([b"ok"])
    Http(tmp_path, opener=opener, sleep=lambda s: None).post_form("http://x", {"query": "SELECT 1"})
    assert calls[0].data == b"query=SELECT+1"
    assert calls[0].get_header("User-agent").startswith("JoblessSoccerGame")
