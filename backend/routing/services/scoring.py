"""Attach the risk table to a forecast observation."""

from __future__ import annotations

from datetime import timedelta

from routing.domain import Checkpoint, SamplePoint
from routing.services.risk import apply_load, classify_rain, classify_snow, combine
from routing.services.weather import HourlySeries, Observation

# The slider covers departure hour 0 through hour 48.
FORECAST_HOURS = 49


def score_checkpoint(sample: SamplePoint, observation: Observation, load_lb: float) -> Checkpoint:
    wind_risk = None
    load_adjusted = False
    if observation.wind_mph is not None:
        wind_risk, load_adjusted = apply_load(observation.wind_mph, load_lb)
    rain_risk = classify_rain(observation.rain_in_hr) if observation.rain_in_hr is not None else None
    snow_risk = classify_snow(observation.snow_in_hr) if observation.snow_in_hr is not None else None
    return Checkpoint(
        mile=sample.mile,
        lat=sample.lat,
        lon=sample.lon,
        eta=sample.eta,
        wind_mph=observation.wind_mph,
        wind_gust_mph=observation.wind_gust_mph,
        rain_in_hr=observation.rain_in_hr,
        snow_in_hr=observation.snow_in_hr,
        temperature_f=observation.temperature_f,
        conditions=observation.conditions,
        wind_risk=wind_risk,
        rain_risk=rain_risk,
        snow_risk=snow_risk,
        risk=combine(wind_risk, rain_risk, snow_risk),
        load_adjusted=load_adjusted,
        forecast_clamped=observation.clamped,
    )


def risks_by_hour(series: HourlySeries | None, departure, load_lb: float) -> list[int]:
    """Risk code for each hour from departure. 0 means the hour had no observation."""
    if series is None:
        return [0] * FORECAST_HOURS
    codes: list[int] = []
    for hour in range(FORECAST_HOURS):
        observation = series.at(departure + timedelta(hours=hour))
        wind_risk = None
        if observation.wind_mph is not None:
            wind_risk, _adjusted = apply_load(observation.wind_mph, load_lb)
        rain_risk = classify_rain(observation.rain_in_hr) if observation.rain_in_hr is not None else None
        snow_risk = classify_snow(observation.snow_in_hr) if observation.snow_in_hr is not None else None
        level = combine(wind_risk, rain_risk, snow_risk)
        codes.append(0 if level is None else int(level))
    return codes
