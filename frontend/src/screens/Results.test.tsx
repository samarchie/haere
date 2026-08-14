import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as analysisCatalogue from "../data/analysisCatalogue";
import * as hexLookup from "../data/hexLookup";
import * as manifestData from "../data/manifest";
import * as travelTimes from "../data/travelTimes";
import { useScreen } from "../router";
import { WizardStateProvider } from "../state/WizardStateContext";
import * as resultsHistory from "../state/resultsHistory";
import { encodeResultsParam } from "../state/resultsUrl";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import { Location } from "./Location";
import {
  Results,
  computeAxisMaxMinutes,
  deltaFor,
  formatArrow,
  formatDelta,
  readPercentileMinutes,
} from "./Results";

function ResultsThenLocation() {
  const screenName = useScreen();
  return screenName === "location" ? <Location /> : <Results />;
}

describe("readPercentileMinutes", () => {
  it("returns only mid when the manifest exposes a single percentile", () => {
    const row = new Uint8Array([10]);
    const minutes = readPercentileMinutes({ 50: row }, 0, 1, 255, [50]);
    expect(minutes).toEqual({ low: null, mid: 10, high: null });
  });

  it("derives low/mid/high from an arbitrary percentile set", () => {
    const rows = {
      10: new Uint8Array([8]),
      50: new Uint8Array([15]),
      90: new Uint8Array([30]),
    };
    const minutes = readPercentileMinutes(rows, 0, 1, 255, [10, 50, 90]);
    expect(minutes).toEqual({ low: 8, mid: 15, high: 30 });
  });

  it("works with a percentile set that doesn't include 50 exactly", () => {
    const rows = {
      25: new Uint8Array([9]),
      55: new Uint8Array([16]),
      75: new Uint8Array([22]),
    };
    const minutes = readPercentileMinutes(rows, 0, 1, 255, [25, 55, 75]);
    expect(minutes).toEqual({ low: 9, mid: 16, high: 22 });
  });
});

describe("deltaFor", () => {
  it("computes the mid delta", () => {
    expect(
      deltaFor(
        { low: null, mid: 10, high: null },
        { low: null, mid: 15, high: null },
      ),
    ).toBe(5);
  });
});

describe("formatDelta", () => {
  it("reports newly unreachable as worse", () => {
    expect(
      formatDelta(
        null,
        { low: null, mid: 10, high: null },
        { low: null, mid: null, high: null },
      ),
    ).toEqual({ text: "No longer reachable", tone: "worse" });
  });

  it("reports an improvement as better", () => {
    expect(
      formatDelta(
        -5,
        { low: null, mid: 20, high: null },
        { low: null, mid: 15, high: null },
      ),
    ).toEqual({ text: "-5 min · better", tone: "better" });
  });
});

describe("formatArrow", () => {
  it("describes an unreachable-both-ways destination", () => {
    expect(
      formatArrow(
        { low: null, mid: null, high: null },
        { low: null, mid: null, high: null },
      ),
    ).toBe("No transit route reaches this destination, before or after.");
  });

  it("formats a today-to-after sentence with ranges", () => {
    expect(
      formatArrow(
        { low: 18, mid: 22, high: 25 },
        { low: 34, mid: 41, high: 46 },
      ),
    ).toBe("22 min today (usually 18–25) → 41 min after (usually 34–46).");
  });

  it("falls back to a bare number when low/high are missing (e.g. a proposal with only one percentile)", () => {
    expect(
      formatArrow(
        { low: null, mid: 22, high: null },
        { low: null, mid: 41, high: null },
      ),
    ).toBe("22 min today → 41 min after.");
  });
});

