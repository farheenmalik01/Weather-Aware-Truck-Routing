import { formatDuration, formatMiles } from "../format";
import type { Analysis } from "../types";

export function ComparisonTable({ result }: { result: Analysis }) {
  const showUnknown = result.routes.some((route) => route.metrics.unknown_miles > 0.05);
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
          <Row label="No-travel mi" values={result.routes.map((route) => formatMiles(route.metrics.no_travel_miles))} />
          <Row label="Severe mi" values={result.routes.map((route) => formatMiles(route.metrics.severe_miles))} />
          <Row label="High mi" values={result.routes.map((route) => formatMiles(route.metrics.high_miles))} />
          {showUnknown && (
            <Row label="Unknown" values={result.routes.map((route) => formatMiles(route.metrics.unknown_miles))} />
          )}
          <Row
            label="Avg risk"
            values={result.routes.map((route) =>
              route.metrics.average_risk === null ? "—" : route.metrics.average_risk.toFixed(2),
            )}
          />
          <Row label="Time" values={result.routes.map((route) => formatDuration(route.duration_seconds))} />
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

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`}>{value}</td>
      ))}
    </tr>
  );
}
