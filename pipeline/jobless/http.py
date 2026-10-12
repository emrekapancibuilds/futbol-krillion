"""Polite HTTP client: identifies itself, paces requests, retries throttling, caches responses on disk."""
import hashlib
import http.client
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from jobless.config import USER_AGENT

RETRY_CODES = {429, 500, 502, 503, 504}
# Network failures worth retrying. IncompleteRead (an http.client.HTTPException) happens when WDQS drops a
# connection mid-response; it is not a URLError, so it needs listing explicitly.
RETRY_ERRORS = (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException)


def _log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


class Http:
    def __init__(self, cache_dir: Path | None, opener=urllib.request.urlopen, sleep=time.sleep,
                 clock=time.monotonic, max_tries: int = 10, max_wait: float = 1800.0, min_interval: float = 0.0,
                 rest_factor: float = 0.0, log=_log):
        self.cache_dir = cache_dir
        self.opener = opener
        self.sleep = sleep
        self.clock = clock
        self.max_tries = max_tries
        self.max_wait = max_wait          # never honour a Retry-After longer than this
        self.min_interval = min_interval  # minimum pause after a request before the next one starts
        self.rest_factor = rest_factor    # also pause rest_factor x the last request's duration (WDQS budgets query time)
        self.log = log
        self._last_end: float | None = None
        self._last_duration = 0.0

    def get(self, url: str, headers: dict | None = None, cache_key: str | None = None) -> bytes:
        return self._fetch(urllib.request.Request(url, headers=self._headers(headers)), cache_key)

    def post_form(self, url: str, form: dict, headers: dict | None = None,
                  cache_key: str | None = None) -> bytes:
        body = urllib.parse.urlencode(form).encode()
        h = self._headers(headers) | {"Content-Type": "application/x-www-form-urlencoded"}
        return self._fetch(urllib.request.Request(url, data=body, headers=h), cache_key)

    def _headers(self, extra: dict | None) -> dict:
        return {"User-Agent": USER_AGENT} | (extra or {})

    def _cache_path(self, key: str) -> Path:
        return self.cache_dir / (hashlib.sha1(key.encode()).hexdigest() + ".bin")

    def _pace(self) -> None:
        if self._last_end is None:
            return
        gap = max(self.min_interval, self.rest_factor * self._last_duration)
        wait = gap - (self.clock() - self._last_end)
        if wait > 0:
            self.sleep(wait)

    def _fetch(self, req: urllib.request.Request, cache_key: str | None) -> bytes:
        if cache_key and self.cache_dir:
            path = self._cache_path(cache_key)
            if path.exists():
                return path.read_bytes()
        delay = 1.0
        for attempt in range(1, self.max_tries + 1):
            self._pace()
            started = self.clock()
            try:
                with self.opener(req, timeout=120) as resp:
                    data = resp.read()
                break
            except urllib.error.HTTPError as e:
                if e.code not in RETRY_CODES or attempt == self.max_tries:
                    raise
                retry_after = e.headers.get("Retry-After") if e.headers else None
                wait = min(self.max_wait, float(retry_after) if retry_after and retry_after.isdigit() else delay)
                self.log(f"HTTP {e.code} from {req.full_url}; retry {attempt}/{self.max_tries - 1} in {wait:.0f}s")
                self.sleep(wait)
            except RETRY_ERRORS as e:
                if attempt == self.max_tries:
                    raise
                self.log(f"{type(e).__name__} from {req.full_url}; retry {attempt}/{self.max_tries - 1} in {min(delay, self.max_wait):.0f}s")
                self.sleep(min(delay, self.max_wait))
            finally:
                self._last_end = self.clock()
                self._last_duration = self._last_end - started
            delay *= 2
        if cache_key and self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self._cache_path(cache_key).write_bytes(data)
        return data
