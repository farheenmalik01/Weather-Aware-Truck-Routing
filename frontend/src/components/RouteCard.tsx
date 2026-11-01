import type { CSSProperties } from "react";

import { formatDuration, formatMiles } from "../format";
import { useTripStore } from "../store";
import type { RouteOption } from "../types";
import { RiskBar } from "./RiskBar";

export function RouteCard({ route }: { route: RouteOption }) {
  const selected = useTripStore((state) => state.selectedRouteId === route.id);
  const selectRoute = useTripStore((state) => state.selectRoute);
  const requestZoom = useTripStore((state) => state.requestZoom);
  const average = route.metrics.average_risk === null ? "—" : route.metrics.average_risk.toFixed(2);

  return (
    <article
      className={selected ? "route-card selected" : "route-card"}
      style={{ "--route": route.color } as CSSProperties}
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={() => selectRoute(route.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRoute(route.id);
        }
      }}
    >
      <div className="route-top">
        <div className="route-name">
          <span className="swatch" style={{ background: route.color }} />
          <strong>{route.name}</strong>
          <span className="rank">#{route.rank}</span>
        </div>
        <div className="route-badges">
          {route.recommended && <em className="badge">Recommended</em>}
          {route.blocked && <em className="badge danger">No travel</em>}
        </div>
      </div>
      <p className="summary">{route.summary}</p>
      <p className="route-metrics">
        <b>{formatDuration(route.duration_seconds)}</b>
        <span>{formatMiles(route.distance_miles, 0)}</span>
        <span>Risk {average}</span>
      </p>
      <RiskBar metrics={route.metrics} />
      <dl>
        <div>
          <dt>No travel</dt>
          <dd>{formatMiles(route.metrics.no_travel_miles)}</dd>
        </div>
        <div>
          <dt>Severe</dt>
          <dd>{formatMiles(route.metrics.severe_miles)}</dd>
        </div>
        <div>
          <dt>High</dt>
          <dd>{formatMiles(route.metrics.high_miles)}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="text-button"
        onClick={(event) => {
          event.stopPropagation();
          requestZoom(route.id);
        }}
      >
        Zoom to route
      </button>
    </article>
  );
}
