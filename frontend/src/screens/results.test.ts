import { latLngToCell } from "h3-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import {
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

describe("formatDelta", () => {
  it("formats a worse delta", () => {
    expect(formatDelta(15)).toEqual({ text: "+15 min · worse", tone: "worse" });
  });

  it("formats a better delta", () => {
    expect(formatDelta(-4)).toEqual({
      text: "-4 min · better",
      tone: "better",
    });
  });

  it("formats no change", () => {
    expect(formatDelta(0)).toEqual({ text: "No change", tone: "none" });
  });

  it("formats an unreachable delta", () => {
    expect(formatDelta(null)).toEqual({
      text: "No route today or after",
      tone: "none",
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
