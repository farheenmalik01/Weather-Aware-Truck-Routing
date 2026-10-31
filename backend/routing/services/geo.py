"""Geodesic helpers. Distances are meters; bearings are degrees clockwise from north."""

from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_000.0
MILE_M = 1_609.344


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lambda = math.radians(lon2 - lon1)
    y = math.sin(d_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lambda)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def destination(lon: float, lat: float, bearing: float, distance_m: float) -> tuple[float, float]:
    """Return (lon, lat) reached by traveling `distance_m` on `bearing`."""
    delta = distance_m / EARTH_RADIUS_M
    theta = math.radians(bearing)
    phi1 = math.radians(lat)
    lambda1 = math.radians(lon)
    phi2 = math.asin(math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta))
    lambda2 = lambda1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1),
        math.cos(delta) - math.sin(phi1) * math.sin(phi2),
    )
    lon2 = (math.degrees(lambda2) + 540.0) % 360.0 - 180.0
    return lon2, math.degrees(phi2)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def weather_cell(lat: float, lon: float) -> tuple[float, float]:
    """Snap to a 0.01° cell (~1.1 km). Nearby samples share one forecast."""
    return round(lat, 2), round(lon, 2)


def douglas_peucker(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Simplify a lon/lat polyline. Tolerance is in degrees."""
    if len(points) < 3:
        return list(points)
    keep = _peucker_keep(points, 0, len(points) - 1, tolerance * tolerance)
    return [points[index] for index in sorted(keep)]


def _peucker_keep(points: list[tuple[float, float]], start: int, end: int, tol2: float) -> set[int]:
    keep = {start, end}
    stack = [(start, end)]
    while stack:
        left, right = stack.pop()
        origin = points[left]
        dest = points[right]
        farthest = -1
        farthest_dist = 0.0
        for index in range(left + 1, right):
            dist = _segment_distance2(points[index], origin, dest)
            if dist > farthest_dist:
                farthest_dist = dist
                farthest = index
        if farthest >= 0 and farthest_dist > tol2:
            keep.add(farthest)
            stack.append((left, farthest))
            stack.append((farthest, right))
    return keep


def _segment_distance2(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    if dx == 0 and dy == 0:
        return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2
    t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)
    t = min(1.0, max(0.0, t))
    proj_x = start[0] + t * dx
    proj_y = start[1] + t * dy
    return (point[0] - proj_x) ** 2 + (point[1] - proj_y) ** 2


def simplify_for_display(points: list[tuple[float, float]], max_points: int = 800) -> list[list[float]]:
    """Return a GeoJSON-ready [lon, lat] line that stays visually faithful."""
    if len(points) <= max_points:
        return [[lon, lat] for lon, lat in points]
    tolerance = 0.00005
    simplified = points
    while len(simplified) > max_points and tolerance < 0.05:
        tolerance *= 2
        simplified = douglas_peucker(points, tolerance)
    return [[lon, lat] for lon, lat in simplified]
