import { afterEach, describe, expect, it, vi } from "vitest";
import type { Manifest, Scenario } from "../data/manifest";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import { availableCombos, defaultScenario, renderScenario } from "./scenario";

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

function rawScenario(
  calendarType: string,
  timeWindow: string,
  complete: boolean,
) {
  return {
    calendar_type: calendarType,
    time_window: timeWindow,
    start: "07:00",
    end: "09:00",
    variants: complete
      ? { baseline: { "50": "a.bin" }, modified: { "50": "b.bin" } }
      : { baseline: { "50": "a.bin" } },
  };
}

function rawManifest() {
  return {
    hexagon_resolution: 9,
    hex_count: 10,
    percentiles: [50],
    encoding: {
      dtype: "uint8",
      bytes_per_value: 1,
      byte_order: "little",
      unreachable: 255,
    },
    scenarios: [
      rawScenario("weekday", "am_peak", true),
      rawScenario("weekday", "midday", false),
      rawScenario("saturday", "midday", true),
      rawScenario("sunday", "evening", false),
    ],
  };
}

function seedWizard(): void {
  saveWizardState({
    ...emptyWizardState(),
    cityId: "canterbury",
    analysisId: "test-analysis",
  });
}

function makeRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function findChip(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;
}

describe("renderScenario", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("re-derives a valid time-window selection when switching calendar type", async () => {
    seedWizard();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawManifest()),
      }),
    );

    const root = makeRoot();
    renderScenario(root);
    await flushMicrotasks();

    // Default selection is weekday/am_peak; switch to saturday.
    findChip(root, "saturday").click();

    const saturdayChip = findChip(root, "saturday");
    expect(saturdayChip.className).toContain("selected");

    const middayChip = findChip(root, "midday");
    expect(middayChip.className).toContain("selected");
    expect(middayChip.disabled).toBe(false);
  });

  it("disables a time-window chip whose combo is incomplete", async () => {
    seedWizard();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawManifest()),
      }),
    );

    const root = makeRoot();
    renderScenario(root);
    await flushMicrotasks();

    // Default selection is weekday/am_peak; weekday's midday chip should
    // render disabled since that combo lacks a modified variant.
    const middayChip = findChip(root, "midday");
    expect(middayChip.disabled).toBe(true);
  });

  it("disables See results when no combo is complete, and enables it once one is", async () => {
    seedWizard();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawManifest()),
      }),
    );

    const root = makeRoot();
    renderScenario(root);
    await flushMicrotasks();

    const seeResults = () => findChip(root, "See results →");
    expect(seeResults().disabled).toBe(false);

    findChip(root, "sunday").click();
    expect(seeResults().disabled).toBe(true);

    findChip(root, "weekday").click();
    expect(seeResults().disabled).toBe(false);
  });

  it("shows a retry banner when the manifest fetch fails", async () => {
    seedWizard();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const root = makeRoot();
    renderScenario(root);
    await flushMicrotasks();

    const banner = root.querySelector(".banner--warning");
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("Couldn't load scenario options.");

    const retry = findChip(root, "Retry");
    expect(retry).toBeTruthy();
  });
});
