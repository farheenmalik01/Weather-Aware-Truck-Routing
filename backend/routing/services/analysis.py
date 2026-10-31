"""Build scored route options and the 0–48 hour corridor forecast.

Checkpoints use the truck's ETA. The heatmap uses clock time from departure,
so the slider answers "what is the corridor doing at this hour?" while the
table answers "what will the truck meet when it gets there?"
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Callable

from routing.domain import Analysis, HeatPoint, Place, RawRoute, RouteOption
from routing.exceptions import AppError
from routing.services.corridor import corridor_points
from routing.services.geo import MILE_M, simplify_for_display, weather_cell
from routing.services.metrics import metrics_for
from routing.services.recommendation import RANKING_CRITERIA, rank_routes
from routing.services.router import get_three_routes
from routing.services.sampling import sample_route
from routing.services.scoring import FORECAST_HOURS, risks_by_hour, score_checkpoint
from routing.services.weather import HourlySeries, Observation, fetch_forecast

logger = logging.getLogger(__name__)

_NAMES = ("Fastest", "Alternate A", "Alternate B")
_COLORS = ("#1d4e89", "#c2410c", "#0f766e")

RouteProvider = Callable[[Place, Place], list[RawRoute]]
WeatherProvider = Callable[..., dict[tuple[float, float], HourlySeries]]


def analyze(
    *,
    origin: Place,
    destination: Place,
    departure: datetime,
    load_lb: float,
    sample_interval_miles: int,
    now: datetime | None = None,
    route_provider: RouteProvider | None = None,
    weather_provider: WeatherProvider | None = None,
) -> Analysis:
    started = time.perf_counter()
    clock = now or datetime.now(UTC)
    _validate_departure(departure, clock)

    raw_routes = (route_provider or get_three_routes)(origin, destination)[:3]
    if not raw_routes:
        raise AppError(
            "No drivable route was found between those points.",
            code="NO_ROUTE",
            status_code=404,
        )

    labeled = _label(raw_routes)
    sampled = [
        (raw, route_id, name, color, _samples(raw, sample_interval_miles, departure))
        for raw, route_id, name, color in labeled
    ]
    corridor = corridor_points([raw for raw, *_rest in labeled])
    cells = _cells(sampled, corridor)
    series_by_cell = (weather_provider or fetch_forecast)(
        cells,
        now=clock,
        start=departure,
        end=departure + timedelta(hours=48),
    )

    options: list[RouteOption] = []
    clamped = False
    for raw, route_id, name, color, samples in sampled:
        checkpoints = []
        for sample in samples:
            observation = _observation(series_by_cell, sample.lat, sample.lon, sample.eta)
            clamped = clamped or observation.clamped
            checkpoints.append(score_checkpoint(sample, observation, load_lb))
        distance_miles = raw.distance_m / MILE_M
        options.append(
            RouteOption(
                id=route_id,
                name=name,
                summary=raw.summary,
                color=color,
                distance_miles=distance_miles,
                duration_seconds=raw.duration_s,
                geometry=simplify_for_display(raw.coordinates),
                checkpoints=checkpoints,
                metrics=metrics_for(checkpoints, distance_miles),
            )
        )

    ranked, reason = rank_routes(options)
    heatmap = [
        HeatPoint(
            lat=lat,
            lon=lon,
            risks=risks_by_hour(_series(series_by_cell, lat, lon), departure, load_lb),
        )
        for lat, lon in corridor
    ]
    result = Analysis(
        origin=origin,
        destination=destination,
        departure=departure,
        load_lb=load_lb,
        sample_interval_miles=sample_interval_miles,
        hour_count=FORECAST_HOURS,
        routes=ranked,
        heatmap=heatmap,
        recommendation_reason=reason,
        ranking_criteria=list(RANKING_CRITERIA),
        warnings=_warnings(ranked, clamped),
    )
    logger.info(
        "Analyzed %s -> %s interval=%smi routes=%s cells=%s heatmap=%s in %.2fs",
        origin.label,
        destination.label,
        sample_interval_miles,
        len(ranked),
        len(cells),
        len(heatmap),
        time.perf_counter() - started,
    )
    return result


def _validate_departure(departure: datetime, now: datetime) -> None:
    if departure.tzinfo is None:
        raise AppError("Departure must include a time zone.", code="VALIDATION_ERROR")
    earliest = now - timedelta(hours=6)
    latest = now + timedelta(days=14)
    if departure < earliest or departure > latest:
        raise AppError(
            "Choose a departure from the past few hours through the next 14 days so the forecast covers the trip.",
            code="VALIDATION_ERROR",
        )


def _label(routes: list[RawRoute]) -> list[tuple[RawRoute, str, str, str]]:
    order = sorted(range(len(routes)), key=lambda index: (routes[index].duration_s, routes[index].distance_m))
    labeled = []
    for position, index in enumerate(order):
        labeled.append((routes[index], f"route-{position + 1}", _NAMES[position], _COLORS[position]))
    return labeled


def _samples(route: RawRoute, interval_miles: int, departure: datetime):
    return sample_route(
        route.coordinates,
        route.segment_distance_m,
        route.segment_duration_s,
        interval_miles=float(interval_miles),
        departure=departure,
    )


def _cells(sampled, corridor: list[tuple[float, float]]) -> list[tuple[float, float]]:
    seen: dict[tuple[float, float], tuple[float, float]] = {}
    for _raw, _route_id, _name, _color, samples in sampled:
        for sample in samples:
            cell = weather_cell(sample.lat, sample.lon)
            seen[cell] = cell
    for lat, lon in corridor:
        cell = weather_cell(lat, lon)
        seen[cell] = cell
    return list(seen)


def _series(series_by_cell: dict[tuple[float, float], HourlySeries], lat: float, lon: float) -> HourlySeries | None:
    return series_by_cell.get(weather_cell(lat, lon))


def _observation(series_by_cell, lat: float, lon: float, moment: datetime) -> Observation:
    series = _series(series_by_cell, lat, lon)
    if series is None:
        return Observation.missing()
    return series.at(moment)


def _warnings(routes: list[RouteOption], clamped: bool) -> list[str]:
    warnings: list[str] = []
    blocked = [route for route in routes if route.blocked]
    if blocked and len(blocked) < len(routes):
        warnings.append("Routes that cross no-travel weather are ranked below routes that stay clear.")
    if any(route.metrics.unknown_miles > 1 for route in routes):
        warnings.append("Some checkpoints had no weather observation and were left out of the average risk.")
    if clamped:
        warnings.append("Part of this departure is outside the hourly forecast, so the nearest hour was used.")
    return warnings
