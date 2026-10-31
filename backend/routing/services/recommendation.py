"""Rank routes by the safety rules, then by travel time.

No-travel miles are ordered first. The written preference list starts at
severe miles, but no-travel is a stricter class in the same table: a route
that cannot be driven must not win because it has fewer severe miles.
Miles with no weather observation are ordered after high miles so missing
data cannot look safer than a measured hazard. Average risk uses the
1 (low) through 5 (no travel) scale, weighted by miles.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from routing.domain import RouteOption

RANKING_CRITERIA = [
    "Fewest no-travel miles",
    "Fewest severe miles",
    "Fewest high miles",
    "Fewest miles with missing weather",
    "Lowest average risk (1 = low, 5 = no travel)",
    "Shortest travel time",
]


@dataclass(frozen=True)
class _Criterion:
    label: str
    value: Callable[[RouteOption], float]
    format: Callable[[float], str]


def _miles(attr: str) -> Callable[[RouteOption], float]:
    return lambda route: round(getattr(route.metrics, attr), 3)


def _format_duration(seconds: float) -> str:
    total = int(round(seconds))
    hours, remainder = divmod(total, 3600)
    minutes = remainder // 60
    if hours and minutes:
        return f"{hours}h {minutes}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


CRITERIA = [
    _Criterion("no-travel miles", _miles("no_travel_miles"), lambda value: f"{value:.1f} mi"),
    _Criterion("severe miles", _miles("severe_miles"), lambda value: f"{value:.1f} mi"),
    _Criterion("high miles", _miles("high_miles"), lambda value: f"{value:.1f} mi"),
    _Criterion("miles with missing weather", _miles("unknown_miles"), lambda value: f"{value:.1f} mi"),
    _Criterion(
        "average risk",
        lambda route: round(route.metrics.average_risk, 4) if route.metrics.average_risk is not None else 1e9,
        lambda value: f"{value:.2f}",
    ),
    _Criterion(
        "travel time",
        lambda route: float(round(route.duration_seconds)),
        _format_duration,
    ),
]


def rank_routes(routes: list[RouteOption]) -> tuple[list[RouteOption], str]:
    ranked = sorted(routes, key=_sort_key)
    for index, route in enumerate(ranked, start=1):
        route.rank = index
        route.recommended = index == 1
    return ranked, explain(ranked)


def explain(ranked: list[RouteOption]) -> str:
    if not ranked:
        return "No routes to compare."
    best = ranked[0]
    if len(ranked) == 1:
        sentence = f"{best.name} is the only drivable route that was found."
    else:
        sentence = _deciding_sentence(best, ranked[1])
    if best.metrics.no_travel_miles > 0.05:
        return "Every option includes no-travel weather. " + sentence
    return sentence


def _sort_key(route: RouteOption) -> tuple[float, ...]:
    return tuple(criterion.value(route) for criterion in CRITERIA)


def _deciding_sentence(best: RouteOption, runner_up: RouteOption) -> str:
    for criterion in CRITERIA:
        best_value = criterion.value(best)
        other_value = criterion.value(runner_up)
        if best_value == other_value:
            continue
        return (
            f"{best.name} is recommended on {criterion.label}: "
            f"{criterion.format(best_value)} versus {criterion.format(other_value)} on {runner_up.name}."
        )
    return f"{best.name} ties the next route on every rule, so it keeps the earlier position."
