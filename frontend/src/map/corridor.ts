import { HEAT_COLORS } from "../risk";

// Web Mercator meters per pixel at the equator, divided by zoom.
const MERCATOR_METERS = 156543.03392;
const METERS_PER_MILE = 1609.344;
const RIBBON_LATITUDE = 37;

// The glow is the soft field around the road. The band is the stronger core.
// Both are a fixed width on the ground. The floor keeps a statewide view
// readable, and the ceiling keeps a close zoom on the highway.
export const GLOW_MILES = 25;
export const GLOW_FLOOR_PX = 28;
export const GLOW_CEILING_PX = 42;
export const BAND_MILES = 8;
export const BAND_FLOOR_PX = 8;
export const BAND_CEILING_PX = 18;
export const COLOR_BLEND_MILES = 8;

const RIBBON_ZOOMS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function milesPerPixel(zoom: number, latitude = RIBBON_LATITUDE): number {
  const meters = (MERCATOR_METERS * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  return meters / METERS_PER_MILE;
}

export function ribbonPixels(
  zoom: number,
  miles: number,
  floor: number,
  ceiling: number,
  latitude = RIBBON_LATITUDE,
): number {
  const geographic = miles / milesPerPixel(zoom, latitude);
  return Math.round(Math.min(ceiling, Math.max(floor, geographic)) * 10) / 10;
}

export function ribbonWidth(miles: number, floor: number, ceiling: number): Array<string | number | string[]> {
  const expression: Array<string | number | string[]> = ["interpolate", ["linear"], ["zoom"]];
  for (const zoom of RIBBON_ZOOMS) expression.push(zoom, ribbonPixels(zoom, miles, floor, ceiling));
  return expression;
}

export function ribbonBlur(): Array<string | number | string[]> {
  const expression: Array<string | number | string[]> = ["interpolate", ["linear"], ["zoom"]];
  for (const zoom of RIBBON_ZOOMS) {
    const glow = ribbonPixels(zoom, GLOW_MILES, GLOW_FLOOR_PX, GLOW_CEILING_PX);
    expression.push(zoom, Math.round(glow * 0.33));
  }
  return expression;
}

export function worseSpanMiles(spans: Array<{ miles: number; startRisk: number; endRisk: number }>): number[] {
  const miles = [0, 0, 0, 0, 0, 0];
  for (const span of spans) {
    const worse = Math.max(span.startRisk, span.endRisk);
    if (worse >= 1 && worse <= 5) miles[worse] += span.miles;
  }
  return miles;
}

export function blendedColor(vertices: Array<{ along: number; risk: number }>, mile: number): string {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (let offset = -COLOR_BLEND_MILES; offset <= COLOR_BLEND_MILES; offset += 1) {
    const risk = riskAtMile(vertices, mile + offset);
    const hex = HEAT_COLORS[risk];
    if (!hex) continue;
    const share = 1 - Math.abs(offset) / (COLOR_BLEND_MILES + 1);
    const [r, g, b] = parseHex(hex);
    red += r * share;
    green += g * share;
    blue += b * share;
    weight += share;
  }
  if (weight === 0) return "";
  return quantizeColor(red / weight, green / weight, blue / weight);
}

function riskAtMile(vertices: Array<{ along: number; risk: number }>, mile: number): number {
  if (vertices.length === 0) return 0;
  let low = 0;
  let high = vertices.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (vertices[mid].along <= mile) low = mid;
    else high = mid - 1;
  }
  return vertices[low]?.risk ?? 0;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function quantizeColor(red: number, green: number, blue: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value / 16) * 16))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
