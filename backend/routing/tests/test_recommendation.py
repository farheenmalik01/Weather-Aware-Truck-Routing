from datetime import UTC, datetime

from routing.domain import Checkpoint, RiskLevel, RouteMetrics, RouteOption
from routing.services.metrics import metrics_for
from routing.services.recommendation import rank_routes


def _checkpoint(mile: float, risk: RiskLevel | None) -> Checkpoint:
    return Checkpoint(
        mile=mile,
        lat=0,
        lon=0,
        eta=datetime(2026, 11, 2, tzinfo=UTC),
        wind_mph=None,
        wind_gust_mph=None,
        rain_in_hr=None,
        snow_in_hr=None,
        temperature_f=None,
        conditions=None,
        wind_risk=risk,
        rain_risk=None,
        snow_risk=None,
        risk=risk,
        load_adjusted=False,
        forecast_clamped=False,
    )


def test_span_uses_the_worse_endpoint_and_weights_the_average():
    metrics = metrics_for(
        [
            _checkpoint(0, RiskLevel.SEVERE),
            _checkpoint(10, RiskLevel.HIGH),
            _checkpoint(30, RiskLevel.LOW),
        ],
        official_miles=30,
    )
    assert metrics.severe_miles == 10
    assert metrics.high_miles == 20
    assert metrics.average_risk == (4 * 10 + 3 * 20) / 30


def test_unknown_endpoint_does_not_erase_a_known_hazard():
    metrics = metrics_for(
        [_checkpoint(0, None), _checkpoint(8, RiskLevel.SEVERE)],
        official_miles=8,
    )
    assert metrics.severe_miles == 8
    assert metrics.unknown_miles == 0
    assert metrics.average_risk == 4


def test_ranking_prefers_no_travel_then_severe_then_high_then_time():
    clear_but_slow = _route("slow", severe=0, high=0, average=1, seconds=10_000, miles=100)
    severe = _route("severe", severe=12, high=0, average=2, seconds=1000, miles=100)
    no_travel = _route("blocked", no_travel=4, severe=0, high=0, average=2, seconds=1000, miles=100)
    high = _route("high", severe=0, high=9, average=1.4, seconds=1000, miles=100)
    ranked, reason = rank_routes([severe, no_travel, high, clear_but_slow])
    assert [route.name for route in ranked] == ["slow", "high", "severe", "blocked"]
    assert ranked[0].recommended is True
    assert ranked[0].rank == 1
    assert "high miles" in reason
    assert "slow" in reason


def test_average_risk_then_travel_time_break_remaining_ties():
    higher_average = _route("windy", severe=5, high=5, average=2.4, seconds=3000, miles=100)
    calmer_but_slower = _route("calmer", severe=5, high=5, average=1.8, seconds=9000, miles=100)
    ranked, reason = rank_routes([higher_average, calmer_but_slower])
    assert [route.name for route in ranked] == ["calmer", "windy"]
    assert "average risk" in reason

    early = _route("early", severe=5, high=5, average=1.8, seconds=3000, miles=100)
    late = _route("late", severe=5, high=5, average=1.8, seconds=5000, miles=100)
    ranked, reason = rank_routes([late, early])
    assert [route.name for route in ranked] == ["early", "late"]
    assert "travel time" in reason


def test_missing_weather_miles_rank_after_high_miles():
    gap = _route("gap", severe=0, high=0, unknown=15, average=1, seconds=1000, miles=100)
    observed = _route("observed", severe=0, high=0, unknown=0, average=2, seconds=5000, miles=100)
    ranked, reason = rank_routes([gap, observed])
    assert [route.name for route in ranked] == ["observed", "gap"]
    assert "missing weather" in reason


def _route(
    name: str,
    *,
    no_travel: float = 0,
    severe: float = 0,
    high: float = 0,
    unknown: float = 0,
    average: float = 1,
    seconds: float = 1000,
    miles: float = 100,
) -> RouteOption:
    low = max(miles - no_travel - severe - high - unknown, 0)
    return RouteOption(
        id=name,
        name=name,
        summary=name,
        color="#1d4e89",
        distance_miles=miles,
        duration_seconds=seconds,
        geometry=[],
        checkpoints=[],
        metrics=RouteMetrics(
            no_travel_miles=no_travel,
            severe_miles=severe,
            high_miles=high,
            moderate_miles=0,
            low_miles=low,
            unknown_miles=unknown,
            average_risk=average,
            total_miles=miles,
        ),
    )
