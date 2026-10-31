"""Domain types for a scored truck route.

Risk values are ordered so a higher number is always worse:
1 low, 2 moderate, 3 high, 4 severe, 5 no travel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import IntEnum


class RiskLevel(IntEnum):
    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5

    @property
    def label(self) -> str:
        return self.name.lower()


@dataclass(frozen=True)
class Place:
    label: str
    lat: float
    lon: float

    def to_dict(self) -> dict:
        return {"label": self.label, "lat": self.lat, "lon": self.lon}


@dataclass(frozen=True)
class SamplePoint:
    """A point on the driven path, before weather is attached."""

    mile: float
    lat: float
    lon: float
    eta: datetime


@dataclass
class Checkpoint:
    mile: float
    lat: float
    lon: float
    eta: datetime
    wind_mph: float | None
    wind_gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    temperature_f: float | None
    conditions: str | None
    wind_risk: RiskLevel | None
    rain_risk: RiskLevel | None
    snow_risk: RiskLevel | None
    risk: RiskLevel | None
    load_adjusted: bool
    forecast_clamped: bool

    def to_dict(self) -> dict:
        return {
            "mile": round(self.mile, 3),
            "lat": round(self.lat, 6),
            "lon": round(self.lon, 6),
            "eta": _iso(self.eta),
            "wind_mph": _round(self.wind_mph, 1),
            "wind_gust_mph": _round(self.wind_gust_mph, 1),
            "rain_in_hr": _round(self.rain_in_hr, 3),
            "snow_in_hr": _round(self.snow_in_hr, 3),
            "temperature_f": _round(self.temperature_f, 1),
            "conditions": self.conditions,
            "wind_risk": _label(self.wind_risk),
            "rain_risk": _label(self.rain_risk),
            "snow_risk": _label(self.snow_risk),
            "risk": _label(self.risk),
            "load_adjusted": self.load_adjusted,
            "forecast_clamped": self.forecast_clamped,
        }


@dataclass
class RouteMetrics:
    no_travel_miles: float = 0.0
    severe_miles: float = 0.0
    high_miles: float = 0.0
    moderate_miles: float = 0.0
    low_miles: float = 0.0
    unknown_miles: float = 0.0
    average_risk: float | None = None
    total_miles: float = 0.0

    def miles_for(self, level: RiskLevel) -> float:
        return {
            RiskLevel.NO_TRAVEL: self.no_travel_miles,
            RiskLevel.SEVERE: self.severe_miles,
            RiskLevel.HIGH: self.high_miles,
            RiskLevel.MODERATE: self.moderate_miles,
            RiskLevel.LOW: self.low_miles,
        }[level]

    def to_dict(self) -> dict:
        return {
            "no_travel_miles": round(self.no_travel_miles, 3),
            "severe_miles": round(self.severe_miles, 3),
            "high_miles": round(self.high_miles, 3),
            "moderate_miles": round(self.moderate_miles, 3),
            "low_miles": round(self.low_miles, 3),
            "unknown_miles": round(self.unknown_miles, 3),
            "average_risk": None if self.average_risk is None else round(self.average_risk, 4),
            "total_miles": round(self.total_miles, 3),
        }


@dataclass
class RouteOption:
    id: str
    name: str
    summary: str
    color: str
    distance_miles: float
    duration_seconds: float
    geometry: list[list[float]]
    checkpoints: list[Checkpoint]
    metrics: RouteMetrics
    rank: int = 0
    recommended: bool = False

    @property
    def blocked(self) -> bool:
        return self.metrics.no_travel_miles > 0.05

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "summary": self.summary,
            "color": self.color,
            "rank": self.rank,
            "recommended": self.recommended,
            "blocked": self.blocked,
            "distance_miles": round(self.distance_miles, 3),
            "duration_seconds": round(self.duration_seconds),
            "geometry": self.geometry,
            "checkpoints": [point.to_dict() for point in self.checkpoints],
            "metrics": self.metrics.to_dict(),
        }


@dataclass(frozen=True)
class RawRoute:
    """A driving path from the router, before weather scoring."""

    distance_m: float
    duration_s: float
    coordinates: list[tuple[float, float]]
    segment_distance_m: list[float]
    segment_duration_s: list[float]
    summary: str


@dataclass
class HeatPoint:
    lat: float
    lon: float
    risks: list[int]

    def to_dict(self) -> dict:
        return {"lat": round(self.lat, 5), "lon": round(self.lon, 5), "risks": self.risks}


@dataclass
class Analysis:
    origin: Place
    destination: Place
    departure: datetime
    load_lb: float
    sample_interval_miles: int
    hour_count: int
    routes: list[RouteOption]
    heatmap: list[HeatPoint]
    recommendation_reason: str
    ranking_criteria: list[str]
    warnings: list[str] = field(default_factory=list)

    @property
    def all_routes_blocked(self) -> bool:
        return bool(self.routes) and all(route.blocked for route in self.routes)

    def to_dict(self) -> dict:
        return {
            "origin": self.origin.to_dict(),
            "destination": self.destination.to_dict(),
            "departure": _iso(self.departure),
            "load_lb": self.load_lb,
            "sample_interval_miles": self.sample_interval_miles,
            "hour_count": self.hour_count,
            "all_routes_blocked": self.all_routes_blocked,
            "recommendation_reason": self.recommendation_reason,
            "ranking_criteria": self.ranking_criteria,
            "warnings": self.warnings,
            "routes": [route.to_dict() for route in self.routes],
            "heatmap": [point.to_dict() for point in self.heatmap],
        }


def _label(level: RiskLevel | None) -> str | None:
    return None if level is None else level.label


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def _iso(moment: datetime) -> str:
    return moment.astimezone(tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
