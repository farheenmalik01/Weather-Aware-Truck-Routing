import { RISK_COLORS, RISK_LABELS, RISK_ORDER } from "../risk";

export function Legend() {
  return (
    <div className="legend">
      <span>Risk</span>
      <ul>
        {RISK_ORDER.map((risk) => (
          <li key={risk}>
            <i style={{ background: RISK_COLORS[risk] }} />
            {RISK_LABELS[risk]}
          </li>
        ))}
      </ul>
    </div>
  );
}
