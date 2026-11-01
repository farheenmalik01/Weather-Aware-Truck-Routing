import type { Place, SampleInterval } from "./types";

export interface ExampleTrip {
  name: string;
  origin: Place;
  destination: Place;
  loadLb: string;
  interval: SampleInterval;
}

export const EXAMPLES: ExampleTrip[] = [
  {
    name: "Dallas → Houston",
    origin: { label: "Dallas, Texas, United States", lat: 32.7767, lon: -96.797 },
    destination: { label: "Houston, Texas, United States", lat: 29.7604, lon: -95.3698 },
    loadLb: "35000",
    interval: 25,
  },
  {
    name: "Denver → Cheyenne",
    origin: { label: "Denver, Colorado, United States", lat: 39.7392, lon: -104.9903 },
    destination: { label: "Cheyenne, Wyoming, United States", lat: 41.14, lon: -104.8202 },
    loadLb: "42000",
    interval: 10,
  },
  {
    name: "Chicago → Detroit",
    origin: { label: "Chicago, Illinois, United States", lat: 41.8781, lon: -87.6298 },
    destination: { label: "Detroit, Michigan, United States", lat: 42.3314, lon: -83.0458 },
    loadLb: "20000",
    interval: 25,
  },
];
