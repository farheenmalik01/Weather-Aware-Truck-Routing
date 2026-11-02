# Weather-Aware Truck Routing

A React and Django app that helps a driver pick the safest of three routes. It samples the forecast at the truck's estimated arrival time, applies the wind / rain / snow table and the load rules, and ranks the options. A corridor heatmap scrubs the same geography from departure through 48 hours without another request.

Routing, geocoding, and weather come from public services (OSRM, Photon, Open-Meteo). No API key is required.

## Run it

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/manage.py runserver 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to Django.

```bash
cd backend && ../.venv/bin/pytest
cd frontend && npm test && npm run build
```

Docker Compose serves the built UI and API together on port 8080:

```bash
docker compose up --build
```

## How a trip is scored

1. OSRM returns up to three distinct driving routes. If the network offers fewer, the service routes through via-points offset to either side of the fastest path. Those are real roads, not drawn lines. A corridor with only one road returns that one road.
2. Checkpoints are placed every 10, 25, or 50 miles, always including the origin and the destination.
3. Arrival time is interpolated from the router's per-segment durations, scaled so the destination ETA matches the route's total travel time. A slow city stretch and a fast highway stretch do not share one average speed.
4. Open-Meteo supplies the hour that contains that ETA: sustained wind in mph, rain in inches per hour, snow in inches per hour.
5. Each condition is classified with the table below. The checkpoint risk is the worst of the three. Each road span takes the worse of its two endpoints, and those miles are what the ranking sees.

| Condition | Low | Moderate | High | Severe | No travel |
| --- | --- | --- | --- | --- | --- |
| Wind | < 25 mph | 25–34 | 35–44 | 45–54 | ≥ 55 mph |
| Rain | < 0.10 in/hr | 0.10–0.25 | 0.25–0.50 | 0.50–1.00 | > 1.00 |
| Snow | < 0.5 in/hr | 0.5–1.0 | 1.0–2.0 | 2.0–3.0 | > 3.0 |

Shared boundaries go to the worse band (0.25 in/hr of rain is high). Rain at exactly 1.00 in/hr and snow at exactly 3.0 in/hr stay severe, because no-travel for those two is a strict greater-than.

Load changes wind only, and the weight tests are strict:

- 55 mph or more is no-travel for every load.
- 45–54 mph and more than 30,000 lb becomes no-travel.
- 35–44 mph and more than 40,000 lb becomes severe.
- 30,000 lb and 40,000 lb do not upgrade.

Average risk is the mile-weighted score on a 1 (low) to 5 (no-travel) scale. Gusts are shown on a checkpoint and are not part of the score.

## How a route is recommended

1. Fewest no-travel miles.
2. Fewest severe miles.
3. Fewest high miles.
4. Fewest miles with missing weather.
5. Lowest average risk.
6. Shortest travel time.

No-travel is ordered first because it is the stricter class in the same table. A route that cannot be driven must not win on fewer severe miles. Missing observations are ordered after high miles so a gap cannot look safer than a measured hazard. The comparison table and the recommendation sentence show the rule that actually decided it.

The heatmap is a different question. It colors the selected road at each clock hour from the departure through hour 48, using the same load rules and the same worse-endpoint miles as the ranking. The color fades at the edge and eases from one risk into the next, and a loop stays on the highway. Dragging the slider only swaps preloaded hours. Clicking another route moves the band onto that road.

## API

`GET /api/geocode/?q=Dallas`

`POST /api/routes/analyze/`

```json
{
  "origin": {"label": "Dallas, Texas", "lat": 32.7767, "lon": -96.797},
  "destination": {"label": "Houston, Texas", "lat": 29.7604, "lon": -95.3698},
  "departure": "2026-11-02T15:00:00Z",
  "load_lb": 35000,
  "sample_interval_miles": 25
}
```

`sample_interval_miles` is 10, 25, or 50. Departure must fall between a few hours ago and 14 days ahead, which is the hourly forecast window. Errors are `{ "error": true, "code": "...", "message": "..." }`.

Optional environment variables: `OSRM_BASE_URL`, `PHOTON_BASE_URL`, `OPEN_METEO_BASE_URL`, `CORS_ALLOWED_ORIGINS`.

## Layout

`backend/routing/services` holds the rules. Views validate input and return JSON. `risk.py`, `sampling.py`, `metrics.py`, and `recommendation.py` do not call the network, and the tests cover the band edges, the load cutovers, ETA interpolation, and the ranking order.

The UI keeps the map instance alive. Selecting a route fades the others and frames the stretch where that road leaves them. The forecast slider replaces that hour's band only, so scrubbing does not restyle the map or call the API again.
