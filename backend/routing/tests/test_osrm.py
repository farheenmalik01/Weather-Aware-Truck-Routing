from routing.services.osrm import _parse_route, decode_polyline


def test_parse_route_uses_road_names_and_full_geometry():
    parsed = _parse_route(
        {
            "distance": 1000,
            "duration": 100,
            "geometry": {"coordinates": [[0, 0], [1, 0], [1, 1]]},
            "legs": [
                {
                    "annotation": {"distance": [400, 600], "duration": [40, 60]},
                    "steps": [
                        {"name": "I 45", "distance": 700},
                        {"name": "US 59", "distance": 300},
                    ],
                }
            ],
        }
    )
    assert parsed.summary == "I 45 · US 59"
    assert len(parsed.coordinates) == 3
    assert abs(sum(parsed.segment_distance_m) - 1000) < 1e-6
    assert abs(sum(parsed.segment_duration_s) - 100) < 1e-6


def test_standard_polyline_decodes_lat_lon():
    decoded = decode_polyline("_p~iF~ps|U", precision=5)
    assert abs(decoded[0][1] - 38.5) < 1e-6
    assert abs(decoded[0][0] - (-120.2)) < 1e-6


def test_parse_route_accepts_polyline6_geometry():
    encoded = _encode([(32.0, -96.0), (33.0, -95.0)])
    parsed = _parse_route(
        {
            "distance": 1000,
            "duration": 50,
            "geometry": encoded,
            "legs": [{"annotation": {"distance": [1000], "duration": [50]}, "steps": []}],
        }
    )
    lon, lat = parsed.coordinates[-1]
    assert abs(lat - 33.0) < 1e-5
    assert abs(lon - (-95.0)) < 1e-5


def _encode(points: list[tuple[float, float]], precision: int = 6) -> str:
    factor = 10**precision
    out: list[str] = []
    prev_lat = 0
    prev_lon = 0
    for lat, lon in points:
        prev_lat = _append(out, int(round(lat * factor)) - prev_lat, prev_lat)
        prev_lon = _append(out, int(round(lon * factor)) - prev_lon, prev_lon)
    return "".join(out)


def _append(out: list[str], delta: int, previous: int) -> int:
    value = ~(delta << 1) if delta < 0 else delta << 1
    while value >= 0x20:
        out.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    out.append(chr(value + 63))
    return previous + delta


def test_mismatched_annotations_fall_back_to_the_path_length():
    parsed = _parse_route(
        {
            "distance": 1000,
            "duration": 50,
            "geometry": {"coordinates": [[0, 0], [0, 1], [0, 2]]},
            "legs": [{"annotation": {"distance": [5], "duration": [5]}, "steps": []}],
        }
    )
    assert len(parsed.segment_distance_m) == 2
    assert abs(sum(parsed.segment_distance_m) - 1000) < 1e-6
    assert parsed.summary == "Highway route"
