import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

import { addLayers, fitResult, fitRoute, popupNode, syncHeatmap, syncMap } from "../map/layers";
import { useTripStore } from "../store";
import type { Analysis, Place } from "../types";

const STYLE = "https://tiles.openfreemap.org/styles/positron";

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);
  const fittedRef = useRef("");

  const result = useTripStore((state) => state.result);
  const selectedRouteId = useTripStore((state) => state.selectedRouteId);
  const hour = useTripStore((state) => state.forecastHour);
  const showHeatmap = useTripStore((state) => state.showHeatmap);
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
      const state = useTripStore.getState();
      syncMap(map, state.result, state.selectedRouteId, state.forecastHour, state.showHeatmap);
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
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncMap(map, result, selectedRouteId, hour, showHeatmap);
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
  }, [result, selectedRouteId, showHeatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncHeatmap(map, result, hour, showHeatmap);
  }, [hour, result, showHeatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !zoomRouteId || !result) return;
    const route = result.routes.find((item) => item.id === zoomRouteId);
    if (route) fitRoute(map, route);
    useTripStore.getState().clearZoom();
  }, [zoomRouteId, result]);

  return (
    <div className="map-frame">
      <div ref={containerRef} className="map" />
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
      if (typeof routeId === "string" && routeId) useTripStore.getState().selectRoute(routeId);
      new maplibregl.Popup({ closeButton: true, maxWidth: "280px", className: "wx-popup" })
        .setLngLat(event.lngLat)
        .setDOMContent(popupNode(checkpoint))
        .addTo(map);
      return;
    }
    const route = map.queryRenderedFeatures(event.point, { layers: ["routes-line"] })[0];
    const routeId = route?.properties?.id;
    if (typeof routeId === "string") useTripStore.getState().selectRoute(routeId);
  });
  for (const layer of ["routes-line", "checkpoints"]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
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
