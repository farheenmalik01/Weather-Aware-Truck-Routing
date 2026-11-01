from datetime import UTC, datetime, timedelta

from routing.domain import Place, RawRoute
from routing.exceptions import AppError
from routing.services.analysis import analyze
from routing.services.scoring import FORECAST_HOURS
from routing.services.corridor import corridor_points
from routing.services.weather import HourlySeries, _forecast_dates, _parse_series

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)
DEPARTURE = datetime(2026, 11, 2, 15, 0, tzinfo=UTC)
MILE = 1609.344


def test_forecast_hour_is_selected_and_clamped_outside_the_series():
    series = _constant_series(start=DEPARTURE, hours=3, wind=12, rain=0.3, snow=0)
    inside = series.at(DEPARTURE + timedelta(minutes=30))
    assert inside.wind_mph == 12
    assert inside.rain_in_hr == 0.3
    assert inside.clamped is False
    assert series.at(DEPARTURE - timedelta(hours=5)).clamped is True
    assert series.at(DEPARTURE + timedelta(hours=10)).clamped is True


def test_null_rain_uses_precipitation_unless_it_is_snow():
    series = _parse_series(
        {
            "hourly": {
                "time": ["2026-11-02T15:00", "2026-11-02T16:00"],
                "rain": [None, None],
                "precipitation": [0.4, 0.3],
                "snowfall": [0.0, 1.5],
                "wind_speed_10m": [10, 10],
                "wind_gusts_10m": [15, 15],
                "temperature_2m": [40, 30],
                "weather_code": [61, 73],
            }
        }
    )
    rain_hour = series.at(DEPARTURE + timedelta(minutes=10))
    snow_hour = series.at(DEPARTURE + timedelta(hours=1, minutes=10))
    assert rain_hour.rain_in_hr == 0.4
    assert rain_hour.conditions == "Rain"
    assert snow_hour.rain_in_hr == 0.0
    assert snow_hour.snow_in_hr == 1.5
    assert snow_hour.conditions == "Snow"


def test_analysis_scores_eta_weather_and_builds_a_48_hour_heatmap():
    route = _raw(lat=32.0, miles=20, seconds=7200, summary="I 45")
    result = analyze(
        origin=Place("Dallas", 32.0, -97.0),
        destination=Place("South", 32.0, -96.0),
        departure=DEPARTURE,
        load_lb=20_000,
        sample_interval_miles=10,
        now=NOW,
        route_provider=lambda _origin, _destination: [route],
        weather_provider=_calm_provider,
    )
    assert result.hour_count == FORECAST_HOURS == 49
    assert len(result.routes) == 1
    scored = result.routes[0]
    assert scored.recommended is True
    assert [round(point.mile, 1) for point in scored.checkpoints] == [0.0, 10.0, 20.0]
    assert scored.checkpoints[-1].eta == DEPARTURE + timedelta(seconds=7200)
    assert all(point.risk.label == "low" for point in scored.checkpoints)
    assert scored.metrics.low_miles == 20
    assert scored.metrics.average_risk == 1
    assert scored.blocked is False
    assert result.heatmap
    assert all(len(point.risks) == 49 for point in result.heatmap)
    assert all(code == 1 for point in result.heatmap for code in point.risks)


