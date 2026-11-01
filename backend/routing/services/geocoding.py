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
    united = _photon_optional(base, query, {"bbox": "-125,24,-66,49.5"})
    world = _photon_optional(base, query, {})
    if united is None and world is None:
        raise AppError(
            "Place search is unavailable. Try again in a moment.",
            code="GEOCODE_UNAVAILABLE",
            status_code=502,
        )
    return _merge_places(united or [], world or [])[:6]


def _photon_optional(base: str, query: str, extra: dict) -> list[Place] | None:
    try:
        return _photon_hits(base, query, extra)
    except AppError as exc:
        logger.warning("Photon search failed: %s", exc)
        return None


def _photon_hits(base: str, query: str, extra: dict) -> list[Place]:
    payload = get_json(f"{base}/api/", {"q": query, "limit": 8, "lang": "en", **extra})
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


def _merge_places(preferred: list[Place], rest: list[Place]) -> list[Place]:
    merged: list[Place] = []
    seen: set[str] = set()
    for place in [*preferred, *rest]:
        key = place.label.casefold()
        if key in seen:
            continue
        seen.add(key)
        merged.append(place)
    return merged


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
