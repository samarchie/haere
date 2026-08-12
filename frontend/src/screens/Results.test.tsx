import { describe, expect, it } from "vitest";
import {
  deltaFor,
  formatDelta,
  formatRange,
  readPercentileMinutes,
} from "./Results";

describe("readPercentileMinutes", () => {
  it("reads a value below the unreachable sentinel", () => {
    const row = new Uint8Array([10]);
    const minutes = readPercentileMinutes({ 50: row }, 0, 1, 255);
    expect(minutes).toEqual({ p25: null, p50: 10, p75: null });
  });
});

describe("formatRange", () => {
  it("shows a dash when unreachable", () => {
    expect(formatRange({ p25: null, p50: null, p75: null })).toBe("—");
  });

  it("shows a typical-time range when percentiles are available", () => {
    expect(formatRange({ p25: 10, p50: 15, p75: 20 })).toBe(
      "10–20 min (typically 15)",
    );
  });
});

describe("deltaFor", () => {
  it("computes the p50 delta", () => {
    expect(
      deltaFor(
        { p25: null, p50: 10, p75: null },
        { p25: null, p50: 15, p75: null },
      ),
    ).toBe(5);
  });
});

describe("formatDelta", () => {
  it("reports newly unreachable as worse", () => {
    expect(
      formatDelta(
        null,
        { p25: null, p50: 10, p75: null },
        { p25: null, p50: null, p75: null },
      ),
    ).toEqual({ text: "No longer reachable", tone: "worse" });
  });

  it("reports an improvement as better", () => {
    expect(
      formatDelta(
        -5,
        { p25: null, p50: 20, p75: null },
        { p25: null, p50: 15, p75: null },
      ),
    ).toEqual({ text: "-5 min · better", tone: "better" });
  });
});
