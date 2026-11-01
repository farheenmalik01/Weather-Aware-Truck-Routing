"""Points that paint the weather along each driving route.

Samples stay on the road. The map draws a band around that line, so offset
points would only add forecast cells the slider never shows on their own.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from routing.domain import RawRoute
from routing.services.geo import MILE_M
from routing.services.sampling import sample_route

CORRIDOR_CAP = 240


def corridor_points(routes: list[RawRoute]) -> list[tuple[float, float]]:
    raw: list[tuple[float, float]] = []
    for route in routes:
        total_miles = route.distance_m / MILE_M
        spacing = min(10.0, max(4.0, total_miles / 18.0 if total_miles else 4.0))
        samples = sample_route(
            route.coordinates,
            route.segment_distance_m,
            route.segment_duration_s,
            interval_miles=spacing,
            departure=datetime.now(UTC),
        )
        raw.extend((sample.lat, sample.lon) for sample in samples)
    return _thin(raw, CORRIDOR_CAP)


def _thin(points: list[tuple[float, float]], cap: int) -> list[tuple[float, float]]:
    unique: list[tuple[float, float]] = []
    seen: set[tuple[float, float]] = set()
    for lat, lon in points:
        key = (round(lat, 3), round(lon, 3))
        if key in seen:
            continue
        seen.add(key)
        unique.append((lat, lon))
    if len(unique) <= cap:
        return unique
    stride = math.ceil(len(unique) / cap)
    return unique[::stride][:cap]
