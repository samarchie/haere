import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as analysisCatalogue from "../data/analysisCatalogue";
import * as geocode from "../data/geocode";
import * as hexLookup from "../data/hexLookup";
import { navigate } from "../router";
import { WizardStateProvider } from "../state/WizardStateContext";
import { saveHistory } from "../state/resultsHistory";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import { Landing, hasResumableProgress, resumeScreen } from "./Landing";

vi.mock("maplibre-gl", () => {
  class FakeMap {
    flyTo = vi.fn();
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    getCenter() {
      return { lat: -43.5, lng: 172.6 };
    }
  }
  return { MapLibreMap: FakeMap };
});

describe("hasResumableProgress", () => {
  it("is false for an empty wizard state", () => {
    expect(hasResumableProgress(emptyWizardState(), null)).toBe(false);
  });

  it("is true once a proposal has been chosen", () => {
    expect(
      hasResumableProgress(
        {
          ...emptyWizardState(),
          cityId: "christchurch",
          analysisId: "remove-135",
        },
        null,
      ),
    ).toBe(true);
  });

  it("is true when the live analysis set isn't known yet (null skips the check)", () => {
    expect(
      hasResumableProgress(
        {
          ...emptyWizardState(),
          cityId: "christchurch",
          analysisId: "remove-135",
        },
        null,
      ),
    ).toBe(true);
  });

  it("is true when the chosen analysis is in the live set", () => {
    expect(
      hasResumableProgress(
        {
          ...emptyWizardState(),
          cityId: "christchurch",
          analysisId: "remove-135",
        },
        new Set(["christchurch::remove-135"]),
      ),
    ).toBe(true);
  });

  it("is false when the chosen analysis has been removed from the live set", () => {
    expect(
      hasResumableProgress(
        {
          ...emptyWizardState(),
          cityId: "christchurch",
          analysisId: "retired-proposal",
        },
        new Set(["christchurch::remove-135"]),
      ),
    ).toBe(false);
  });

  it("is true for an origin-only state even when the live set is known and empty", () => {
    expect(
      hasResumableProgress(
        {
          ...emptyWizardState(),
          origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
        },
        new Set(),
      ),
    ).toBe(true);
  });
});

describe("resumeScreen", () => {
  it("routes to proposal when nothing is chosen yet", () => {
    expect(resumeScreen(emptyWizardState())).toBe("proposal");
  });

  it("routes to location when a proposal is chosen but addresses aren't set", () => {
    expect(
      resumeScreen({ ...emptyWizardState(), analysisId: "remove-135" }),
    ).toBe("location");
  });

  it("routes to results once origin and a destination are set", () => {
    expect(
      resumeScreen({
        ...emptyWizardState(),
        analysisId: "remove-135",
        origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
        destinations: [
          { label: "Work", address: "2 Work St", lat: -43.5, lng: 172.6 },
        ],
      }),
    ).toBe("results");
  });
});

