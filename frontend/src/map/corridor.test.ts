import { describe, expect, it } from "vitest";

import { HEAT_COLORS } from "../risk";
import {
  BAND_CEILING_PX,
  BAND_FLOOR_PX,
  BAND_MILES,
  COLOR_BLEND_MILES,
  GLOW_CEILING_PX,
  GLOW_FLOOR_PX,
  GLOW_MILES,
  blendedColor,
  ribbonPixels,
  worseSpanMiles,
} from "./corridor";

const low = HEAT_COLORS[1];
const moderate = HEAT_COLORS[2];

describe("ribbon width", () => {
  it("uses the ground width, and stays inside the floor and ceiling", () => {
    const overview = ribbonPixels(5, GLOW_MILES, GLOW_FLOOR_PX, GLOW_CEILING_PX);
    const trip = ribbonPixels(7, GLOW_MILES, GLOW_FLOOR_PX, GLOW_CEILING_PX);
    const close = ribbonPixels(12, GLOW_MILES, GLOW_FLOOR_PX, GLOW_CEILING_PX);
    expect(overview).toBe(GLOW_FLOOR_PX);
    expect(trip).toBeGreaterThan(overview);
    expect(trip).toBeLessThanOrEqual(GLOW_CEILING_PX);
    expect(close).toBe(GLOW_CEILING_PX);
  });

  it("keeps the core narrower than the glow at every zoom", () => {
    for (const zoom of [5, 7, 9, 12]) {
      const glow = ribbonPixels(zoom, GLOW_MILES, GLOW_FLOOR_PX, GLOW_CEILING_PX);
      const band = ribbonPixels(zoom, BAND_MILES, BAND_FLOOR_PX, BAND_CEILING_PX);
      expect(band).toBeLessThan(glow);
    }
  });
});

describe("color blend", () => {
  const vertices = [
    { along: 0, risk: 1 },
    { along: 30, risk: 1 },
    { along: 30, risk: 2 },
    { along: 60, risk: 2 },
  ];

  it("keeps a solid risk away from the change", () => {
    expect(blendedColor(vertices, 0)).toBe(quantize(low));
    expect(blendedColor(vertices, 60)).toBe(quantize(moderate));
  });

  it("mixes the two risks across the change", () => {
    const atChange = blendedColor(vertices, 30);
    expect(atChange).not.toBe(quantize(low));
    expect(atChange).not.toBe(quantize(moderate));
    const before = blendedColor(vertices, 30 - COLOR_BLEND_MILES);
    const after = blendedColor(vertices, 30 + COLOR_BLEND_MILES);
    expect(before).not.toBe(after);
  });
});

describe("worse endpoint miles", () => {
  it("counts the span as the worse of its two ends", () => {
    const miles = worseSpanMiles([
      { miles: 10, startRisk: 1, endRisk: 2 },
      { miles: 4, startRisk: 1, endRisk: 1 },
    ]);
    expect(miles[2]).toBe(10);
    expect(miles[1]).toBe(4);
  });
});

function quantize(hex: string): string {
  const value = hex.replace("#", "");
  const channel = (start: number) =>
    Math.max(0, Math.min(255, Math.round(Number.parseInt(value.slice(start, start + 2), 16) / 16) * 16))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}
