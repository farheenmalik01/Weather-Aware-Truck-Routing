"""Turn checkpoint risks into miles of exposure.

Each span takes the worse of its two endpoints. The truck is on that road
while both observations are the relevant forecast, so the safer endpoint
must not hide the worse one. Miles are then scaled onto the router's
official distance so the buckets add up to the distance shown in the UI.
"""

from __future__ import annotations

from routing.domain import Checkpoint, RiskLevel, RouteMetrics


def metrics_for(checkpoints: list[Checkpoint], official_miles: float) -> RouteMetrics:
    buckets = {level: 0.0 for level in RiskLevel}
    unknown = 0.0
    weighted = 0.0
    known = 0.0

    for start, end in zip(checkpoints, checkpoints[1:], strict=False):
        miles = max(end.mile - start.mile, 0.0)
        risk = _span_risk(start, end)
        if risk is None:
            unknown += miles
            continue
        buckets[risk] += miles
        weighted += risk.value * miles
        known += miles

    raw_total = known + unknown
    scale = 1.0
    if raw_total > 0 and official_miles > 0 and abs(raw_total - official_miles) / official_miles > 0.001:
        scale = official_miles / raw_total

    metrics = RouteMetrics(
        no_travel_miles=buckets[RiskLevel.NO_TRAVEL] * scale,
        severe_miles=buckets[RiskLevel.SEVERE] * scale,
        high_miles=buckets[RiskLevel.HIGH] * scale,
        moderate_miles=buckets[RiskLevel.MODERATE] * scale,
        low_miles=buckets[RiskLevel.LOW] * scale,
        unknown_miles=unknown * scale,
        average_risk=(weighted / known) if known else None,
        total_miles=official_miles if official_miles > 0 else raw_total,
    )
    return metrics


def _span_risk(start: Checkpoint, end: Checkpoint) -> RiskLevel | None:
    if start.risk is None and end.risk is None:
        return None
    if start.risk is None:
        return end.risk
    if end.risk is None:
        return start.risk
    return max(start.risk, end.risk)
