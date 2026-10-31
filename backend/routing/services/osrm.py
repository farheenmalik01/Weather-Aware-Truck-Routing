"""Driving routes from an OSRM-compatible server.

The public OSRM demo is tried first. A second public server is used only when
the primary cannot be reached, so a demo still works if one host is down.
Set OSRM_BASE_URL to pin a single server and skip the fallback.
"""

from __future__ import annotations

import logging
import os

from routing.domain import RawRoute
from routing.exceptions import AppError
from routing.services.http_client import get_json
from routing.services.sampling import align_segments

logger = logging.getLogger(__name__)

_FALLBACKS = (
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de/routed-car",
)


def fetch_driving(
    coordinates: list[tuple[float, float]],
    *,
    alternatives: int | bool,
) -> list[RawRoute]:
    params = {
        "overview": "full",
        "geometries": "geojson",
        "steps": "true",
        "annotations": "distance,duration",
        "alternatives": "false" if alternatives is False else str(int(alternatives) if alternatives else 0),
    }
    path = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coordinates)
    last_error: Exception | None = None
    for base in _bases():
        url = f"{base}/route/v1/driving/{path}"
        try:
            payload = get_json(url, params)
        except AppError as exc:
            last_error = exc
            logger.warning("Routing host %s failed: %s", base, exc)
            continue
        code = payload.get("code")
        if code == "Ok":
            routes = [_parse_route(route) for route in payload.get("routes") or []]
            if routes:
                return routes
            last_error = AppError(
                "No drivable route was found between those points.",
                code="NO_ROUTE",
                status_code=404,
            )
            continue
        if code == "NoRoute":
            # The server answered; another host will not invent a road.
            raise AppError(
                "No drivable route was found between those points.",
                code="NO_ROUTE",
                status_code=404,
            )
        last_error = AppError(
            payload.get("message") or "The routing service could not build a route.",
            code="ROUTING_FAILED",
            status_code=502,
        )
    if isinstance(last_error, AppError):
        raise last_error
    raise AppError(
        "The routing service is unavailable. Try again in a moment.",
        code="ROUTING_FAILED",
        status_code=502,
    )


def _bases() -> list[str]:
    configured = os.environ.get("OSRM_BASE_URL", "").strip()
    if configured:
        return [configured.rstrip("/")]
    return list(_FALLBACKS)


def _parse_route(route: dict) -> RawRoute:
    geometry = (route.get("geometry") or {}).get("coordinates") or []
    coordinates = [(float(lon), float(lat)) for lon, lat in geometry]
    if len(coordinates) < 2:
        raise AppError(
            "The routing service returned an empty path.",
            code="ROUTING_FAILED",
            status_code=502,
        )
    distances: list[float] = []
    durations: list[float] = []
    legs = route.get("legs") or []
    for leg in legs:
        annotation = leg.get("annotation") or {}
        distances.extend(float(value) for value in annotation.get("distance") or [])
        durations.extend(float(value) for value in annotation.get("duration") or [])
    distances, durations = align_segments(
        coordinates,
        distances,
        durations,
        float(route.get("distance") or 0.0),
        float(route.get("duration") or 0.0),
    )
    return RawRoute(
        distance_m=float(route.get("distance") or 0.0),
        duration_s=float(route.get("duration") or 0.0),
        coordinates=coordinates,
        segment_distance_m=distances,
        segment_duration_s=durations,
        summary=_road_summary(legs),
    )


def _road_summary(legs: list[dict]) -> str:
    totals: dict[str, float] = {}
    for leg in legs:
        for step in leg.get("steps") or []:
            name = str(step.get("name") or "").strip()
            if not name or name == "-":
                continue
            totals[name] = totals.get(name, 0.0) + float(step.get("distance") or 0.0)
        if not totals:
            summary = str(leg.get("summary") or "").strip()
            if summary:
                totals[summary] = totals.get(summary, 0.0) + float(leg.get("distance") or 0.0)
    if not totals:
        return "Highway route"
    ranked = sorted(totals, key=lambda name: totals[name], reverse=True)
    return " · ".join(ranked[:3])