describe("computeAxisMaxMinutes", () => {
  it("floors at 10 when every trip is very short", () => {
    expect(
      computeAxisMaxMinutes([
        { low: null, mid: 3, high: null },
        { low: null, mid: 4, high: null },
      ]),
    ).toBe(10);
  });

  it("rounds the largest mid value up to the nearest 10", () => {
    expect(
      computeAxisMaxMinutes([
        { low: null, mid: 22, high: null },
        { low: null, mid: 41, high: null },
      ]),
    ).toBe(50);
  });

  it("ignores unreachable (null) values", () => {
    expect(
      computeAxisMaxMinutes([
        { low: null, mid: null, high: null },
        { low: null, mid: 17, high: null },
      ]),
    ).toBe(20);
  });

  it("falls back to 10 when nothing is reachable", () => {
    expect(computeAxisMaxMinutes([{ low: null, mid: null, high: null }])).toBe(
      10,
    );
  });
});

describe("Results", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/results");
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "Origin St", lat: -43.5, lng: 172.6 },
      destinations: [
        { label: "Work", address: "Work St", lat: -43.51, lng: 172.61 },
      ],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    });

    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue({
      analysis: {
        id: "remove-135",
        title: "Test proposal",
        description: "",
        consultation: null,
      },
      hexagonResolution: 8,
      hexCount: 1,
      percentiles: [50],
      encoding: {
        dtype: "uint8",
        bytesPerValue: 1,
        byteOrder: "little",
        unreachable: 255,
      },
      scenarios: [
        {
          calendarType: "weekday",
          timeWindow: "am_peak",
          start: "07:00",
          end: "09:00",
          variants: {
            baseline: { "50": "am-baseline.bin" },
            modified: { "50": "am-modified.bin" },
          },
        },
        {
          calendarType: "weekday",
          timeWindow: "pm_peak",
          start: "16:00",
          end: "18:00",
          variants: {
            baseline: { "50": "pm-baseline.bin" },
            modified: { "50": "pm-modified.bin" },
          },
        },
      ],
    });
    vi.spyOn(hexLookup, "fetchHexIds").mockResolvedValue(["dummy"]);
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(0);
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([]);
    vi.spyOn(travelTimes, "fetchRow").mockImplementation(async (url) => {
      if (url.includes("am-baseline")) return new Uint8Array([10]);
      if (url.includes("am-modified")) return new Uint8Array([15]);
      if (url.includes("pm-baseline")) return new Uint8Array([20]);
      if (url.includes("pm-modified")) return new Uint8Array([20]);
      throw new Error(`unexpected url: ${url}`);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("re-renders with a new scenario's data after switching the time window", async () => {
    render(
      <WizardStateProvider>
        <Results />
      </WizardStateProvider>,
    );

    await waitFor(() =>
      screen.getByText("10 min today → 15 min after.", { exact: false }),
    );
    // baseline/modified mid values are 10 and 15 here, so the shared axis
    // rounds the larger one (15) up to the nearest 10 → 20, not a hardcoded 50.
    expect(screen.getByText("20 min")).toBeInTheDocument();
    expect(
      screen.getByText(/weekday · am_peak \(default\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) => node?.textContent === "christchurch · Test proposal",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 of 1 of your trips change under this proposal."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /switch proposal/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByText("pm_peak"));

    await waitFor(() =>
      screen.getByText("20 min today → 20 min after.", { exact: false }),
    );
    // Both sides are 20 here too, so the axis stays at 20 — proving it's
    // recomputed per render, not left over from the previous scenario.
    expect(screen.getByText("20 min")).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
    expect(screen.getByText("weekday · pm_peak")).toBeInTheDocument();
  });

  it("restores wizard state on Back when arriving via a shared results link with no local wizard state", async () => {
    // Simulate a visitor who opened a shared `?r=` link directly: no wizard
    // state saved yet, so the in-memory context starts empty.
    localStorage.clear();
    const payload = {
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "Origin St", lat: -43.5, lng: 172.6 },
      destinations: [
        { label: "Work", address: "Work St", lat: -43.51, lng: 172.61 },
      ],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    };
    window.history.replaceState(
      null,
      "",
      `/results?r=${encodeResultsParam(payload)}`,
    );

    render(
      <WizardStateProvider>
        <ResultsThenLocation />
      </WizardStateProvider>,
    );

    await waitFor(() =>
      screen.getByText("10 min today → 15 min after.", { exact: false }),
    );

    fireEvent.click(screen.getByText("← Back"));

    // Location should show the seeded origin, not redirect to /proposal.
    await waitFor(() =>
      expect(screen.getByText("Origin St")).toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe("/location");
  });

  it("records a history entry once results are ready", async () => {
    const appendSpy = vi.spyOn(resultsHistory, "appendHistoryEntry");

    render(
      <WizardStateProvider>
        <Results />
      </WizardStateProvider>,
    );

    await waitFor(() =>
      screen.getByText("10 min today → 15 min after.", { exact: false }),
    );

    await waitFor(() => expect(appendSpy).toHaveBeenCalledOnce());
    expect(appendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationCount: 1,
        changedCount: 1,
        proposalTitle: "Test proposal",
        cityName: "christchurch",
      }),
    );
  });

  it("shows a bold consultation banner with a call-to-action button when consultation is open", async () => {
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue({
      analysis: {
        id: "remove-135",
        title: "Test proposal",
        description: "",
        consultation: {
          closesAt: "2999-01-01T00:00:00Z",
          url: "https://example.com/consultation",
        },
      },
      hexagonResolution: 8,
      hexCount: 1,
      percentiles: [50],
      encoding: {
        dtype: "uint8",
        bytesPerValue: 1,
        byteOrder: "little",
        unreachable: 255,
      },
      scenarios: [
        {
          calendarType: "weekday",
          timeWindow: "am_peak",
          start: "07:00",
          end: "09:00",
          variants: {
            baseline: { "50": "am-baseline.bin" },
            modified: { "50": "am-modified.bin" },
          },
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Results />
      </WizardStateProvider>,
    );

    await waitFor(() => screen.getByText("Consultation open"));
    expect(
      screen.getByText("Have your say on this proposal before it's decided."),
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /have your say/i });
    expect(cta).toHaveAttribute("href", "https://example.com/consultation");
  });

  it("shows closed-consultation copy and a neutral CTA when consultation has closed", async () => {
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue({
      analysis: {
        id: "remove-135",
        title: "Test proposal",
        description: "",
        consultation: {
          closesAt: "2000-01-01T00:00:00Z",
          url: "https://example.com/consultation",
        },
      },
      hexagonResolution: 8,
      hexCount: 1,
      percentiles: [50],
      encoding: {
        dtype: "uint8",
        bytesPerValue: 1,
        byteOrder: "little",
        unreachable: 255,
      },
      scenarios: [
        {
          calendarType: "weekday",
          timeWindow: "am_peak",
          start: "07:00",
          end: "09:00",
          variants: {
            baseline: { "50": "am-baseline.bin" },
            modified: { "50": "am-modified.bin" },
          },
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Results />
      </WizardStateProvider>,
    );

    await waitFor(() => screen.getByText("Consultation closed"));
    expect(
      screen.getByText("Consultation on this proposal has closed."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Have your say on this proposal before it's decided."),
    ).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /see the proposal/i });
    expect(cta).toHaveAttribute("href", "https://example.com/consultation");
    expect(
      screen.queryByRole("link", { name: /^have your say/i }),
    ).not.toBeInTheDocument();
  });

  it("matches the proposal identity by cityId AND analysisId, not analysisId alone", async () => {
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      {
        cityId: "auckland",
        cityName: "Auckland",
        analysisId: "remove-route-135",
      },
      {
        cityId: "canterbury",
        cityName: "Canterbury",
        analysisId: "remove-route-135",
      },
    ]);

    saveWizardState({
      ...emptyWizardState(),
      cityId: "canterbury",
      analysisId: "remove-route-135",
      origin: { address: "Origin St", lat: -43.5, lng: 172.6 },
      destinations: [
        { label: "Work", address: "Work St", lat: -43.51, lng: 172.61 },
      ],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    });

    render(
      <WizardStateProvider>
        <Results />
      </WizardStateProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          (_, node) => node?.textContent === "Canterbury · Test proposal",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(
        (_, node) => node?.textContent === "Auckland · Test proposal",
      ),
    ).not.toBeInTheDocument();
  });
});
