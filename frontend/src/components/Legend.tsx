import { RISK_LABELS, RISK_ORDER } from "../risk";

export function Legend() {
  return (
    <div className="legend">
      <span>Risk</span>
      <div className="legend-scale">
        <div className="legend-ramp" aria-hidden="true" />
        <ul>
          {[...RISK_ORDER].reverse().map((risk) => (
            <li key={risk}>{RISK_LABELS[risk]}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
