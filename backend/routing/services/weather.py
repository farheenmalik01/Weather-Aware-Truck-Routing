"""Hourly forecasts from Open-Meteo, keyed by a coarse coordinate cell.

Risk uses sustained wind (mph), rain (in/hr), and snowfall (in/hr). Gusts and
temperature are returned for the driver and are not part of the risk table.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from routing.exceptions import AppError
from routing.services.http_client import TTLCache, get_json

HOURLY_FIELDS = "temperature_2m,wind_speed_10m,wind_gusts_10m,rain,snowfall,precipitation,weather_code"
CHUNK_SIZE = 60
_cache = TTLCache(ttl_seconds=15 * 60, max_items=500)


@dataclass(frozen=True)
class Observation:
    wind_mph: float | None
    wind_gust_mph: float | None
    rain_in_hr: float | None
    snow_in_hr: float | None
    temperature_f: float | None
    conditions: str | None
    clamped: bool

    @classmethod
    def missing(cls) -> Observation:
        return cls(None, None, None, None, None, None, True)


@dataclass
class HourlySeries:
    times: list[datetime]
    wind: list[float | None]
    gust: list[float | None]
    rain: list[float | None]
    snow: list[float | None]
    temperature: list[float | None]
    codes: list[int | None]

    def at(self, moment: datetime) -> Observation:
        if not self.times:
            return Observation.missing()
        moment = moment.astimezone(UTC)
        index = _hour_index(self.times, moment)
        clamped = index < 0 or index >= len(self.times)
        if index < 0:
            index = 0
        elif index >= len(self.times):
            index = len(self.times) - 1
        elif index == len(self.times) - 1 and moment >= self.times[-1] + timedelta(hours=1):
            clamped = True
        return Observation(
            wind_mph=_at(self.wind, index),
            wind_gust_mph=_at(self.gust, index),
            rain_in_hr=_at(self.rain, index),
            snow_in_hr=_at(self.snow, index),
            temperature_f=_at(self.temperature, index),
            conditions=condition_label(_at(self.codes, index)),
            clamped=clamped,
        )


def fetch_forecast(
    cells: list[tuple[float, float]],
    *,
    now: datetime,
    start: datetime,
    end: datetime,
) -> dict[tuple[float, float], HourlySeries]:
    """Return one hourly series per weather cell. Missing cells are omitted."""
    if not cells:
        return {}
    start_date, end_date = _forecast_dates(now, start, end)
    found: dict[tuple[float, float], HourlySeries] = {}
    needed: list[tuple[float, float]] = []
    for cell in cells:
        cached = _cache.get(_cache_key(cell, start_date, end_date, now))
        if cached is None:
            needed.append(cell)
        else:
            found[cell] = cached
    if not needed:
        return found

    chunks = [needed[index : index + CHUNK_SIZE] for index in range(0, len(needed), CHUNK_SIZE)]
    workers = min(4, len(chunks))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        groups = list(pool.map(lambda chunk: _fetch_chunk(chunk, start_date, end_date), chunks))
    for group in groups:
        for cell, series in group.items():
            found[cell] = series
            _cache.set(_cache_key(cell, start_date, end_date, now), series)
    return found


def condition_label(code: int | None) -> str | None:
    if code is None:
        return None
    if code == 0:
        return "Clear"
    if code in {1, 2, 3}:
        return "Cloudy"
    if code in {45, 48}:
        return "Fog"
    if code in {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82}:
        return "Rain"
    if code in {71, 73, 75, 77, 85, 86}:
        return "Snow"
    if code in {95, 96, 99}:
        return "Thunderstorm"
    return "Mixed"


def _fetch_chunk(
    cells: list[tuple[float, float]],
    start_date: str,
    end_date: str,
) -> dict[tuple[float, float], HourlySeries]:
    base = os.environ.get("OPEN_METEO_BASE_URL", "https://api.open-meteo.com").rstrip("/")
    params = {
        "latitude": ",".join(f"{lat:.2f}" for lat, _lon in cells),
        "longitude": ",".join(f"{lon:.2f}" for _lat, lon in cells),
        "hourly": HOURLY_FIELDS,
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "snowfall_unit": "inch",
        "temperature_unit": "fahrenheit",
        "timezone": "GMT",
        "start_date": start_date,
        "end_date": end_date,
    }
    payload = get_json(f"{base}/v1/forecast", params)
    records = _as_location_list(payload, len(cells))
    if len(records) != len(cells):
        raise AppError(
            "The weather service returned an unexpected number of locations.",
            code="WEATHER_UNAVAILABLE",
            status_code=502,
        )
    parsed: dict[tuple[float, float], HourlySeries] = {}
    for cell, record in zip(cells, records, strict=True):
        parsed[cell] = _parse_series(record)
    return parsed


def _parse_series(record: dict) -> HourlySeries:
    if record.get("error"):
        reason = record.get("reason") or "Weather data is unavailable for a point on this route."
        raise AppError(str(reason), code="WEATHER_UNAVAILABLE", status_code=502)
    hourly = record.get("hourly") or {}
    times = [_parse_time(value) for value in hourly.get("time") or []]
    if not times:
        raise AppError(
            "The weather service returned no hourly data for this trip.",
            code="WEATHER_UNAVAILABLE",
            status_code=502,
        )
    count = len(times)
    snow = _nums(hourly.get("snowfall"), count)
    rain = [
        _resolve_rain(raw_rain, raw_precip, raw_snow)
        for raw_rain, raw_precip, raw_snow in zip(
            _nums(hourly.get("rain"), count),
            _nums(hourly.get("precipitation"), count),
            snow,
            strict=True,
        )
    ]
    return HourlySeries(
        times=times,
        wind=_nums(hourly.get("wind_speed_10m"), count),
        gust=_nums(hourly.get("wind_gusts_10m"), count),
        rain=rain,
        snow=snow,
        temperature=_nums(hourly.get("temperature_2m"), count),
        codes=_ints(hourly.get("weather_code"), count),
    )


def _as_location_list(payload: Any, count: int) -> list[dict]:
    if isinstance(payload, dict) and payload.get("error") and "hourly" not in payload:
        reason = payload.get("reason") or "Weather data is unavailable."
        raise AppError(str(reason), code="WEATHER_UNAVAILABLE", status_code=502)
    if count == 1 and isinstance(payload, dict):
        return [payload]
    if isinstance(payload, list):
        return payload
    raise AppError(
        "The weather service returned data that could not be read.",
        code="WEATHER_UNAVAILABLE",
        status_code=502,
    )


def _forecast_dates(now: datetime, start: datetime, end: datetime) -> tuple[str, str]:
    """Inclusive UTC dates that cover the trip, and nothing outside the model horizon."""
    start_day = (start.astimezone(UTC) - timedelta(hours=1)).date()
    end_day = (end.astimezone(UTC) + timedelta(hours=1)).date()
    earliest = (now.astimezone(UTC) - timedelta(days=1)).date()
    latest = (now.astimezone(UTC) + timedelta(days=16)).date()
    start_day = min(max(start_day, earliest), latest)
    end_day = min(max(end_day, start_day), latest)
    return start_day.isoformat(), end_day.isoformat()


def _cache_key(
    cell: tuple[float, float],
    start_date: str,
    end_date: str,
    now: datetime,
) -> tuple:
    hour = now.astimezone(UTC).replace(minute=0, second=0, microsecond=0)
    return (cell, start_date, end_date, hour)


def _hour_index(times: list[datetime], moment: datetime) -> int:
    # Last stamp that is still <= the moment. Negative means the moment is earlier.
    lo = 0
    hi = len(times)
    while lo < hi:
        mid = (lo + hi) // 2
        if times[mid] <= moment:
            lo = mid + 1
        else:
            hi = mid
    return lo - 1


def _resolve_rain(rain: float | None, precip: float | None, snow: float | None) -> float | None:
    """Use the rain field, and fall back to total precipitation only when it is not snow."""
    if rain is not None:
        return rain
    if precip is None:
        return None
    if snow is not None and snow >= 0.01:
        return 0.0
    return precip


def _at(values: list, index: int):
    if index < 0 or index >= len(values):
        return None
    return values[index]


def _nums(values: list | None, count: int) -> list[float | None]:
    raw = list(values or [])
    raw.extend([None] * (count - len(raw)))
    parsed: list[float | None] = []
    for value in raw[:count]:
        parsed.append(None if value is None else float(value))
    return parsed


def _ints(values: list | None, count: int) -> list[int | None]:
    raw = list(values or [])
    raw.extend([None] * (count - len(raw)))
    parsed: list[int | None] = []
    for value in raw[:count]:
        parsed.append(None if value is None else int(value))
    return parsed


def _parse_time(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
