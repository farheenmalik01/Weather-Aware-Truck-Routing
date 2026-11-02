import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";

import { formatEta, formatRate, formatWind } from "../format";
import { HEAT_COLORS, RISK_COLORS, RISK_LABELS } from "../risk";
import type { Analysis, Checkpoint, RouteOption } from "../types";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function addLayers(map: MapLibreMap): void {
  map.addSource("corridor", { type: "geojson", data: EMPTY });
  map.addSource("routes", { type: "geojson", data: EMPTY });
  map.addSource("checkpoints", { type: "geojson", data: EMPTY });

  map.addLayer({
    id: "corridor-heat",
    type: "heatmap",
    source: "corridor",
    paint: heatPaint(false),
  });

  map.addLayer({
    id: "routes-casing",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["==", ["get", "selected"], 1], 8, 6], 12, ["case", ["==", ["get", "selected"], 1], 13, 9]],
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.9],
    },
  });

  map.addLayer({
    id: "routes-line",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["==", ["get", "selected"], 1], 5, 3.5], 12, ["case", ["==", ["get", "selected"], 1], 8, 5.5]],
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.9],
    },
  });

  map.addLayer({
    id: "checkpoints",
    type: "circle",
    source: "checkpoints",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["==", ["get", "selected"], 1], 5.5, 4], 11, ["case", ["==", ["get", "selected"], 1], 8, 5.5]],
      "circle-color": [
        "match",
        ["get", "risk"],
        "low",
        RISK_COLORS.low,
        "moderate",
        RISK_COLORS.moderate,
        "high",
        RISK_COLORS.high,
        "severe",
        RISK_COLORS.severe,
        "no_travel",
        RISK_COLORS.no_travel,
        "#94a3b8",
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.7],
    },
  });

}

export function syncMap(
  map: MapLibreMap,
  result: Analysis | null,
  selectedRouteId: string | null,
  hour: number,
  showHeatmap: boolean,
  playing = false,
): void {
  setData(map, "routes", result ? routeCollection(result, selectedRouteId) : EMPTY);
  setData(map, "checkpoints", result ? checkpointCollection(result, selectedRouteId) : EMPTY);
  syncHeatmap(map, result, hour, showHeatmap, selectedRouteId, playing);
}

export function syncHeatmap(
  map: MapLibreMap,
  result: Analysis | null,
  hour: number,
  showHeatmap: boolean,
  _selectedRouteId: string | null,
  playing = false,
): void {
  setData(map, "corridor", result && showHeatmap ? heatPoints(result, hour) : EMPTY);
  if (!map.getLayer("corridor-heat")) return;
  map.setLayoutProperty("corridor-heat", "visibility", showHeatmap && result ? "visible" : "none");
  const paint = heatPaint(playing);
  map.setPaintProperty("corridor-heat", "heatmap-weight", paint["heatmap-weight"]);
  map.setPaintProperty("corridor-heat", "heatmap-radius", paint["heatmap-radius"]);
  map.setPaintProperty("corridor-heat", "heatmap-opacity", paint["heatmap-opacity"]);
  map.setPaintProperty("corridor-heat", "heatmap-intensity", paint["heatmap-intensity"]);
  map.setPaintProperty("corridor-heat", "heatmap-color", paint["heatmap-color"]);
}

export function playheadLngLat(result: Analysis, selectedRouteId: string | null, hour: number): [number, number] | null {
  const route =
    result.routes.find((item) => item.id === selectedRouteId) ??
    result.routes.find((item) => item.recommended) ??
    result.routes[0];
  if (!route || route.geometry.length < 2) return null;
  const span = Math.max(result.hour_count - 1, 1);
  return pointAlong(route.geometry, hour / span);
}

export function fitResult(map: MapLibreMap, result: Analysis): void {
  const coordinates = result.routes.flatMap((route) => route.geometry);
  fitCoordinates(map, coordinates);
}

export function fitRoute(map: MapLibreMap, route: RouteOption): void {
  fitCoordinates(map, route.geometry);
}

export function popupNode(feature: MapGeoJSONFeature): HTMLElement {
  const props = feature.properties ?? {};
  const root = document.createElement("div");
  root.className = "popup";
  const risk = String(props.risk ?? "unknown");
  const title = document.createElement("strong");
  title.textContent = String(props.riskLabel ?? "Checkpoint");
  title.style.color = RISK_COLORS[risk as keyof typeof RISK_COLORS] ?? "#10283f";
  root.append(title);

  addRow(root, "Mile", String(props.mile ?? ""));
  addRow(root, "ETA", String(props.eta ?? ""));
  addRow(root, "Wind", String(props.wind ?? ""));
  addRow(root, "Rain", String(props.rain ?? ""));
  addRow(root, "Snow", String(props.snow ?? ""));
  const note = String(props.note ?? "");
  if (note) {
    const extra = document.createElement("p");
    extra.textContent = note;
    root.append(extra);
  }
  return root;
}

