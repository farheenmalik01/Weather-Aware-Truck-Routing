"""Sample a driving path at a fixed mileage, with an ETA at each sample.

Travel time is not spread evenly. Segment durations from the router are scaled
so they sum to the route's official duration, then each checkpoint is
interpolated along that timeline. The last sample is the destination, so its
ETA is departure plus the stated travel time.
"""

from __future__ import annotations

import bisect
from datetime import datetime, timedelta

from routing.domain import SamplePoint
from routing.services.geo import MILE_M, bearing_deg, haversine_m, lerp


def align_segments(
    coordinates: list[tuple[float, float]],
    segment_distance_m: list[float],
    segment_duration_s: list[float],
    official_distance_m: float,
    official_duration_s: float,
) -> tuple[list[float], list[float]]:
    """Return per-vertex-gap distance and duration arrays aligned to `coordinates`."""
    gaps = max(len(coordinates) - 1, 0)
    distances = _fit(segment_distance_m, gaps, coordinates, official_distance_m)
    durations = _fit_duration(segment_duration_s, gaps, distances, official_duration_s)
    return distances, durations


def sample_route(
    coordinates: list[tuple[float, float]],
    segment_distance_m: list[float],
    segment_duration_s: list[float],
    *,
    interval_miles: float,
    departure: datetime,
) -> list[SamplePoint]:
    if len(coordinates) < 2:
        raise ValueError("A route needs at least two coordinates.")
    if interval_miles <= 0:
        raise ValueError("Sample interval must be positive.")

    cumulative_m = [0.0]
    cumulative_s = [0.0]
    for distance, duration in zip(segment_distance_m, segment_duration_s, strict=True):
        cumulative_m.append(cumulative_m[-1] + max(distance, 0.0))
        cumulative_s.append(cumulative_s[-1] + max(duration, 0.0))

    total_miles = cumulative_m[-1] / MILE_M
    targets = _target_miles(total_miles, interval_miles)
    samples: list[SamplePoint] = []
    for mile in targets:
        (lon, lat), elapsed = _at_distance(coordinates, cumulative_m, cumulative_s, mile * MILE_M)
        samples.append(
            SamplePoint(
                mile=mile,
                lat=lat,
                lon=lon,
                eta=departure + timedelta(seconds=elapsed),
            )
        )
    return samples


def point_at_fraction(
    coordinates: list[tuple[float, float]],
    segment_distance_m: list[float],
    fraction: float,
) -> tuple[float, float]:
    """Return (lon, lat) at a fraction of route length, plus the local travel bearing is separate."""
    total = sum(segment_distance_m)
    target = min(max(fraction, 0.0), 1.0) * total
    cumulative = [0.0]
    for distance in segment_distance_m:
        cumulative.append(cumulative[-1] + max(distance, 0.0))
    (lon, lat), _ = _at_distance(coordinates, cumulative, cumulative, target)
    return lon, lat


def local_bearing(
    coordinates: list[tuple[float, float]],
    segment_distance_m: list[float],
    fraction: float,
) -> float:
    total = sum(segment_distance_m) or 1.0
    target = min(max(fraction, 0.0), 1.0) * total
    cumulative = 0.0
    for index, distance in enumerate(segment_distance_m):
        next_cumulative = cumulative + distance
        if next_cumulative >= target or index == len(segment_distance_m) - 1:
            start = coordinates[index]
            end = coordinates[min(index + 1, len(coordinates) - 1)]
            return bearing_deg(start[0], start[1], end[0], end[1])
        cumulative = next_cumulative
    start = coordinates[0]
    end = coordinates[-1]
    return bearing_deg(start[0], start[1], end[0], end[1])


def _target_miles(total_miles: float, interval_miles: float) -> list[float]:
    if total_miles <= 0:
        return [0.0]
    targets = [0.0]
    mile = interval_miles
    # Skip a sample that would sit on top of the destination.
    while mile < total_miles - 0.05:
        targets.append(mile)
        mile += interval_miles
    targets.append(total_miles)
    return targets


def _at_distance(
    coordinates: list[tuple[float, float]],
    cumulative_m: list[float],
    cumulative_s: list[float],
    distance_m: float,
) -> tuple[tuple[float, float], float]:
    if distance_m <= 0:
        return coordinates[0], 0.0
    if distance_m >= cumulative_m[-1]:
        return coordinates[-1], cumulative_s[-1]
    index = bisect.bisect_right(cumulative_m, distance_m) - 1
    index = min(max(index, 0), len(coordinates) - 2)
    span = cumulative_m[index + 1] - cumulative_m[index]
    fraction = 0.0 if span <= 0 else (distance_m - cumulative_m[index]) / span
    lon = lerp(coordinates[index][0], coordinates[index + 1][0], fraction)
    lat = lerp(coordinates[index][1], coordinates[index + 1][1], fraction)
    elapsed = lerp(cumulative_s[index], cumulative_s[index + 1], fraction)
    return (lon, lat), elapsed


def _fit(
    provided: list[float],
    gaps: int,
    coordinates: list[tuple[float, float]],
    official_distance_m: float,
) -> list[float]:
    if gaps == 0:
        return []
    if len(provided) == gaps and sum(provided) > 0:
        distances = [max(value, 0.0) for value in provided]
    else:
        distances = [
            haversine_m(coordinates[i][0], coordinates[i][1], coordinates[i + 1][0], coordinates[i + 1][1])
            for i in range(gaps)
        ]
    return _scale(distances, official_distance_m)


def _fit_duration(
    provided: list[float],
    gaps: int,
    distances: list[float],
    official_duration_s: float,
) -> list[float]:
    if gaps == 0:
        return []
    if len(provided) == gaps and sum(provided) > 0:
        durations = [max(value, 0.0) for value in provided]
    else:
        durations = list(distances) or [1.0] * gaps
    return _scale(durations, official_duration_s)


def _scale(values: list[float], official: float) -> list[float]:
    total = sum(values)
    if total <= 0 or official <= 0:
        return values
    if abs(total - official) / official < 0.001:
        return values
    factor = official / total
    return [value * factor for value in values]
