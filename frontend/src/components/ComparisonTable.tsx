import { formatDuration, formatMiles } from "../format";
import type { Analysis } from "../types";

const RULES: { label: string; key: string; value: (route: Analysis["routes"][number]) => string }[] = [
  { label: "No-travel mi", key: "no-travel miles", value: (route) => formatMiles(route.metrics.no_travel_miles) },
  { label: "Severe mi", key: "severe miles", value: (route) => formatMiles(route.metrics.severe_miles) },
  { label: "High mi", key: "high miles", value: (route) => formatMiles(route.metrics.high_miles) },
  { label: "Missing mi", key: "miles with missing weather", value: (route) => formatMiles(route.metrics.unknown_miles) },
  {
    label: "Avg risk",
    key: "average risk",
    value: (route) => (route.metrics.average_risk === null ? "—" : route.metrics.average_risk.toFixed(2)),
  },
  { label: "Time", key: "travel time", value: (route) => formatDuration(route.duration_seconds) },
];

export function ComparisonTable({ result }: { result: Analysis }) {
  return (
    <div className="comparison panel">
      <h2>Ranking</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Rule</th>
            {result.routes.map((route) => (
              <th key={route.id} scope="col" style={{ color: route.color }}>
                {route.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RULES.map((rule) => (
            <Row
              key={rule.key}
              label={rule.label}
              decided={result.recommendation_reason.includes(`on ${rule.key}`)}
              values={result.routes.map((route) => rule.value(route))}
            />
          ))}
        </tbody>
      </table>
      <ol className="criteria">
        {result.ranking_criteria.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

function Row({ label, values, decided }: { label: string; values: string[]; decided: boolean }) {
  return (
    <tr className={decided ? "decided" : undefined}>
      <th scope="row">{label}</th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`}>{value}</td>
      ))}
    </tr>
  );
}
