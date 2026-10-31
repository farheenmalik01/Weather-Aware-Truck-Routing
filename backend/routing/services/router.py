"""Produce three distinct driving options.

OSRM alternatives are used first. When the road network returns fewer than
three, via-points offset to either side of the fastest path are routed as
real roads. Paths that stay within about two miles of one we already have
are dropped. A corridor with only one physical route returns that one route
rather than a fabricated line.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

from routing.domain import Place, RawRoute
from routing.exceptions import AppError
from routing.services.geo import MILE_M, destination, haversine_m, weather_cell
from routing.services.http_client import TTLCache
from routing.services.osrm import fetch_driving
from routing.services.sampling import local_bearing, point_at_fraction

logger = logging.getLogger(__name__)

_cache = TTLCache(ttl_seconds=10 * 60, max_items=128)
_OFFSETS = (
    (0.35, 10.0),
    (0.35, -10.0),
    (0.55, 18.0),
    (0.55, -18.0),
)


def get_three_routes(origin: Place, destination: Place) -> list[RawRoute]:
    key = (
        weather_cell(origin.lat, origin.lon),
        weather_cell(destination.lat, destination.lon),
    )
    cached = _cache.get(key)
    if cached is not None:
        return cached

    try:
        primary = fetch_driving(
            [(origin.lon, origin.lat), (destination.lon, destination.lat)],
            alternatives=3,
        )
    except AppError:
        raise
    unique = _dedupe(primary)
    if len(unique) < 3 and unique:
        unique = _fill_with_vias(origin, destination, unique)
    _cache.set(key, unique)
    logger.info("Routes %s -> %s: %s option(s)", origin.label, destination.label, len(unique))
    return unique


def _fill_with_vias(origin: Place, destination: Place, unique: list[RawRoute]) -> list[RawRoute]:
    vias = _via_points(unique[0])

    def load(via: tuple[float, float]) -> RawRoute | None:
        try:
            routes = fetch_driving(
                [(origin.lon, origin.lat), via, (destination.lon, destination.lat)],
                alternatives=False,
            )
        except AppError as exc:
            logger.info("Via route skipped: %s", exc)
            return None
        return routes[0] if routes else None

    with ThreadPoolExecutor(max_workers=len(vias)) as pool:
        extras = list(pool.map(load, vias))
    for extra in extras:
        if extra is None or any(_similar(extra, existing) for existing in unique):
            continue
        unique.append(extra)
        if len(unique) >= 3:
            break
    return unique


def _via_points(route: RawRoute) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for fraction, offset_miles in _OFFSETS:
        lon, lat = point_at_fraction(route.coordinates, route.segment_distance_m, fraction)
        heading = local_bearing(route.coordinates, route.segment_distance_m, fraction)
        side = 90.0 if offset_miles > 0 else -90.0
        points.append(destination(lon, lat, (heading + side) % 360.0, abs(offset_miles) * MILE_M))
    return points


def _dedupe(routes: list[RawRoute]) -> list[RawRoute]:
    unique: list[RawRoute] = []
    for route in routes:
        if any(_similar(route, existing) for existing in unique):
            continue
        unique.append(route)
        if len(unique) >= 3:
            break
    return unique


def _similar(left: RawRoute, right: RawRoute) -> bool:
    if left.distance_m <= 0 or right.distance_m <= 0:
        return False
    ratio = left.distance_m / right.distance_m
    if ratio < 0.82 or ratio > 1.22:
        return False
    deviations: list[float] = []
    for fraction in (0.2, 0.4, 0.6, 0.8):
        lon1, lat1 = point_at_fraction(left.coordinates, left.segment_distance_m, fraction)
        lon2, lat2 = point_at_fraction(right.coordinates, right.segment_distance_m, fraction)
        deviations.append(haversine_m(lon1, lat1, lon2, lat2))
    return (sum(deviations) / len(deviations)) < 2.0 * MILE_M
