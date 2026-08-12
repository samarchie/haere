import { describe, expect, it } from "vitest";
import type { Manifest } from "../data/manifest";
import { availableCombos, defaultScenario } from "./scenarioDefaults";

const manifest: Manifest = {
  hexagonResolution: 8,
  hexCount: 10,
  percentiles: [25, 50, 75],
  encoding: {
    dtype: "uint16",
    bytesPerValue: 2,
    byteOrder: "little",
    unreachable: 65535,
  },
  scenarios: [
    {
      calendarType: "weekday",
      timeWindow: "am_peak",
      start: "07:00",
      end: "09:00",
      variants: {
        baseline: { "25": "a", "50": "b", "75": "c" },
        modified: { "25": "d", "50": "e", "75": "f" },
      },
    },
  ],
};

describe("availableCombos", () => {
  it("marks a fully-populated scenario as complete", () => {
    expect(availableCombos(manifest)).toEqual([
      { calendarType: "weekday", timeWindow: "am_peak", complete: true },
    ]);
  });
});

describe("defaultScenario", () => {
  it("prefers weekday/am_peak when complete", () => {
    expect(defaultScenario(availableCombos(manifest))).toEqual({
      calendarType: "weekday",
      timeWindow: "am_peak",
    });
  });

  it("returns null when nothing is complete", () => {
    expect(
      defaultScenario([
        { calendarType: "weekday", timeWindow: "am_peak", complete: false },
      ]),
    ).toBeNull();
  });
});
