from routing.domain import RiskLevel
from routing.services.risk import apply_load, classify_rain, classify_snow, classify_wind, combine


def test_wind_bands_follow_the_table():
    assert classify_wind(0) is RiskLevel.LOW
    assert classify_wind(24.99) is RiskLevel.LOW
    assert classify_wind(25) is RiskLevel.MODERATE
    assert classify_wind(34.99) is RiskLevel.MODERATE
    assert classify_wind(35) is RiskLevel.HIGH
    assert classify_wind(44.99) is RiskLevel.HIGH
    assert classify_wind(45) is RiskLevel.SEVERE
    assert classify_wind(54.99) is RiskLevel.SEVERE
    assert classify_wind(55) is RiskLevel.NO_TRAVEL
    assert classify_wind(80) is RiskLevel.NO_TRAVEL


def test_rain_bands_keep_one_inch_inside_severe():
    assert classify_rain(0) is RiskLevel.LOW
    assert classify_rain(0.099) is RiskLevel.LOW
    assert classify_rain(0.10) is RiskLevel.MODERATE
    assert classify_rain(0.249) is RiskLevel.MODERATE
    assert classify_rain(0.25) is RiskLevel.HIGH
    assert classify_rain(0.499) is RiskLevel.HIGH
    assert classify_rain(0.50) is RiskLevel.SEVERE
    assert classify_rain(1.00) is RiskLevel.SEVERE
    assert classify_rain(1.001) is RiskLevel.NO_TRAVEL


def test_snow_bands_keep_three_inches_inside_severe():
    assert classify_snow(0.49) is RiskLevel.LOW
    assert classify_snow(0.5) is RiskLevel.MODERATE
    assert classify_snow(0.999) is RiskLevel.MODERATE
    assert classify_snow(1.0) is RiskLevel.HIGH
    assert classify_snow(1.999) is RiskLevel.HIGH
    assert classify_snow(2.0) is RiskLevel.SEVERE
    assert classify_snow(3.0) is RiskLevel.SEVERE
    assert classify_snow(3.001) is RiskLevel.NO_TRAVEL


def test_load_upgrades_are_strictly_above_the_weight_limits():
    assert apply_load(50, 30_000) == (RiskLevel.SEVERE, False)
    assert apply_load(50, 30_000.01) == (RiskLevel.NO_TRAVEL, True)
    assert apply_load(45, 40_000) == (RiskLevel.NO_TRAVEL, True)
    assert apply_load(40, 40_000) == (RiskLevel.HIGH, False)
    assert apply_load(40, 40_000.01) == (RiskLevel.SEVERE, True)
    assert apply_load(35, 50_000) == (RiskLevel.SEVERE, True)
    assert apply_load(34.9, 80_000) == (RiskLevel.MODERATE, False)
    assert apply_load(55, 0) == (RiskLevel.NO_TRAVEL, False)
    assert apply_load(10, 80_000) == (RiskLevel.LOW, False)


def test_checkpoint_risk_is_the_worst_condition():
    assert combine(RiskLevel.LOW, RiskLevel.HIGH, RiskLevel.MODERATE) is RiskLevel.HIGH
    assert combine(RiskLevel.SEVERE, RiskLevel.NO_TRAVEL) is RiskLevel.NO_TRAVEL
    assert combine(None, None) is None
    assert combine(None, RiskLevel.MODERATE) is RiskLevel.MODERATE
