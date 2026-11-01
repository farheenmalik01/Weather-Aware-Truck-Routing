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
    type: "circle",
    source: "corridor",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 12, 6, 20, 8, 30, 11, 42],
      "circle-blur": 0.78,
      "circle-opacity": 0.4,
      "circle-color": [
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
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["get", "selected"], 8, 5], 12, ["case", ["get", "selected"], 12, 7]],
      "line-opacity": ["case", ["get", "selected"], 0.95, 0.7],
    },
  });

  map.addLayer({
    id: "routes-line",
    type: "line",
    source: "routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["get", "selected"], 4.5, 2.2], 12, ["case", ["get", "selected"], 7, 3.5]],
      "line-opacity": ["case", ["get", "selected"], 1, 0.55],
    },
  });

  map.addLayer({
    id: "checkpoints",
    type: "circle",
    source: "checkpoints",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["get", "selected"], 4.5, 3], 10, ["case", ["get", "selected"], 7, 4.5]],
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
      "circle-opacity": ["case", ["get", "selected"], 1, 0.7],
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
  syncHeatmap(map, result, hour, showHeatmap);
}

export function syncHeatmap(
  map: MapLibreMap,
  result: Analysis | null,
  hour: number,
  showHeatmap: boolean,
): void {
  setData(map, "corridor", result && showHeatmap ? heatmapCollection(result, hour) : EMPTY);
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

function heatmapCollection(result: Analysis, hour: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: result.heatmap.map((point) => ({
      type: "Feature",
      properties: { risk: point.risks[hour] ?? 0 },
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
    })),
  };
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
    { padding: 56, duration: 700, maxZoom: 11 },
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