def test_heavy_load_turns_severe_wind_into_no_travel():
    route = _raw(lat=32.0, miles=25, seconds=3600, summary="US 287")

    def windy(_cells, *, now, start, end):
        return {cell: _constant_series(DEPARTURE, 60, wind=50, rain=0, snow=0) for cell in _cells}

    blocked = analyze(
        origin=Place("A", 32, -97),
        destination=Place("B", 32, -96),
        departure=DEPARTURE,
        load_lb=35_000,
        sample_interval_miles=25,
        now=NOW,
        route_provider=lambda *_args: [route],
        weather_provider=windy,
    )
    point = blocked.routes[0].checkpoints[0]
    assert point.load_adjusted is True
    assert point.wind_risk.label == "no_travel"
    assert blocked.routes[0].blocked is True
    assert blocked.all_routes_blocked is True
    assert "no-travel" in blocked.recommendation_reason

    legal = analyze(
        origin=Place("A", 32, -97),
        destination=Place("B", 32, -96),
        departure=DEPARTURE,
        load_lb=20_000,
        sample_interval_miles=25,
        now=NOW,
        route_provider=lambda *_args: [route],
        weather_provider=windy,
    )
    assert legal.routes[0].checkpoints[0].load_adjusted is False
    assert legal.routes[0].checkpoints[0].risk.label == "severe"
    assert legal.routes[0].blocked is False


def test_safer_slower_route_beats_a_faster_no_travel_route():
    calm = _raw(lat=32.0, miles=100, seconds=10_000, summary="South loop")
    storm = _raw(lat=34.0, miles=90, seconds=5_000, summary="North loop")

    def provider(cells, *, now, start, end):
        series = {}
        for lat, lon in cells:
            wind = 60 if lat >= 33 else 8
            series[(lat, lon)] = _constant_series(DEPARTURE, 72, wind=wind, rain=0, snow=0)
        return series

    result = analyze(
        origin=Place("Start", 32, -97),
        destination=Place("End", 32, -96),
        departure=DEPARTURE,
        load_lb=10_000,
        sample_interval_miles=50,
        now=NOW,
        route_provider=lambda *_args: [calm, storm],
        weather_provider=provider,
    )
    assert result.routes[0].name == "Alternate A"
    assert result.routes[0].recommended is True
    assert result.routes[1].name == "Fastest"
    assert result.routes[1].blocked is True
    assert result.all_routes_blocked is False
    assert "no-travel miles" in result.recommendation_reason
    assert any("ranked below" in warning for warning in result.warnings)


def test_corridor_stays_on_the_road():
    route = _raw(lat=32.0, miles=40, seconds=4000, summary="I 45")
    points = corridor_points([route])
    assert len(points) >= 3
    assert all(abs(lat - 32.0) < 1e-6 for lat, _lon in points)


def test_forecast_dates_cover_the_trip_and_not_the_whole_horizon():
    start = DEPARTURE
    end = DEPARTURE + timedelta(hours=48)
    assert _forecast_dates(NOW, start, end) == ("2026-11-02", "2026-11-04")


def test_departure_outside_the_forecast_window_is_rejected():
    route = _raw(lat=32.0, miles=20, seconds=1000, summary="I 45")
    try:
        analyze(
            origin=Place("A", 32, -97),
            destination=Place("B", 32, -96),
            departure=NOW + timedelta(days=20),
            load_lb=1000,
            sample_interval_miles=25,
            now=NOW,
            route_provider=lambda *_args: [route],
            weather_provider=_calm_provider,
        )
    except AppError as exc:
        assert exc.code == "VALIDATION_ERROR"
    else:
        raise AssertionError("expected the departure window to reject the request")


def _raw(lat: float, miles: float, seconds: float, summary: str) -> RawRoute:
    return RawRoute(
        distance_m=miles * MILE,
        duration_s=seconds,
        coordinates=[(-97.0, lat), (-96.0, lat)],
        segment_distance_m=[miles * MILE],
        segment_duration_s=[seconds],
        summary=summary,
    )


def _constant_series(start: datetime, hours: int, wind: float, rain: float, snow: float) -> HourlySeries:
    return HourlySeries(
        times=[start + timedelta(hours=hour) for hour in range(hours)],
        wind=[wind] * hours,
        gust=[wind + 5] * hours,
        rain=[rain] * hours,
        snow=[snow] * hours,
        temperature=[55.0] * hours,
        codes=[0] * hours,
    )


def _calm_provider(cells, *, now, start, end):
    return {cell: _constant_series(DEPARTURE, 72, wind=8, rain=0, snow=0) for cell in cells}
