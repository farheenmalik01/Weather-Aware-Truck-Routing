import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";

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
    type: "line",
    source: "corridor",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        ["case", ["==", ["get", "selected"], 1], 14, 8],
        6,
        ["case", ["==", ["get", "selected"], 1], 22, 12],
        9,
        ["case", ["==", ["get", "selected"], 1], 30, 16],
      ],
      "line-blur": 1.4,
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 0.62, 0.28],
      "line-color": [
        "match",
        ["get", "risk"],
        1,
        HEAT_COLORS[1],
        2,
        HEAT_COLORS[2],
        3,
        HEAT_COLORS[3],
        4,
        HEAT_COLORS[4],
        5,
        HEAT_COLORS[5],
        "rgba(0,0,0,0)",
      ],
    },
  });

  map.addLayer({
    id: "routes-casing",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["==", ["get", "selected"], 1], 8, 5], 12, ["case", ["==", ["get", "selected"], 1], 12, 7]],
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 0.95, 0.7],
    },
  });

  map.addLayer({
    id: "routes-line",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["==", ["get", "selected"], 1], 4.5, 2.2], 12, ["case", ["==", ["get", "selected"], 1], 7, 3.5]],
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.55],
    },
  });

  map.addLayer({
    id: "checkpoints",
    type: "circle",
    source: "checkpoints",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["==", ["get", "selected"], 1], 4.5, 3], 10, ["case", ["==", ["get", "selected"], 1], 7, 4.5]],
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
      "circle-stroke-width": 1.5,
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
): void {
  setData(map, "routes", result ? routeCollection(result, selectedRouteId) : EMPTY);
  setData(map, "checkpoints", result ? checkpointCollection(result, selectedRouteId) : EMPTY);
  syncHeatmap(map, result, hour, showHeatmap, selectedRouteId);
}

export function syncHeatmap(
  map: MapLibreMap,
  result: Analysis | null,
  hour: number,
  showHeatmap: boolean,
  selectedRouteId: string | null,
): void {
  setData(map, "corridor", result && showHeatmap ? heatmapCollection(result, hour, selectedRouteId) : EMPTY);
  if (map.getLayer("corridor-heat")) {
    map.setLayoutProperty("corridor-heat", "visibility", showHeatmap && result ? "visible" : "none");
  }
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

function heatmapCollection(result: Analysis, hour: number, selectedRouteId: string | null): GeoJSON.FeatureCollection {
  const index = heatIndex(
    result.heatmap.map((point) => ({
      lon: point.lon,
      lat: point.lat,
      risk: point.risks[hour] ?? 0,
    })),
  );
  const selected =
    result.routes.find((route) => route.id === selectedRouteId)?.id ??
    result.routes.find((route) => route.recommended)?.id ??
    result.routes[0]?.id;
  const ordered = [...result.routes].sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
  return {
    type: "FeatureCollection",
    features: ordered.flatMap((route) => ribbon(route, index, route.id === selected)),
  };
}

function ribbon(route: RouteOption, index: HeatIndex, selected: boolean): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const coordinates = route.geometry;
  for (let i = 1; i < coordinates.length; i += 1) {
    for (const [start, end] of pieces(coordinates[i - 1], coordinates[i], 6)) {
      const risk = nearestRisk(index, (start[0] + end[0]) / 2, (start[1] + end[1]) / 2);
      if (risk === 0) continue;
      features.push({
        type: "Feature",
        properties: { risk, selected: selected ? 1 : 0 },
        geometry: { type: "LineString", coordinates: [start, end] },
      });
    }
  }
  return features;
}

interface HeatSample {
  lon: number;
  lat: number;
  risk: number;
}

interface HeatIndex {
  cells: Map<string, HeatSample[]>;
}

function heatIndex(samples: HeatSample[]): HeatIndex {
  const cells = new Map<string, HeatSample[]>();
  for (const sample of samples) {
    const key = cellKey(sample.lon, sample.lat);
    const bucket = cells.get(key);
    if (bucket) bucket.push(sample);
    else cells.set(key, [sample]);
  }
  return { cells };
}

function nearestRisk(index: HeatIndex, lon: number, lat: number): number {
  const originX = Math.floor(lon / HEAT_CELL);
  const originY = Math.floor(lat / HEAT_CELL);
  let best = 0;
  let bestDistance = 0.12 * 0.12;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = index.cells.get(`${originX + dx}:${originY + dy}`);
      if (!bucket) continue;
      for (const sample of bucket) {
        const distance = (sample.lon - lon) ** 2 + (sample.lat - lat) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = sample.risk;
        }
      }
    }
  }
  return best;
}

function pieces(start: number[], end: number[], stepMiles: number): number[][][] {
  const miles = milesBetween(start, end);
  const count = Math.max(1, Math.ceil(miles / stepMiles));
  const segments: number[][][] = [];
  for (let index = 0; index < count; index += 1) {
    const from = index / count;
    const to = (index + 1) / count;
    segments.push([
      [start[0] + (end[0] - start[0]) * from, start[1] + (end[1] - start[1]) * from],
      [start[0] + (end[0] - start[0]) * to, start[1] + (end[1] - start[1]) * to],
    ]);
  }
  return segments;
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

const HEAT_CELL = 0.2;

function cellKey(lon: number, lat: number): string {
  return `${Math.floor(lon / HEAT_CELL)}:${Math.floor(lat / HEAT_CELL)}`;
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
