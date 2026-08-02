import { latLngToCell } from "h3-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentSearch } from "../router";
import { decodeResultsParam } from "../state/resultsUrl";
import {
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "../state/wizardState";
import {
  type PercentileMinutes,
  deltaFor,
  formatDelta,
  formatRange,
  readPercentileMinutes,
  renderResults,
} from "./results";

describe("readPercentileMinutes", () => {
  it("reads each percentile row at the given column, mapping the sentinel to null", () => {
    const rows = {
      25: new Uint8Array([10, 20]),
      50: new Uint8Array([15, 255]),
      75: new Uint8Array([20, 30]),
    };

    expect(readPercentileMinutes(rows, 0, 1, 255)).toEqual({
      p25: 10,
      p50: 15,
      p75: 20,
    });
    expect(readPercentileMinutes(rows, 1, 1, 255)).toEqual({
      p25: 20,
      p50: null,
      p75: 30,
    });
  });

  it("returns null for a percentile with no fetched row", () => {
    expect(readPercentileMinutes({}, 0, 1, 255)).toEqual({
      p25: null,
      p50: null,
      p75: null,
    });
  });
});

describe("formatRange", () => {
  it("shows a range when p25/p50/p75 are all present", () => {
    expect(formatRange({ p25: 10, p50: 15, p75: 20 })).toBe(
      "10–20 min (typically 15)",
    );
  });

  it("shows just p50 when the range percentiles are missing", () => {
    expect(formatRange({ p25: null, p50: 15, p75: null })).toBe("15 min");
  });

  it("shows a dash when unreachable", () => {
    expect(formatRange({ p25: null, p50: null, p75: null })).toBe("—");
  });
});

describe("deltaFor", () => {
  it("computes the p50 delta", () => {
    expect(
      deltaFor({ p25: 8, p50: 10, p75: 12 }, { p25: 20, p50: 25, p75: 30 }),
    ).toBe(15);
  });

  it("returns null when either side is unreachable", () => {
    expect(
      deltaFor({ p25: 8, p50: null, p75: 12 }, { p25: 20, p50: 25, p75: 30 }),
    ).toBeNull();
  });
});

const REACHABLE: PercentileMinutes = { p25: 8, p50: 10, p75: 12 };
const UNREACHABLE: PercentileMinutes = { p25: null, p50: null, p75: null };

describe("formatDelta", () => {
  it("formats a worse delta", () => {
    expect(formatDelta(15, REACHABLE, REACHABLE)).toEqual({
      text: "+15 min · worse",
      tone: "worse",
    });
  });

  it("formats a better delta", () => {
    expect(formatDelta(-4, REACHABLE, REACHABLE)).toEqual({
      text: "-4 min · better",
      tone: "better",
    });
  });

  it("formats no change", () => {
    expect(formatDelta(0, REACHABLE, REACHABLE)).toEqual({
      text: "No change",
      tone: "none",
    });
  });

  it("formats both sides unreachable", () => {
    expect(formatDelta(null, UNREACHABLE, UNREACHABLE)).toEqual({
      text: "No route today or after",
      tone: "none",
    });
  });

  it("formats a lost route (reachable today, unreachable after) distinctly", () => {
    expect(formatDelta(null, REACHABLE, UNREACHABLE)).toEqual({
      text: "No longer reachable",
      tone: "worse",
    });
  });

  it("formats a gained route (unreachable today, reachable after) distinctly", () => {
    expect(formatDelta(null, UNREACHABLE, REACHABLE)).toEqual({
      text: "Newly reachable",
      tone: "better",
    });
  });
});

function makeRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const RESOLUTION = 9;
const ORIGIN_POINT = { address: "123 Main St", lat: -43.532, lng: 172.636 };
const DEST_POINT = {
  label: "Work",
  address: "456 Other St",
  lat: -43.5,
  lng: 172.6,
};

function sortedHexIds(): {
  hexIds: string[];
  originIndex: number;
  destIndex: number;
} {
  const originCell = latLngToCell(
    ORIGIN_POINT.lat,
    ORIGIN_POINT.lng,
    RESOLUTION,
  );
  const destCell = latLngToCell(DEST_POINT.lat, DEST_POINT.lng, RESOLUTION);
  const hexIds = [originCell, destCell].sort();
  return {
    hexIds,
    originIndex: hexIds.indexOf(originCell),
    destIndex: hexIds.indexOf(destCell),
  };
}

function rowBytes(destIndex: number, destValue: number): Uint8Array {
  const bytes = new Uint8Array(2);
  bytes[destIndex] = destValue;
  return bytes;
}

function seedWizard(): void {
  saveWizardState({
    ...emptyWizardState(),
    cityId: "canterbury",
    analysisId: "remove-route-135",
    origin: {
      address: ORIGIN_POINT.address,
      lat: ORIGIN_POINT.lat,
      lng: ORIGIN_POINT.lng,
    },
    destinations: [
      {
        label: DEST_POINT.label,
        address: DEST_POINT.address,
        lat: DEST_POINT.lat,
        lng: DEST_POINT.lng,
      },
    ],
    scenario: { calendarType: "weekday", timeWindow: "am_peak" },
  });
}

describe("renderResults", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
  });

  it("renders a verdict row with the expected today/after range and delta from wizard state", async () => {
    seedWizard();
    const { hexIds, destIndex } = sortedHexIds();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                hexagon_resolution: RESOLUTION,
                hex_count: 2,
                percentiles: [25, 50, 75],
                encoding: {
                  dtype: "uint8",
                  bytes_per_value: 1,
                  byte_order: "little",
                  unreachable: 255,
                },
                scenarios: [
                  {
                    calendar_type: "weekday",
                    time_window: "am_peak",
                    start: "07:00",
                    end: "09:00",
                    variants: {
                      baseline: {
                        "25": "baseline_25.bin",
                        "50": "baseline_50.bin",
                        "75": "baseline_75.bin",
                      },
                      modified: {
                        "25": "modified_25.bin",
                        "50": "modified_50.bin",
                        "75": "modified_75.bin",
                      },
                    },
                  },
                ],
              }),
          });
        }
        if (url.endsWith("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(hexIds),
          });
        }
        if (url.endsWith("/analyses.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  city_id: "canterbury",
                  city_name: "Canterbury",
                  analysis_id: "remove-route-135",
                  title: "Remove route 135",
                  description: "",
                  consultation_url: "https://example.com/have-your-say",
                  consultation_status: "open",
                },
              ]),
          });
        }
        if (url.includes("baseline_25.bin")) {
          return Promise.resolve({
            status: 206,
            arrayBuffer: () => Promise.resolve(rowBytes(destIndex, 5).buffer),
          });
        }
        if (url.includes("baseline_50.bin")) {
          return Promise.resolve({
            status: 206,
            arrayBuffer: () => Promise.resolve(rowBytes(destIndex, 8).buffer),
          });
        }
        if (url.includes("baseline_75.bin")) {
          return Promise.resolve({
            status: 206,
            arrayBuffer: () => Promise.resolve(rowBytes(destIndex, 12).buffer),
          });
        }
        if (url.includes("modified_25.bin")) {
          return Promise.resolve({
            status: 206,
            arrayBuffer: () => Promise.resolve(rowBytes(destIndex, 18).buffer),
          });
        }
        if (url.includes("modified_50.bin")) {
          return Promise.resolve({
            status: 206,
            arrayBuffer: () => Promise.resolve(rowBytes(destIndex, 23).buffer),
          });
        }
        if (url.includes("modified_75.bin")) {
          return Promise.resolve({
            status: 206,
            arrayBuffer: () => Promise.resolve(rowBytes(destIndex, 30).buffer),
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const root = makeRoot();
    renderResults(root);
    await flushMicrotasks();

    expect(root.textContent).toContain("Today: 5–12 min (typically 8)");
    expect(root.textContent).toContain("After: 18–30 min (typically 23)");
    expect(root.textContent).toContain("+15 min · worse");
    expect(root.textContent).toContain("Consultation open");
    expect(root.textContent).toContain("Why a range?");

    const mapButton = Array.from(root.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("See how this change looks"),
    ) as HTMLButtonElement;
    expect(mapButton.disabled).toBe(true);
    expect(mapButton.title).toBe("coming in a future update");
  });

  it("removing a destination re-renders from the URL payload, not wizardState", async () => {
    seedWizard();

    const DEST_POINT_2 = {
      label: "Home",
      address: "789 Third St",
      lat: -43.51,
      lng: 172.62,
    };

    const originCell = latLngToCell(
      ORIGIN_POINT.lat,
      ORIGIN_POINT.lng,
      RESOLUTION,
    );
    const dest1Cell = latLngToCell(DEST_POINT.lat, DEST_POINT.lng, RESOLUTION);
    const dest2Cell = latLngToCell(
      DEST_POINT_2.lat,
      DEST_POINT_2.lng,
      RESOLUTION,
    );
    const hexIds = [originCell, dest1Cell, dest2Cell].sort();
    const dest1Index = hexIds.indexOf(dest1Cell);
    const dest2Index = hexIds.indexOf(dest2Cell);

    function twoDestRowBytes(values: Record<number, number>): Uint8Array {
      const bytes = new Uint8Array(3);
      for (const [idx, value] of Object.entries(values)) {
        bytes[Number(idx)] = value;
      }
      return bytes;
    }

    // Stale wizardState deliberately diverges from the URL payload we render
    // from, to prove removal doesn't read/write it.
    saveWizardState({
      ...emptyWizardState(),
      cityId: "canterbury",
      analysisId: "remove-route-135",
      origin: {
        address: ORIGIN_POINT.address,
        lat: ORIGIN_POINT.lat,
        lng: ORIGIN_POINT.lng,
      },
      destinations: [],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    });

    const rowValues: Record<string, Record<number, number>> = {
      "baseline_25.bin": { [dest1Index]: 5, [dest2Index]: 6 },
      "baseline_50.bin": { [dest1Index]: 8, [dest2Index]: 9 },
      "baseline_75.bin": { [dest1Index]: 12, [dest2Index]: 13 },
      "modified_25.bin": { [dest1Index]: 18, [dest2Index]: 19 },
      "modified_50.bin": { [dest1Index]: 23, [dest2Index]: 24 },
      "modified_75.bin": { [dest1Index]: 30, [dest2Index]: 31 },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                hexagon_resolution: RESOLUTION,
                hex_count: 3,
                percentiles: [25, 50, 75],
                encoding: {
                  dtype: "uint8",
                  bytes_per_value: 1,
                  byte_order: "little",
                  unreachable: 255,
                },
                scenarios: [
                  {
                    calendar_type: "weekday",
                    time_window: "am_peak",
                    start: "07:00",
                    end: "09:00",
                    variants: {
                      baseline: {
                        "25": "baseline_25.bin",
                        "50": "baseline_50.bin",
                        "75": "baseline_75.bin",
                      },
                      modified: {
                        "25": "modified_25.bin",
                        "50": "modified_50.bin",
                        "75": "modified_75.bin",
                      },
                    },
                  },
                ],
              }),
          });
        }
        if (url.endsWith("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(hexIds),
          });
        }
        if (url.endsWith("/analyses.json")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        for (const [file, values] of Object.entries(rowValues)) {
          if (url.includes(file)) {
            return Promise.resolve({
              status: 206,
              arrayBuffer: () =>
                Promise.resolve(twoDestRowBytes(values).buffer),
            });
          }
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const payload = {
      cityId: "canterbury",
      analysisId: "remove-route-135",
      origin: {
        address: ORIGIN_POINT.address,
        lat: ORIGIN_POINT.lat,
        lng: ORIGIN_POINT.lng,
      },
      destinations: [
        {
          label: DEST_POINT.label,
          address: DEST_POINT.address,
          lat: DEST_POINT.lat,
          lng: DEST_POINT.lng,
        },
        {
          label: DEST_POINT_2.label,
          address: DEST_POINT_2.address,
          lat: DEST_POINT_2.lat,
          lng: DEST_POINT_2.lng,
        },
      ],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    };
    const { encodeResultsParam } = await import("../state/resultsUrl");
    window.history.replaceState(
      null,
      "",
      `/results?r=${encodeResultsParam(payload)}`,
    );

    const root = makeRoot();
    renderResults(root);
    await flushMicrotasks();

    expect(root.textContent).toContain("Work");
    expect(root.textContent).toContain("Home");
    expect(root.textContent).toContain("Today: 5–12 min (typically 8)");
    expect(root.textContent).toContain("Today: 6–13 min (typically 9)");

    const removeButtons = Array.from(root.querySelectorAll("button")).filter(
      (b) => b.textContent === "✕",
    );
    expect(removeButtons.length).toBe(2);
    removeButtons[0].click();
    await flushMicrotasks();

    expect(root.textContent).not.toContain("Work");
    expect(root.textContent).toContain("Home");
    expect(root.textContent).toContain("Today: 6–13 min (typically 9)");
    expect(root.textContent).toContain("After: 19–31 min (typically 24)");

    const remainingRemoveButtons = Array.from(
      root.querySelectorAll("button"),
    ).filter((b) => b.textContent === "✕");
    expect(remainingRemoveButtons.length).toBe(0);

    const encoded = currentSearch().get("r");
    expect(encoded).toBeTruthy();
    const decoded = decodeResultsParam(encoded as string);
    expect(decoded?.destinations).toEqual([
      {
        label: DEST_POINT_2.label,
        address: DEST_POINT_2.address,
        lat: DEST_POINT_2.lat,
        lng: DEST_POINT_2.lng,
      },
    ]);
  });

  it("clicking + Add another destination seeds wizardState from the current payload, not whatever was already stored", async () => {
    // Seed a divergent wizardState first, to prove the click actually
    // performs the seeding rather than coincidentally matching.
    saveWizardState({
      ...emptyWizardState(),
      cityId: "other-city",
      analysisId: "other-analysis",
    });

    const { hexIds, destIndex } = sortedHexIds();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                hexagon_resolution: RESOLUTION,
                hex_count: 2,
                percentiles: [25, 50, 75],
                encoding: {
                  dtype: "uint8",
                  bytes_per_value: 1,
                  byte_order: "little",
                  unreachable: 255,
                },
                scenarios: [
                  {
                    calendar_type: "weekday",
                    time_window: "am_peak",
                    start: "07:00",
                    end: "09:00",
                    variants: {
                      baseline: {
                        "25": "baseline_25.bin",
                        "50": "baseline_50.bin",
                        "75": "baseline_75.bin",
                      },
                      modified: {
                        "25": "modified_25.bin",
                        "50": "modified_50.bin",
                        "75": "modified_75.bin",
                      },
                    },
                  },
                ],
              }),
          });
        }
        if (url.endsWith("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(hexIds),
          });
        }
        if (url.endsWith("/analyses.json")) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        for (const p of [25, 50, 75]) {
          if (
            url.includes(`baseline_${p}.bin`) ||
            url.includes(`modified_${p}.bin`)
          ) {
            return Promise.resolve({
              status: 206,
              arrayBuffer: () =>
                Promise.resolve(rowBytes(destIndex, 10).buffer),
            });
          }
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const payload = {
      cityId: "canterbury",
      analysisId: "remove-route-135",
      origin: {
        address: ORIGIN_POINT.address,
        lat: ORIGIN_POINT.lat,
        lng: ORIGIN_POINT.lng,
      },
      destinations: [
        {
          label: DEST_POINT.label,
          address: DEST_POINT.address,
          lat: DEST_POINT.lat,
          lng: DEST_POINT.lng,
        },
      ],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    };
    const { encodeResultsParam } = await import("../state/resultsUrl");
    window.history.replaceState(
      null,
      "",
      `/results?r=${encodeResultsParam(payload)}`,
    );

    const root = makeRoot();
    renderResults(root);
    await flushMicrotasks();

    const addButton = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add another destination",
    ) as HTMLButtonElement;
    expect(addButton).toBeTruthy();
    addButton.click();

    expect(loadWizardState()).toEqual({
      cityId: payload.cityId,
      analysisId: payload.analysisId,
      origin: payload.origin,
      destinations: payload.destinations,
      scenario: payload.scenario,
    });
  });

  it("shows a retry banner when the results data fails to load, and retry re-attempts the fetch", async () => {
    seedWizard();

    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const root = makeRoot();
    renderResults(root);
    await flushMicrotasks();

    const banner = root.querySelector(".banner--warning");
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Couldn't load your results.");

    const retry = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "Retry",
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();

    const callsBeforeRetry = fetchMock.mock.calls.length;
    retry.click();
    await flushMicrotasks();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });
});
