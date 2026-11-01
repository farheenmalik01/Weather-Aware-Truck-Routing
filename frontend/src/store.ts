import { create } from "zustand";

import { analyzeTrip } from "./api";
import type { ExampleTrip } from "./examples";
import { defaultDepartureLocal } from "./format";
import type { Analysis, Place, SampleInterval } from "./types";

interface TripState {
  origin: Place | null;
  destination: Place | null;
  departureLocal: string;
  loadLb: string;
  interval: SampleInterval;
  loading: boolean;
  error: string | null;
  result: Analysis | null;
  selectedRouteId: string | null;
  forecastHour: number;
  showHeatmap: boolean;
  playing: boolean;
  zoomRouteId: string | null;
  setOrigin: (place: Place | null) => void;
  setDestination: (place: Place | null) => void;
  setDepartureLocal: (value: string) => void;
  setLoadLb: (value: string) => void;
  setInterval: (value: SampleInterval) => void;
  selectRoute: (id: string) => void;
  setForecastHour: (hour: number) => void;
  setShowHeatmap: (show: boolean) => void;
  setPlaying: (playing: boolean) => void;
  requestZoom: (id: string) => void;
  clearZoom: () => void;
  applyExample: (example: ExampleTrip) => void;
  submit: () => Promise<void>;
}

let inflight: AbortController | null = null;

export const useTripStore = create<TripState>((set, get) => ({
  origin: null,
  destination: null,
  departureLocal: defaultDepartureLocal(),
  loadLb: "35000",
  interval: 25,
  loading: false,
  error: null,
  result: null,
  selectedRouteId: null,
  forecastHour: 0,
  showHeatmap: true,
  playing: false,
  zoomRouteId: null,
  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  setDepartureLocal: (departureLocal) => set({ departureLocal }),
  setLoadLb: (loadLb) => set({ loadLb }),
  setInterval: (interval) => set({ interval }),
  selectRoute: (selectedRouteId) => set({ selectedRouteId }),
  setForecastHour: (forecastHour) => set({ forecastHour }),
  setShowHeatmap: (showHeatmap) => set({ showHeatmap, playing: showHeatmap ? get().playing : false }),
  setPlaying: (playing) => set({ playing }),
  requestZoom: (zoomRouteId) => set({ zoomRouteId, selectedRouteId: zoomRouteId }),
  clearZoom: () => set({ zoomRouteId: null }),
  applyExample: (example) =>
    set({
      origin: example.origin,
      destination: example.destination,
      loadLb: example.loadLb,
      interval: example.interval,
      error: null,
    }),
  submit: async () => {
    const state = get();
    const problem = validate(state);
    if (problem) {
      set({ error: problem });
      return;
    }
    const origin = state.origin;
    const destination = state.destination;
    if (!origin || !destination) return;

    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    set({ loading: true, error: null, playing: false });
    try {
      const result = await analyzeTrip(
        {
          origin,
          destination,
          departure: new Date(state.departureLocal).toISOString(),
          load_lb: Number(state.loadLb),
          sample_interval_miles: state.interval,
        },
        controller.signal,
      );
      if (inflight !== controller) return;
      const recommended = result.routes.find((route) => route.recommended) ?? result.routes[0];
      set({
        loading: false,
        result,
        selectedRouteId: recommended?.id ?? null,
        forecastHour: 0,
        showHeatmap: true,
        zoomRouteId: null,
      });
    } catch (error) {
      if (inflight !== controller) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      set({
        loading: false,
        error: error instanceof Error ? error.message : "The trip could not be analyzed.",
      });
    }
  },
}));

function validate(state: TripState): string | null {
  if (!state.origin || !state.destination) return "Choose an origin and a destination from the suggestions.";
  const departure = new Date(state.departureLocal);
  if (Number.isNaN(departure.getTime())) return "Enter a departure date and time.";
  const load = Number(state.loadLb);
  if (!Number.isFinite(load) || load < 0 || load > 200_000) return "Enter a load weight between 0 and 200,000 lb.";
  return null;
}
