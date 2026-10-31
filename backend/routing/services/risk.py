"""Weather and load risk classification.

Bands follow the brief. Shared edges are assigned to the worse band, because
a truck sitting on the boundary should not be treated as the safer class.
Rain and snow "no travel" stays a strict greater-than, matching the table
(1.00 in/hr of rain and 3.0 in/hr of snow are still severe).

Load rules adjust wind only:
- >= 55 mph is no-travel for every load (already the wind table)
- 45–54 mph and more than 30,000 lb becomes no-travel
- 35–44 mph and more than 40,000 lb becomes severe
Weight comparisons are strict, so 30,000 lb and 40,000 lb do not upgrade.
"""

from __future__ import annotations

from routing.domain import RiskLevel

WIND_MODERATE_MPH = 25.0
WIND_HIGH_MPH = 35.0
WIND_SEVERE_MPH = 45.0
WIND_NO_TRAVEL_MPH = 55.0

RAIN_MODERATE = 0.10
RAIN_HIGH = 0.25
RAIN_SEVERE = 0.50
RAIN_NO_TRAVEL = 1.00

SNOW_MODERATE = 0.5
SNOW_HIGH = 1.0
SNOW_SEVERE = 2.0
SNOW_NO_TRAVEL = 3.0

LOAD_NO_TRAVEL_LB = 30_000.0
LOAD_SEVERE_LB = 40_000.0


def classify_wind(mph: float) -> RiskLevel:
    if mph >= WIND_NO_TRAVEL_MPH:
        return RiskLevel.NO_TRAVEL
    if mph >= WIND_SEVERE_MPH:
        return RiskLevel.SEVERE
    if mph >= WIND_HIGH_MPH:
        return RiskLevel.HIGH
    if mph >= WIND_MODERATE_MPH:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def apply_load(mph: float, load_lb: float) -> tuple[RiskLevel, bool]:
    """Return the load-adjusted wind risk and whether the load rule changed it."""
    base = classify_wind(mph)
    if WIND_SEVERE_MPH <= mph < WIND_NO_TRAVEL_MPH and load_lb > LOAD_NO_TRAVEL_LB:
        return RiskLevel.NO_TRAVEL, base is not RiskLevel.NO_TRAVEL
    if WIND_HIGH_MPH <= mph < WIND_SEVERE_MPH and load_lb > LOAD_SEVERE_LB:
        return RiskLevel.SEVERE, base is not RiskLevel.SEVERE
    return base, False


def classify_rain(inches_per_hour: float) -> RiskLevel:
    if inches_per_hour > RAIN_NO_TRAVEL:
        return RiskLevel.NO_TRAVEL
    if inches_per_hour >= RAIN_SEVERE:
        return RiskLevel.SEVERE
    if inches_per_hour >= RAIN_HIGH:
        return RiskLevel.HIGH
    if inches_per_hour >= RAIN_MODERATE:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_snow(inches_per_hour: float) -> RiskLevel:
    if inches_per_hour > SNOW_NO_TRAVEL:
        return RiskLevel.NO_TRAVEL
    if inches_per_hour >= SNOW_SEVERE:
        return RiskLevel.SEVERE
    if inches_per_hour >= SNOW_HIGH:
        return RiskLevel.HIGH
    if inches_per_hour >= SNOW_MODERATE:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def combine(*levels: RiskLevel | None) -> RiskLevel | None:
    present = [level for level in levels if level is not None]
    if not present:
        return None
    return max(present)