function heatPaint(playing: boolean) {
  // One density field, as in the MapLibre heatmap example: weight carries the
  // risk, and the ramp starts transparent so the edge fades. The radius is
  // wide enough for samples miles apart to merge into one cloud. Colors follow
  // a weather-radar scale so the core matches the legend.
  const radius = (
    playing
      ? ["interpolate", ["linear"], ["zoom"], 4, 40, 7, 64, 10, 86, 13, 108]
      : ["interpolate", ["linear"], ["zoom"], 4, 32, 7, 52, 10, 72, 13, 92]
  ) as ExpressionSpecification;
  const intensity = playing ? 1.35 : 1.2;
  const colorRamp = [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    "rgba(31,122,69,0)",
    0.04,
    withAlpha(HEAT_COLORS[1], 0.9),
    0.1,
    HEAT_COLORS[1],
    0.7,
    HEAT_COLORS[1],
    0.8,
    HEAT_COLORS[2],
    0.88,
    HEAT_COLORS[3],
    0.94,
    HEAT_COLORS[4],
    1,
    HEAT_COLORS[5],
  ] as ExpressionSpecification;
  const weight = ["interpolate", ["linear"], ["get", "risk"], 1, 0.2, 2, 0.55, 3, 0.7, 4, 0.84, 5, 1] as ExpressionSpecification;
  return {
    "heatmap-weight": weight,
    "heatmap-intensity": intensity,
    "heatmap-radius": radius,
    "heatmap-opacity": 1,
    "heatmap-color": colorRamp,
  };
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function heatPoints(result: Analysis, hour: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: result.heatmap.flatMap((point) => {
      const risk = point.risks[hour] ?? 0;
      if (risk <= 0) return [];
      return [
        {
          type: "Feature" as const,
          properties: { risk },
          geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
        },
      ];
    }),
  };
}

function pointAlong(coordinates: number[][], fraction: number): [number, number] {
  const clamped = Math.min(1, Math.max(0, fraction));
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const length = milesBetween(coordinates[index - 1], coordinates[index]);
    lengths.push(length);
    total += length;
  }
  let remaining = total * clamped;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const start = coordinates[index];
      const end = coordinates[index + 1];
      const t = length === 0 ? 0 : remaining / length;
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    }
    remaining -= length;
  }
  const last = coordinates[coordinates.length - 1];
  return [last[0], last[1]];
}

function milesBetween(start: number[], end: number[]): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRad(start[1]);
  const lat2 = toRad(end[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(end[0] - start[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeCollection(result: Analysis, selectedRouteId: string | null): GeoJSON.FeatureCollection {
  const selected = result.routes.find((route) => route.id === selectedRouteId) ?? result.routes[0];
  const ordered = [...result.routes].sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id));
  return {
    type: "FeatureCollection",
    features: ordered.map((route) => ({
      type: "Feature",
      properties: {
        id: route.id,
        color: route.color,
        selected: route.id === selected?.id ? 1 : 0,
        name: route.name,
      },
      geometry: { type: "LineString", coordinates: route.geometry },
    })),
  };
}

function checkpointCollection(result: Analysis, selectedRouteId: string | null): GeoJSON.FeatureCollection {
  const selected = selectedRouteId ?? result.routes[0]?.id;
  return {
    type: "FeatureCollection",
    features: result.routes.flatMap((route) =>
      route.checkpoints.map((point) => ({
        type: "Feature" as const,
        properties: checkpointProperties(point, route.id, route.id === selected),
        geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] },
      })),
    ),
  };
}

function checkpointProperties(
  point: Checkpoint,
  routeId: string,
  selected: boolean,
): Record<string, string | number | boolean> {
  const risk = point.risk ?? "unknown";
  const notes = [
    point.conditions,
    point.temperature_f !== null ? `${Math.round(point.temperature_f)}°F` : "",
    point.wind_gust_mph !== null ? `Gusts ${Math.round(point.wind_gust_mph)} mph` : "",
    point.load_adjusted ? "Load rule raised the wind risk" : "",
    point.forecast_clamped ? "Nearest forecast hour" : "",
  ].filter(Boolean);
  return {
    routeId,
    risk,
    riskLabel: point.risk ? RISK_LABELS[point.risk] : "Unknown",
    selected: selected ? 1 : 0,
    mile: point.mile.toFixed(1),
    eta: formatEta(point.eta),
    wind: formatWind(point.wind_mph),
    rain: formatRate(point.rain_in_hr, "in/hr"),
    snow: formatRate(point.snow_in_hr, "in/hr"),
    note: notes.join(" · "),
  };
}

function setData(map: MapLibreMap, sourceId: string, data: GeoJSON.FeatureCollection): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function fitCoordinates(map: MapLibreMap, coordinates: number[][]): void {
  if (coordinates.length === 0) return;
  let minLon = coordinates[0][0];
  let maxLon = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];
  for (const [lon, lat] of coordinates) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: { top: 72, right: 56, bottom: 150, left: 56 }, duration: 700, maxZoom: 9 },
  );
}

function addRow(root: HTMLElement, label: string, value: string): void {
  const row = document.createElement("div");
  const name = document.createElement("span");
  name.textContent = label;
  const reading = document.createElement("b");
  reading.textContent = value;
  row.append(name, reading);
  root.append(row);
}
