"""Points that paint the weather along the trip corridor.

Samples follow each route, with a pair of points offset about four miles to
either side so the band has width. The forecast slider recolours these points;
it does not move the truck.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime

from routing.domain import RawRoute
from routing.services.geo import MILE_M, destination
from routing.services.sampling import local_bearing, sample_route

CORRIDOR_CAP = 420
LATERAL_MILES = 4.0


def corridor_points(routes: list[RawRoute]) -> list[tuple[float, float]]:
    raw: list[tuple[float, float]] = []
    for route in routes:
        total_miles = route.distance_m / MILE_M
        spacing = min(12.0, max(3.0, total_miles / 12.0 if total_miles else 3.0))
        samples = sample_route(
            route.coordinates,
            route.segment_distance_m,
            route.segment_duration_s,
            interval_miles=spacing,
            departure=datetime.now(UTC),
        )
        for sample in samples:
            raw.append((sample.lat, sample.lon))
            fraction = 0.0 if total_miles <= 0 else min(sample.mile / total_miles, 1.0)
            heading = local_bearing(route.coordinates, route.segment_distance_m, fraction)
            for side in (90.0, -90.0):
                lon, lat = destination(
                    sample.lon,
                    sample.lat,
                    (heading + side) % 360.0,
                    LATERAL_MILES * MILE_M,
                )
                raw.append((lat, lon))
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
