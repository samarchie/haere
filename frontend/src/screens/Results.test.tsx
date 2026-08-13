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
  deltaFor,
  formatDelta,
  formatRange,
  readPercentileMinutes,
} from "./Results";

function ResultsThenLocation() {
  const screenName = useScreen();
  return screenName === "location" ? <Location /> : <Results />;
}

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

    await waitFor(() => screen.getByText("Today: 10 min"));
    expect(screen.getByText("After: 15 min")).toBeInTheDocument();
    expect(
      screen.getByText(/weekday · am_peak \(default\)/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("pm_peak"));

    await waitFor(() => screen.getByText("Today: 20 min"));
    expect(screen.getByText("After: 20 min")).toBeInTheDocument();
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

    await waitFor(() => screen.getByText("Today: 10 min"));

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

    await waitFor(() => screen.getByText("Today: 10 min"));

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
});