describe("Landing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      {
        cityId: "christchurch",
        cityName: "Christchurch",
        analysisId: "remove-135",
      },
    ]);
    vi.spyOn(hexLookup, "matchingCityIds").mockResolvedValue(
      new Set(["christchurch"]),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the address input when there is no saved progress", async () => {
    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByLabelText(/home address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check/i })).toBeInTheDocument();
  });

  it("shows an unfinished resume banner when only a proposal is chosen", async () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
    });
    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(
      screen.getByText(/continue where you left off/i),
    ).toBeInTheDocument();
    const resumeButton = screen.getByRole("button", { name: /resume/i });
    fireEvent.click(resumeButton);
    // resumeScreen (Task 5, untouched here) routes an analysis-only state to
    // "location" — origin/destinations still need to be entered — matching
    // its own already-passing unit test
    // ("routes to location when a proposal is chosen but addresses aren't set").
    expect(window.location.pathname).toBe("/location");
  });

  it("resets progress and shows no banner when the saved proposal has been retired", async () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "retired-proposal",
    });
    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    // retired-proposal isn't in the mocked live set, so the banner shouldn't show.
    expect(
      screen.queryByText(/continue where you left off/i),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/home address/i)).toBeInTheDocument();
  });

  it("shows the finished resume banner with the destination/change summary", async () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
      destinations: [
        { label: "Work", address: "2 Work St", lat: -43.5, lng: 172.6 },
      ],
    });
    saveHistory([
      {
        id: "a",
        savedAt: "2026-06-03T00:00:00.000Z",
        cityId: "christchurch",
        analysisId: "remove-135",
        proposalTitle: "Remove Route 135",
        cityName: "Christchurch",
        origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
        destinations: [
          { label: "Work", address: "2 Work St", lat: -43.5, lng: 172.6 },
        ],
        scenario: { calendarType: "Weekday", timeWindow: "AM peak" },
        destinationCount: 1,
        changedCount: 1,
      },
    ]);

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByText(/your last result/i)).toBeInTheDocument();
    expect(
      screen.getByText(/1 Main St · 1 of 1 trips change/i),
    ).toBeInTheDocument();
  });

  it("navigates to /proposal when Check succeeds via forwardGeocode", async () => {
    vi.spyOn(geocode, "forwardGeocode").mockResolvedValue({
      ok: true,
      result: { lat: -43.53, lng: 172.62, label: "123 Riccarton Road" },
    });

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/home address/i);
    fireEvent.change(input, { target: { value: "123 Riccarton Road" } });
    const checkButton = screen.getByRole("button", { name: /check/i });
    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(window.location.pathname).toBe("/proposal");
    expect(window.location.search).toBe("?city=christchurch");
  });

  it("shows the whole wall, unfiltered, when the address matches proposals in more than one city", async () => {
    vi.spyOn(geocode, "forwardGeocode").mockResolvedValue({
      ok: true,
      result: { lat: -43.53, lng: 172.62, label: "123 Riccarton Road" },
    });
    vi.spyOn(hexLookup, "matchingCityIds").mockResolvedValue(
      new Set(["christchurch", "wellington"]),
    );

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/home address/i);
    fireEvent.change(input, { target: { value: "123 Riccarton Road" } });
    const checkButton = screen.getByRole("button", { name: /check/i });
    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(window.location.pathname).toBe("/proposal");
    expect(window.location.search).toBe("");
  });

  it("routes to the wall with reason=outside-area when the address matches no proposal anywhere", async () => {
    vi.spyOn(geocode, "forwardGeocode").mockResolvedValue({
      ok: true,
      result: { lat: -90, lng: 0, label: "South Pole" },
    });
    vi.spyOn(hexLookup, "matchingCityIds").mockResolvedValue(new Set());

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/home address/i);
    fireEvent.change(input, { target: { value: "South Pole" } });
    const checkButton = screen.getByRole("button", { name: /check/i });
    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(window.location.pathname).toBe("/proposal");
    expect(window.location.search).toBe("?city=&reason=outside-area");
  });

  it("shows a check error when forwardGeocode finds no match", async () => {
    vi.spyOn(geocode, "forwardGeocode").mockResolvedValue({
      ok: false,
      reason: "no-match",
    });

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/home address/i);
    fireEvent.change(input, { target: { value: "nowhere" } });
    const checkButton = screen.getByRole("button", { name: /check/i });
    await act(async () => {
      fireEvent.click(checkButton);
    });

    expect(
      screen.getByText(/no address found — check the spelling/i),
    ).toBeInTheDocument();
  });

  it("shows suggestions after typing and resolves the origin on selection", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    const input = screen.getByLabelText(/home address/i);
    fireEvent.change(input, { target: { value: "123 Riccarton" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    const suggestion = screen.getByText("123 Riccarton Road, Christchurch");
    await act(async () => {
      fireEvent.click(suggestion);
    });

    expect(window.location.pathname).toBe("/proposal");
  });

  it("lists other previous results and resumes one on click", async () => {
    saveHistory([
      {
        id: "a",
        savedAt: "2026-06-03T00:00:00.000Z",
        cityId: "christchurch",
        analysisId: "remove-135",
        proposalTitle: "Remove Route 135",
        cityName: "Christchurch",
        origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
        destinations: [
          { label: "Work", address: "2 Work St", lat: -43.5, lng: 172.6 },
        ],
        scenario: { calendarType: "Weekday", timeWindow: "AM peak" },
        destinationCount: 1,
        changedCount: 1,
      },
    ]);

    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    fireEvent.click(screen.getByText(/see your other previous results/i));
    fireEvent.click(screen.getByText(/remove route 135 — christchurch/i));

    expect(window.location.pathname).toBe("/results");
  });

  it("opens and closes the About modal", async () => {
    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    fireEvent.click(screen.getByText(/about this analysis/i));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
