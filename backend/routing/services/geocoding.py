"""Place search. Photon is the primary geocoder; Nominatim covers an outage."""

from __future__ import annotations

import logging
import os

from routing.domain import Place
from routing.exceptions import AppError
from routing.services.http_client import TTLCache, get_json

logger = logging.getLogger(__name__)

_cache = TTLCache(ttl_seconds=24 * 60 * 60, max_items=256)


def geocode(query: str) -> list[Place]:
    key = " ".join(query.strip().lower().split())
    cached = _cache.get(key)
    if cached is not None:
        return cached
    try:
        places = _photon(query)
    except AppError as exc:
        logger.warning("Photon geocoding failed: %s", exc)
        places = _nominatim(query)
    _cache.set(key, places)
    return places


def _photon(query: str) -> list[Place]:
    base = os.environ.get("PHOTON_BASE_URL", "https://photon.komoot.io").rstrip("/")
    payload = get_json(f"{base}/api/", {"q": query, "limit": 6, "lang": "en"})
    places: list[Place] = []
    for feature in payload.get("features") or []:
        coordinates = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coordinates) < 2:
            continue
        lon, lat = float(coordinates[0]), float(coordinates[1])
        label = _photon_label(feature.get("properties") or {})
        if label:
            places.append(Place(label=label, lat=lat, lon=lon))
    return places


def _nominatim(query: str) -> list[Place]:
    payload = get_json(
        "https://nominatim.openstreetmap.org/search",
        {"q": query, "format": "jsonv2", "limit": 6},
    )
    if not isinstance(payload, list):
        raise AppError(
            "Place search is unavailable. Try again in a moment.",
            code="GEOCODE_UNAVAILABLE",
            status_code=502,
        )
    places: list[Place] = []
    for item in payload:
        label = str(item.get("display_name") or "").strip()
        if not label:
            continue
        places.append(Place(label=label, lat=float(item["lat"]), lon=float(item["lon"])))
    return places


def _photon_label(properties: dict) -> str:
    parts: list[str] = []
    for key in ("name", "street", "city", "state", "country"):
        value = str(properties.get(key) or "").strip()
        if value and value not in parts:
            parts.append(value)
    return ", ".join(parts)
