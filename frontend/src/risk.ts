import type { RiskName, RouteMetrics } from "./types";

export const RISK_ORDER: RiskName[] = ["no_travel", "severe", "high", "moderate", "low"];

export const RISK_COLORS: Record<RiskName, string> = {
  low: "#1f7a45",
  moderate: "#b58100",
  high: "#d65a00",
  severe: "#c4232c",
  no_travel: "#6d28d9",
};

export const RISK_LABELS: Record<RiskName, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
  no_travel: "No travel",
};

export const HEAT_COLORS: Record<number, string> = {
  1: RISK_COLORS.low,
  2: RISK_COLORS.moderate,
  3: RISK_COLORS.high,
  4: RISK_COLORS.severe,
  5: RISK_COLORS.no_travel,
};

const HEAT_NAMES = ["", "low", "moderate", "high", "severe", "no-travel"];

const MILE_NAMES = ["", "low", "moderate", "high", "severe", "no-travel"];

export function hourMileSummary(miles: number[]): string {
  let known = 0;
  for (let code = 1; code <= 5; code += 1) known += miles[code] ?? 0;
  if (known < 0.5) return "No forecast";
  if ((miles[1] ?? 0) >= known - 0.5) return "All low";
  const parts: string[] = [];
  for (let code = 5; code >= 1; code -= 1) {
    const milesAt = miles[code] ?? 0;
    if (milesAt >= 0.5) parts.push(`${Math.round(milesAt)} ${MILE_NAMES[code]} mi`);
  }
  return parts.join(" · ");
}

export function hourSummary(codes: number[]): string {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const code of codes) {
    if (code >= 1 && code <= 5) counts[code] += 1;
  }
  const known = counts.reduce((sum, count) => sum + count, 0);
  if (known === 0) return "No forecast";
  if (counts[1] === known) return "All low";
  const parts: string[] = [];
  for (let code = 5; code >= 1; code -= 1) {
    if (counts[code] > 0) parts.push(`${counts[code]} ${HEAT_NAMES[code]}`);
  }
  return parts.join(" · ");
}

export function milesFor(metrics: RouteMetrics, key: RiskName | "unknown"): number {
  switch (key) {
    case "no_travel":
      return metrics.no_travel_miles;
    case "severe":
      return metrics.severe_miles;
    case "high":
      return metrics.high_miles;
    case "moderate":
      return metrics.moderate_miles;
    case "low":
      return metrics.low_miles;
    case "unknown":
      return metrics.unknown_miles;
  }
}
