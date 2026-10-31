from datetime import UTC, datetime, timedelta

from routing.services.geo import MILE_M, destination, douglas_peucker, haversine_m
from routing.services.sampling import align_segments, sample_route

DEPARTURE = datetime(2026, 11, 2, 15, 0, tzinfo=UTC)
MILE = 1609.344


def _line():
    return [(-100.0, 30.0), (-99.0, 30.0), (-98.0, 30.0)]


def test_samples_land_on_the_mileage_and_use_segment_time():
    samples = sample_route(
        _line(),
        [10 * MILE, 10 * MILE],
        [600.0, 1800.0],
        interval_miles=10,
        departure=DEPARTURE,
    )
    assert [round(sample.mile, 3) for sample in samples] == [0.0, 10.0, 20.0]
    assert samples[1].eta == DEPARTURE + timedelta(seconds=600)
    assert samples[2].eta == DEPARTURE + timedelta(seconds=2400)
    assert abs(samples[0].lon - -100.0) < 1e-9
    assert abs(samples[2].lon - -98.0) < 1e-9


def test_midpoint_is_interpolated_in_space_and_time():
    samples = sample_route(
        _line(),
        [10 * MILE, 10 * MILE],
        [600.0, 1800.0],
        interval_miles=5,
        departure=DEPARTURE,
    )
    assert [sample.mile for sample in samples] == [0.0, 5.0, 10.0, 15.0, 20.0]
    assert samples[1].eta == DEPARTURE + timedelta(seconds=300)
    assert abs(samples[1].lon - -99.5) < 1e-6
    assert samples[3].eta == DEPARTURE + timedelta(seconds=600 + 900)


def test_short_route_keeps_origin_and_destination_only():
    samples = sample_route(
        _line(),
        [10 * MILE, 10 * MILE],
        [600.0, 600.0],
        interval_miles=25,
        departure=DEPARTURE,
    )
    assert [round(sample.mile, 3) for sample in samples] == [0.0, 20.0]


def test_annotations_are_scaled_onto_the_official_duration():
    distances, durations = align_segments(
        _line(),
        [100.0, 300.0],
        [10.0, 30.0],
        official_distance_m=20 * MILE,
        official_duration_s=4000,
    )
    assert abs(sum(distances) - 20 * MILE) < 1e-6
    assert abs(sum(durations) - 4000) < 1e-6
    assert abs(distances[0] / distances[1] - 1 / 3) < 1e-9


def test_one_mile_north_is_about_a_mile():
    lon, lat = destination(-96.0, 32.0, 0, MILE_M)
    assert abs(haversine_m(-96.0, 32.0, lon, lat) - MILE_M) < 1
    assert lat > 32


def test_simplifier_keeps_the_ends_of_a_straight_line():
    points = [(float(index), 0.0) for index in range(10)]
    simplified = douglas_peucker(points, 0.0001)
    assert simplified[0] == points[0]
    assert simplified[-1] == points[-1]
    assert len(simplified) == 2
