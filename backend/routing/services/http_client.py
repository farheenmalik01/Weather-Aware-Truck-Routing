"""Shared HTTP client, retries, and a small in-process cache.

Public routing and forecast servers throttle bursts. Repeat analyses of the
same corridor (a load or interval change) should not hit them again.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import httpx

from routing.exceptions import AppError

logger = logging.getLogger(__name__)

USER_AGENT = "WeatherAwareTruckRouting/1.0 (dispatch planning study)"

client = httpx.Client(
    timeout=httpx.Timeout(25.0, connect=5.0),
    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    follow_redirects=True,
)


class TTLCache:
    def __init__(self, ttl_seconds: float, max_items: int = 400):
        self.ttl_seconds = ttl_seconds
        self.max_items = max_items
        self._items: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: Any) -> Any | None:
        now = time.monotonic()
        with self._lock:
            found = self._items.get(key)
            if found is None:
                return None
            expires, value = found
            if expires < now:
                self._items.pop(key, None)
                return None
            return value

    def set(self, key: Any, value: Any) -> None:
        expires = time.monotonic() + self.ttl_seconds
        with self._lock:
            if key not in self._items and len(self._items) >= self.max_items:
                oldest = min(self._items, key=lambda item: self._items[item][0])
                self._items.pop(oldest, None)
            self._items[key] = (expires, value)


def get_json(url: str, params: dict | None = None) -> Any:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = client.get(url, params=params)
        except httpx.HTTPError as exc:
            last_error = exc
            logger.warning("GET %s failed (%s) attempt %s", url, exc, attempt + 1)
            time.sleep(0.35 * (attempt + 1))
            continue
        if response.status_code in {429, 500, 502, 503, 504}:
            last_error = AppError(
                f"Upstream returned {response.status_code}.",
                code="UPSTREAM_UNAVAILABLE",
                status_code=502,
            )
            logger.warning("GET %s status %s attempt %s", url, response.status_code, attempt + 1)
            time.sleep(0.35 * (attempt + 1))
            continue
        try:
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AppError(
                "A routing or weather service rejected the request.",
                code="UPSTREAM_UNAVAILABLE",
                status_code=502,
            ) from exc
        return response.json()
    raise AppError(
        "A routing or weather service is unavailable. Try again in a moment.",
        code="UPSTREAM_UNAVAILABLE",
        status_code=502,
    ) from last_error
