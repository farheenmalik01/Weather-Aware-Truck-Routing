import { milesFor, RISK_COLORS, RISK_LABELS, RISK_ORDER } from "../risk";
import type { RouteMetrics } from "../types";

export function RiskBar({ metrics }: { metrics: RouteMetrics }) {
  const unknown = metrics.unknown_miles;
  const total = Math.max(metrics.total_miles, 0.001);
  const parts = [
    ...RISK_ORDER.map((risk) => ({ key: risk, miles: milesFor(metrics, risk), color: RISK_COLORS[risk], label: RISK_LABELS[risk] })),
    { key: "unknown", miles: unknown, color: "#94a3b8", label: "Unknown" },
  ].filter((part) => part.miles > 0.05);

  return (
    <div className="risk-bar" title={parts.map((part) => `${part.label} ${part.miles.toFixed(1)} mi`).join(", ")}>
      {parts.map((part) => (
        <span key={part.key} style={{ width: `${(part.miles / total) * 100}%`, background: part.color }} />
      ))}
    </div>
  );
}
