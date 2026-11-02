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
    id: "corridor-band",
    type: "line",
    source: "corridor",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, 10, 7, 16, 9, 22, 12, 28],
      "line-opacity": 0.82,
      "line-blur": 0.5,
    },
  });

  map.addLayer({
    id: "routes-casing",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["==", ["get", "selected"], 1], 8, 6], 12, ["case", ["==", ["get", "selected"], 1], 13, 9]],
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.35],
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
      "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.4],
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
  selectedRouteId: string | null,
  playing = false,
): void {
  const layer = map.getLayer("corridor-band");
  if (layer) map.setLayoutProperty("corridor-band", "visibility", showHeatmap && result ? "visible" : "none");
  setData(map, "corridor", result && showHeatmap ? corridorLines(result, hour, selectedRouteId) : EMPTY);
  void playing;
}

export function corridorMiles(result: Analysis, selectedRouteId: string | null, hour: number): number[] {
  const miles = [0, 0, 0, 0, 0, 0];
  const route = focusedRoute(result, selectedRouteId);
  if (!route || route.geometry.length < 2) return miles;
  const samples = samplesOnRoute(result, route, hour);
  let previous = route.geometry[0];
  let previousRisk = nearestRisk(previous[0], previous[1], samples);
  for (let index = 1; index < route.geometry.length; index += 1) {
    const next = route.geometry[index];
    const risk = nearestRisk(next[0], next[1], samples);
    const worse = Math.max(previousRisk, risk);
    if (worse >= 1 && worse <= 5) miles[worse] += milesBetween(previous, next);
    previous = next;
    previousRisk = risk;
  }
  return miles;
}

export function playheadLngLat(result: Analysis, selectedRouteId: string | null, hour: number): [number, number] | null {
  const route = focusedRoute(result, selectedRouteId);
  if (!route || route.geometry.length < 2) return null;
  const span = Math.max(result.hour_count - 1, 1);
  return pointAlong(route.geometry, hour / span);
}

export function fitResult(map: MapLibreMap, result: Analysis): void {
  const coordinates = result.routes.flatMap((route) => route.geometry);
  fitCoordinates(map, coordinates);
}

export function fitRoute(map: MapLibreMap, route: RouteOption, routes: RouteOption[]): void {
  fitCoordinates(map, distinctiveStretch(route, routes), true);
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

const RIBBON_SAMPLE_MILES = 8;

function focusedRoute(result: Analysis, selectedRouteId: string | null): RouteOption | undefined {
  return (
    result.routes.find((item) => item.id === selectedRouteId) ??
    result.routes.find((item) => item.recommended) ??
    result.routes[0]
  );
}

function corridorLines(result: Analysis, hour: number, selectedRouteId: string | null): GeoJSON.FeatureCollection {
  const route = focusedRoute(result, selectedRouteId);
  if (!route) return EMPTY;
  const samples = samplesOnRoute(result, route, hour);
  const features: GeoJSON.Feature[] = [];
  let risk = -1;
  let coordinates: number[][] = [];
  const flush = () => {
    if (risk > 0 && coordinates.length >= 2) {
      features.push({
        type: "Feature",
        properties: { risk, color: HEAT_COLORS[risk] ?? "#64748b" },
        geometry: { type: "LineString", coordinates: coordinates.slice() },
      });
    }
  };
  for (const coord of route.geometry) {
    const next = nearestRisk(coord[0], coord[1], samples);
    if (next !== risk) {
      flush();
      const join = coordinates.length > 0 ? coordinates[coordinates.length - 1] : coord;
      coordinates = next > 0 ? [join, coord] : [];
      risk = next;
    } else if (risk > 0) {
      coordinates.push(coord);
    }
  }
  flush();
  return { type: "FeatureCollection", features };
}

function samplesOnRoute(
  result: Analysis,
  route: RouteOption,
  hour: number,
): Array<{ lon: number; lat: number; risk: number }> {
  return result.heatmap.flatMap((point) => {
    const risk = point.risks[hour] ?? 0;
    if (risk <= 0) return [];
    if (nearestMiles([point.lon, point.lat], route.geometry) > RIBBON_SAMPLE_MILES) return [];
    return [{ lon: point.lon, lat: point.lat, risk }];
  });
}

function nearestRisk(
  lon: number,
  lat: number,
  samples: Array<{ lon: number; lat: number; risk: number }>,
): number {
  let best = RIBBON_SAMPLE_MILES;
  let risk = 0;
  for (const sample of samples) {
    const span = Math.max(Math.abs(sample.lon - lon), Math.abs(sample.lat - lat)) * 69;
    if (span >= best) continue;
    const miles = milesBetween([lon, lat], [sample.lon, sample.lat]);
    if (miles < best) {
      best = miles;
      risk = sample.risk;
    }
  }
  return risk;
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

function fitCoordinates(map: MapLibreMap, coordinates: number[][], tight = false): void {
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
    {
      padding: tight
        ? { top: 80, right: 48, bottom: 120, left: 48 }
        : { top: 72, right: 56, bottom: 150, left: 56 },
      duration: 700,
      maxZoom: tight ? 12 : 9,
    },
  );
}

const SAME_ROAD_MILES = 0.4;

function distinctiveStretch(route: RouteOption, routes: RouteOption[]): number[][] {
  const line = route.geometry;
  const others = routes.filter((item) => item.id !== route.id).flatMap((item) => item.geometry);
  if (others.length === 0 || line.length < 2) return line;
  const separation = line.map((coord) => nearestMiles(coord, others));
  let farthest = 0;
  for (let index = 1; index < separation.length; index += 1) {
    if (separation[index] > separation[farthest]) farthest = index;
  }
  if (separation[farthest] < SAME_ROAD_MILES) return line;
  const apart = Math.max(SAME_ROAD_MILES, separation[farthest] / 2);
  const chosen = [line[farthest]];
  for (let index = farthest; index > 0 && separation[index - 1] >= apart; index -= 1) chosen.push(line[index - 1]);
  for (let index = farthest; index < line.length - 1 && separation[index + 1] >= apart; index += 1) chosen.push(line[index + 1]);
  return chosen.length >= 2 ? chosen : line;
}

function nearestMiles(coord: number[], others: number[][]): number {
  let best = Infinity;
  for (const other of others) {
    const span = Math.max(Math.abs(other[0] - coord[0]), Math.abs(other[1] - coord[1]));
    if (span * 69 > 3) continue;
    const miles = milesBetween(coord, other);
    if (miles < best) best = miles;
  }
  return best;
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
