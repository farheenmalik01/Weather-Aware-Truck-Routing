import { useEffect, useRef } from "react";

import { useTripStore } from "../store";
import { CheckpointTable } from "./CheckpointTable";
import { ComparisonTable } from "./ComparisonTable";
import { RouteCard } from "./RouteCard";

export function Results() {
  const result = useTripStore((state) => state.result);
  const selectedRouteId = useTripStore((state) => state.selectedRouteId);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!result || !panelRef.current) return;
    panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  if (!result) {
    return (
      <section className="panel empty-panel">
        <h2>What you get</h2>
        <ol>
          <li>Three driving routes between the stops.</li>
          <li>Weather at the truck’s arrival time, every 10, 25, or 50 miles.</li>
          <li>A recommendation from hazard miles, then travel time.</li>
        </ol>
      </section>
    );
  }
  const selected = result.routes.find((route) => route.id === selectedRouteId) ?? result.routes[0];
  return (
    <section ref={panelRef} className="results">
      {result.all_routes_blocked && (
        <p className="banner">Every route crosses no-travel weather. The highlighted option is the least unsafe.</p>
      )}
      <p className="reason">{result.recommendation_reason}</p>
      {result.warnings.map((warning) => (
        <p key={warning} className="warning">
          {warning}
        </p>
      ))}
      <div className="route-list">
        {result.routes.map((route) => (
          <RouteCard key={route.id} route={route} />
        ))}
      </div>
      <ComparisonTable result={result} />
      {selected && <CheckpointTable route={selected} />}
    </section>
  );
}
