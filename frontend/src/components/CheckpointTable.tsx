import { formatEta, formatRate, formatWind } from "../format";
import { RISK_LABELS } from "../risk";
import type { RouteOption } from "../types";

export function CheckpointTable({ route }: { route: RouteOption }) {
  return (
    <div className="checkpoints">
      <div className="panel-head">
        <h2>{route.name} checkpoints</h2>
        <span>{route.checkpoints.length}</span>
      </div>
      <ul className="checkpoint-list">
        {route.checkpoints.map((point) => (
          <li key={`${point.mile}-${point.eta}`}>
            <div className="cp-top">
              <strong>{point.mile.toFixed(1)} mi</strong>
              <span className={`pill ${point.risk ?? "unknown"}`}>
                {point.risk ? RISK_LABELS[point.risk] : "Unknown"}
              </span>
            </div>
            <p>{formatEta(point.eta)}</p>
            <p className="cp-wx">
              Wind {formatWind(point.wind_mph)}
              {point.load_adjusted ? " · load rule" : ""}
              {" · "}
              Rain {formatRate(point.rain_in_hr, "in/hr")}
              {" · "}
              Snow {formatRate(point.snow_in_hr, "in/hr")}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
