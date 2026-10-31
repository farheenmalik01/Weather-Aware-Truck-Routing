from routing.services.osrm import _parse_route


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
