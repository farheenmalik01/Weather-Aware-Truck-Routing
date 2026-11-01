from datetime import UTC, datetime

import pytest
from rest_framework.test import APIClient

from routing.domain import Analysis, Place, RouteMetrics, RouteOption


@pytest.fixture
def api():
    return APIClient()


@pytest.mark.django_db
def test_health(api):
    response = api.get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_geocode_requires_two_characters(api):
    response = api.get("/api/geocode/", {"q": "d"})
    assert response.status_code == 400
    body = response.json()
    assert body["error"] is True
    assert body["code"] == "VALIDATION_ERROR"


@pytest.mark.django_db
def test_analyze_rejects_an_unknown_interval_and_a_tiny_trip(api):
    base = {
        "origin": {"label": "Dallas", "lat": 32.7767, "lon": -96.797},
        "destination": {"label": "Houston", "lat": 29.7604, "lon": -95.3698},
        "departure": "2026-11-02T15:00:00Z",
        "load_lb": 35000,
        "sample_interval_miles": 15,
    }
    response = api.post("/api/routes/analyze/", base, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_ERROR"

    base["sample_interval_miles"] = 25
    base["destination"] = {"label": "Nearby", "lat": 32.777, "lon": -96.797}
    response = api.post("/api/routes/analyze/", base, format="json")
    assert response.status_code == 400
    assert "too close" in response.json()["message"]


@pytest.mark.django_db
def test_analyze_returns_the_service_payload(api, monkeypatch):
    monkeypatch.setattr("routing.views.analyze", lambda **_kwargs: _analysis())
    response = api.post(
        "/api/routes/analyze/",
        {
            "origin": {"label": "Dallas", "lat": 32.7767, "lon": -96.797},
            "destination": {"label": "Houston", "lat": 29.7604, "lon": -95.3698},
            "departure": "2026-11-02T15:00:00Z",
            "load_lb": 35000,
            "sample_interval_miles": 25,
        },
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["routes"][0]["recommended"] is True
    assert body["sample_interval_miles"] == 25
    assert body["hour_count"] == 49


def _analysis() -> Analysis:
    route = RouteOption(
        id="route-1",
        name="Fastest",
        summary="I 45",
        color="#1d4e89",
        distance_miles=240,
        duration_seconds=14_000,
        geometry=[[-96.8, 32.7], [-95.3, 29.7]],
        checkpoints=[],
        metrics=RouteMetrics(low_miles=240, average_risk=1, total_miles=240),
        rank=1,
        recommended=True,
    )
    return Analysis(
        origin=Place("Dallas", 32.7767, -96.797),
        destination=Place("Houston", 29.7604, -95.3698),
        departure=datetime(2026, 11, 2, 15, tzinfo=UTC),
        load_lb=35000,
        sample_interval_miles=25,
        hour_count=49,
        routes=[route],
        heatmap=[],
        recommendation_reason="Fastest is the only drivable route that was found.",
        ranking_criteria=["Fewest no-travel miles"],
    )
