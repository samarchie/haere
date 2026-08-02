import { describe, expect, it } from "vitest";
import type { Manifest, Scenario } from "../data/manifest";
import { availableCombos, defaultScenario } from "./scenario";

function scenario(
  calendarType: string,
  timeWindow: string,
  complete: boolean,
): Scenario {
  return {
    calendarType,
    timeWindow,
    start: "07:00",
    end: "09:00",
    variants: complete
      ? { baseline: { "50": "a.bin" }, modified: { "50": "b.bin" } }
      : { baseline: { "50": "a.bin" } },
  };
}

const manifest: Manifest = {
  hexagonResolution: 9,
  hexCount: 10,
  percentiles: [50],
  encoding: {
    dtype: "uint8",
    bytesPerValue: 1,
    byteOrder: "little",
    unreachable: 255,
  },
  scenarios: [
    scenario("weekday", "am_peak", true),
    scenario("weekday", "midday", false),
    scenario("saturday", "midday", true),
  ],
};

describe("availableCombos", () => {
  it("marks each combo complete or not", () => {
    const combos = availableCombos(manifest);
    expect(combos).toEqual([
      { calendarType: "weekday", timeWindow: "am_peak", complete: true },
      { calendarType: "weekday", timeWindow: "midday", complete: false },
      { calendarType: "saturday", timeWindow: "midday", complete: true },
    ]);
  });
});

describe("defaultScenario", () => {
  it("prefers weekday am_peak when it is complete", () => {
    expect(defaultScenario(availableCombos(manifest))).toEqual({
      calendarType: "weekday",
      timeWindow: "am_peak",
    });
  });

  it("falls back to the first complete combo otherwise", () => {
    const withoutAmPeak = availableCombos({
      ...manifest,
      scenarios: [
        scenario("weekday", "midday", false),
        scenario("saturday", "midday", true),
      ],
    });
    expect(defaultScenario(withoutAmPeak)).toEqual({
      calendarType: "saturday",
      timeWindow: "midday",
    });
  });

  it("returns null when nothing is complete", () => {
    const noneComplete = availableCombos({
      ...manifest,
      scenarios: [scenario("weekday", "midday", false)],
    });
    expect(defaultScenario(noneComplete)).toBeNull();
  });
});
