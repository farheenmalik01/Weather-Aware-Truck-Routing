import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import { forecastStamp } from "../format";
import { hourSummary } from "../risk";
import { PLAY_STEP_MS } from "./ForecastSlider";
import { addLayers, fitResult, fitRoute, playheadLngLat, popupNode, syncHeatmap, syncMap } from "../map/layers";
import { useTripStore } from "../store";
import type { Analysis, Place } from "../types";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<Marker[]>([]);
  const playheadRef = useRef<Marker | null>(null);
  const fittedRef = useRef("");

  const result = useTripStore((state) => state.result);
  const selectedRouteId = useTripStore((state) => state.selectedRouteId);
  const hour = useTripStore((state) => state.forecastHour);
  const showHeatmap = useTripStore((state) => state.showHeatmap);
  const playing = useTripStore((state) => state.playing);
  const loading = useTripStore((state) => state.loading);
  const zoomRouteId = useTripStore((state) => state.zoomRouteId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-98.5, 39.2],
      zoom: 3.5,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      addLayers(map);
      readyRef.current = true;
      setMapReady(true);
      const state = useTripStore.getState();
      syncMap(map, state.result, state.selectedRouteId, state.forecastHour, state.showHeatmap, state.playing);
      if (state.result) {
        markersRef.current = placePins(map, markersRef.current, state.result);
        fitResult(map, state.result);
        fittedRef.current = resultKey(state.result);
      }
      bindPointer(map);
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    mapRef.current = map;
    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      playheadRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncMap(map, result, selectedRouteId, hour, showHeatmap, playing);
    if (!result) {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      fittedRef.current = "";
      return;
    }
    const key = resultKey(result);
    if (fittedRef.current !== key) {
      fittedRef.current = key;
      markersRef.current = placePins(map, markersRef.current, result);
      fitResult(map, result);
    }
    // Hour changes repaint only the corridor, in the effect below.
  }, [result, selectedRouteId, showHeatmap, playing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncHeatmap(map, result, hour, showHeatmap, selectedRouteId, playing);
    if (!result || !showHeatmap) {
      playheadRef.current?.remove();
      playheadRef.current = null;
      return;
    }
    let frame = 0;
    const place = (at: number) => {
      const lngLat = playheadLngLat(result, selectedRouteId, at);
      if (!lngLat) return;
      if (!playheadRef.current) {
        const dot = document.createElement("div");
        dot.className = "playhead";
        playheadRef.current = new maplibregl.Marker({ element: dot }).setLngLat(lngLat).addTo(map);
      } else {
        playheadRef.current.setLngLat(lngLat);
      }
      playheadRef.current.getElement().classList.toggle("playing", playing);
    };
    place(hour);
    if (!playing || hour >= result.hour_count - 1) return;
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / PLAY_STEP_MS);
      place(hour + t);
      if (t < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [hour, result, showHeatmap, selectedRouteId, playing, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !zoomRouteId || !result) return;
    const route = result.routes.find((item) => item.id === zoomRouteId);
    if (route) fitRoute(map, route, result.routes);
    useTripStore.getState().clearZoom();
  }, [zoomRouteId, result]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="map" />
      {result && showHeatmap && (
        <div key={hour} className={`hour-badge${playing ? " playing" : ""}`}>
          <strong>+{hour}h</strong>
          <span>{hourSummary(result.heatmap.map((point) => point.risks[hour] ?? 0))}</span>
          <span>{forecastStamp(result.departure, hour)}</span>
        </div>
      )}
      {loading && <div className="map-status">Sampling weather along the routes…</div>}
      {!result && !loading && (
        <div className="map-hint">
          <strong>The corridor shows up here</strong>
          <span>Compare a trip to draw the routes, checkpoints, and forecast.</span>
        </div>
      )}
    </div>
  );
}

function bindPointer(map: MapLibreMap) {
  map.on("click", (event) => {
    const checkpoint = map.queryRenderedFeatures(event.point, { layers: ["checkpoints"] })[0];
    if (checkpoint) {
      const routeId = checkpoint.properties?.routeId;
      if (typeof routeId === "string" && routeId) focusRoute(routeId);
      new maplibregl.Popup({ closeButton: true, maxWidth: "280px", className: "wx-popup" })
        .setLngLat(event.lngLat)
        .setDOMContent(popupNode(checkpoint))
        .addTo(map);
      return;
    }
    const hits = map.queryRenderedFeatures(event.point, { layers: ["routes-line", "routes-casing"] });
    const ids: string[] = [];
    for (const hit of hits) {
      const id = hit.properties?.id;
      if (typeof id === "string" && !ids.includes(id)) ids.push(id);
    }
    if (ids.length === 0) return;
    const current = useTripStore.getState().selectedRouteId;
    focusRoute(ids.find((id) => id !== current) ?? ids[0]);
  });
  for (const layer of ["routes-line", "routes-casing", "checkpoints"]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

function focusRoute(routeId: string) {
  const state = useTripStore.getState();
  if (state.selectedRouteId === routeId) return;
  state.requestZoom(routeId);
}

function resultKey(result: Analysis): string {
  return [
    result.departure,
    result.load_lb,
    result.sample_interval_miles,
    result.origin.lat,
    result.origin.lon,
    result.destination.lat,
    result.destination.lon,
  ].join("|");
}

function placePins(map: MapLibreMap, existing: Marker[], result: Analysis): Marker[] {
  existing.forEach((marker) => marker.remove());
  return [...pin(map, result.origin, "origin"), ...pin(map, result.destination, "destination")];
}

function pin(map: MapLibreMap, place: Place, kind: "origin" | "destination"): Marker[] {
  const dot = document.createElement("div");
  dot.className = `pin pin-${kind}`;
  const label = document.createElement("div");
  label.className = "pin-label";
  label.textContent = place.label.split(",")[0] ?? place.label;
  return [
    new maplibregl.Marker({ element: dot }).setLngLat([place.lon, place.lat]).addTo(map),
    new maplibregl.Marker({ element: label, anchor: "top", offset: [0, 8] }).setLngLat([place.lon, place.lat]).addTo(map),
  ];
}
