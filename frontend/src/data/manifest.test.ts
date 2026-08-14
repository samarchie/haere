import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Manifest,
  type Scenario,
  fetchManifest,
  findScenario,
  isConsultationOpen,
  isScenarioComplete,
} from "./manifest";

const rawManifestFixture = {
  schema_version: 1,
  city: { id: "canterbury", name: "Canterbury", timezone: "Pacific/Auckland" },
  analysis: {
    id: "remove-route-135",
    title: "Remove Route 135",
    description: "...",
    sources: [],
    consultation: {
      closes_at: "2026-06-24T23:59:00+12:00",
      url: "https://haveyoursay.ecan.govt.nz/metroreview44-135",
    },
  },
  hexagon_resolution: 9,
  hex_count: 3559,
  percentiles: [25, 50, 75],
  encoding: {
    dtype: "uint8",
    bytes_per_value: 1,
    byte_order: "little",
    unit: "minutes",
    unreachable: 255,
  },
  scenarios: [
    {
      calendar_type: "weekday",
      calendar_type_label: "Weekday",
      departure_date: "2026-08-03",
      time_window: "am_peak",
      time_window_label: "AM peak",
      start: "07:00",
      end: "09:00",
      variants: {
        baseline: {
          "25": "weekday/am_peak/baseline.p25.bin",
          "50": "weekday/am_peak/baseline.p50.bin",
        },
        modified: {
          "25": "weekday/am_peak/modified.p25.bin",
          "50": "weekday/am_peak/modified.p50.bin",
        },
      },
    },
    {
      calendar_type: "weekday",
      calendar_type_label: "Weekday",
      departure_date: "2026-08-03",
      time_window: "midday",
      time_window_label: "Midday",
      start: "09:00",
      end: "15:00",
      variants: {
        baseline: { "50": "weekday/midday/baseline.p50.bin" },
        // modified not yet run for this scenario
      },
    },
  ],
};

describe("fetchManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and converts snake_case fields to the camelCase Manifest shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawManifestFixture),
      }),
    );

    const manifest = await fetchManifest("canterbury", "remove-route-135");

    expect(fetch).toHaveBeenCalledWith(
      "/data/canterbury/remove-route-135/manifest.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(manifest.analysis).toEqual({
      id: "remove-route-135",
      title: "Remove Route 135",
      description: "...",
      consultation: {
        closesAt: "2026-06-24T23:59:00+12:00",
        url: "https://haveyoursay.ecan.govt.nz/metroreview44-135",
      },
    });
    expect(manifest.hexagonResolution).toBe(9);
    expect(manifest.hexCount).toBe(3559);
    expect(manifest.encoding).toEqual({
      dtype: "uint8",
      bytesPerValue: 1,
      byteOrder: "little",
      unreachable: 255,
    });
    expect(manifest.scenarios).toHaveLength(2);
    expect(manifest.scenarios[0].calendarType).toBe("weekday");
    expect(manifest.scenarios[0].timeWindow).toBe("am_peak");
  });
});

describe("isScenarioComplete", () => {
  const complete: Scenario = {
    calendarType: "weekday",
    calendarTypeLabel: "Weekday",
    timeWindow: "am_peak",
    timeWindowLabel: "AM peak",
    start: "07:00",
    end: "09:00",
    variants: { baseline: { "50": "a.bin" }, modified: { "50": "b.bin" } },
  };
  const incomplete: Scenario = {
    ...complete,
    variants: { baseline: { "50": "a.bin" } },
  };

  it("is true when both baseline and modified are present", () => {
    expect(isScenarioComplete(complete, [50])).toBe(true);
  });

  it("is false when modified is missing", () => {
    expect(isScenarioComplete(incomplete, [50])).toBe(false);
  });

  it("is false when modified is missing some but not all percentiles", () => {
    const partial: Scenario = {
      ...complete,
      variants: {
        baseline: { "25": "a25.bin", "50": "a50.bin", "75": "a75.bin" },
        modified: { "50": "b50.bin" },
      },
    };

    expect(isScenarioComplete(partial, [25, 50, 75])).toBe(false);
  });
});

describe("isConsultationOpen", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("is false when there is no consultation", () => {
    expect(isConsultationOpen(null, now)).toBe(false);
  });

  it("is true when the close date is in the future", () => {
    expect(
      isConsultationOpen(
        { closesAt: "2026-06-24T23:59:00+12:00", url: "https://x" },
        now,
      ),
    ).toBe(true);
  });

  it("is false when the close date has passed", () => {
    expect(
      isConsultationOpen(
        { closesAt: "2026-01-01T00:00:00+12:00", url: "https://x" },
        now,
      ),
    ).toBe(false);
  });
});

describe("findScenario", () => {
  it("finds a scenario by calendar type and time window", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawManifestFixture),
      }),
    );
    const manifest: Manifest = await fetchManifest(
      "canterbury",
      "remove-route-135",
    );
    vi.unstubAllGlobals();

    const found = findScenario(manifest, "weekday", "midday");

    expect(found?.timeWindow).toBe("midday");
  });

  it("returns null when no scenario matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawManifestFixture),
      }),
    );
    const manifest: Manifest = await fetchManifest(
      "canterbury",
      "remove-route-135",
    );
    vi.unstubAllGlobals();

    expect(findScenario(manifest, "sunday", "evening")).toBeNull();
  });
});
