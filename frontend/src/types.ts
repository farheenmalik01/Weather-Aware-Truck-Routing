export interface Place {
  label: string;
  lat: number;
  lon: number;
}

export type SampleInterval = 10 | 25 | 50;

export type RiskName = "low" | "moderate" | "high" | "severe" | "no_travel";

export interface Checkpoint {
  mile: number;
  lat: number;
  lon: number;
  eta: string;
  wind_mph: number | null;
  wind_gust_mph: number | null;
  rain_in_hr: number | null;
  snow_in_hr: number | null;
  temperature_f: number | null;
  conditions: string | null;
  wind_risk: RiskName | null;
  rain_risk: RiskName | null;
  snow_risk: RiskName | null;
  risk: RiskName | null;
  load_adjusted: boolean;
  forecast_clamped: boolean;
}

export interface RouteMetrics {
  no_travel_miles: number;
  severe_miles: number;
  high_miles: number;
  moderate_miles: number;
  low_miles: number;
  unknown_miles: number;
  average_risk: number | null;
  total_miles: number;
}

export interface RouteOption {
  id: string;
  name: string;
  summary: string;
  color: string;
  rank: number;
  recommended: boolean;
  blocked: boolean;
  distance_miles: number;
  duration_seconds: number;
  geometry: number[][];
  checkpoints: Checkpoint[];
  metrics: RouteMetrics;
}

export interface HeatPoint {
  lat: number;
  lon: number;
  risks: number[];
}

export interface Analysis {
  origin: Place;
  destination: Place;
  departure: string;
  load_lb: number;
  sample_interval_miles: SampleInterval;
  hour_count: number;
  all_routes_blocked: boolean;
  recommendation_reason: string;
  ranking_criteria: string[];
  warnings: string[];
  routes: RouteOption[];
  heatmap: HeatPoint[];
}

export interface AnalyzeRequest {
  origin: Place;
  destination: Place;
  departure: string;
  load_lb: number;
  sample_interval_miles: SampleInterval;
}
