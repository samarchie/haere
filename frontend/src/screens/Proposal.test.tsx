import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as analysisCatalogue from "../data/analysisCatalogue";
import * as manifestData from "../data/manifest";
import { WizardStateProvider } from "../state/WizardStateContext";
import { emptyWizardState } from "../state/wizardState";
import {
  Proposal,
  bannerFor,
  formatConsultationClose,
  pickerSummaryText,
  selectAnalysis,
  switchAnalysis,
} from "./Proposal";

describe("pickerSummaryText", () => {
  it("reports totals without a city filter", () => {
    expect(pickerSummaryText(3, 3)).toBe("3 of 3 interventions");
  });

  it("names the city when filtered", () => {
    expect(pickerSummaryText(3, 1)).toBe("1 of 3 interventions");
  });
});

describe("bannerFor", () => {
  it("returns null for no reason", () => {
    expect(bannerFor(null, null)).toBeNull();
  });

  it("explains an outside-area redirect", () => {
    expect(bannerFor("outside-area", null)?.title).toMatch(
      /isn't in a studied area/,
    );
  });

  it("names the matched city for a multi-match redirect", () => {
    expect(bannerFor("multi-match", "Christchurch")?.subtitle).toBe(
      "Showing every Christchurch proposal — pick the one you meant.",
    );
  });
});

describe("formatConsultationClose", () => {
  it("formats a closing date for display", () => {
    expect(formatConsultationClose("2026-06-24T23:59:00+12:00")).toBe(
      "24 Jun 2026",
    );
  });
});

describe("selectAnalysis", () => {
  it("resets the wizard when switching to a different analysis, keeping the origin", () => {
    const state = {
      ...emptyWizardState(),
      analysisId: "remove-135",
      origin: { address: "x", lat: 1, lng: 1 },
    };
    const next = selectAnalysis(state, "christchurch", "network-review");
    expect(next).toEqual({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "network-review",
      origin: { address: "x", lat: 1, lng: 1 },
    });
  });

  it("is a no-op when re-selecting the same city and analysis", () => {
    const state = {
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
    };
    expect(selectAnalysis(state, "christchurch", "remove-135")).toBe(state);
  });

  it("does not conflate two cities sharing the same analysisId", () => {
    // Auckland and Canterbury both have a "remove-route-135" analysis in
    // this app's real data — analysisId alone isn't a unique key.
    const state = {
      ...emptyWizardState(),
      cityId: "auckland",
      analysisId: "remove-route-135",
      origin: { address: "x", lat: 1, lng: 1 },
    };
    const next = selectAnalysis(state, "canterbury", "remove-route-135");
    expect(next).toEqual({
      ...emptyWizardState(),
      cityId: "canterbury",
      analysisId: "remove-route-135",
      origin: { address: "x", lat: 1, lng: 1 },
    });
  });
});

describe("switchAnalysis", () => {
  it("keeps origin and destinations, only swapping the proposal and resetting the scenario", () => {
    const state = {
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "x", lat: 1, lng: 1 },
      destinations: [{ label: "Work", address: "y", lat: 2, lng: 2 }],
      scenario: { calendarType: "weekday", timeWindow: "am-peak" },
    };
    const next = switchAnalysis(state, "christchurch", "network-review");
    expect(next).toEqual({
      ...state,
      analysisId: "network-review",
      scenario: null,
    });
  });

  it("is a no-op when re-selecting the same city and analysis", () => {
    const state = {
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
    };
    expect(switchAnalysis(state, "christchurch", "remove-135")).toBe(state);
  });
});

describe("Proposal", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/proposal");
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      {
        cityId: "christchurch",
        cityName: "Christchurch",
        analysisId: "remove-135",
      },
    ]);
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue({
      analysis: {
        id: "remove-135",
        title: "Remove Route 135",
        description: "Route 135 is discontinued.",
        consultation: null,
      },
    } as manifestData.Manifest);
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists fetched proposals and selects one", async () => {
    render(
      <WizardStateProvider>
        <Proposal />
      </WizardStateProvider>,
    );

    await waitFor(() => screen.getByText("Remove Route 135"));
    fireEvent.click(
      screen.getByRole("button", { name: /select this proposal/i }),
    );
    expect(window.location.pathname).toBe("/location");
  });

  describe("switching proposals from Results", () => {
    beforeEach(() => {
      window.history.replaceState(null, "", "/proposal?switch=1&city=");
      vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
        {
          cityId: "christchurch",
          cityName: "Christchurch",
          analysisId: "remove-135",
        },
        {
          cityId: "christchurch",
          cityName: "Christchurch",
          analysisId: "network-review",
        },
      ]);
      vi.spyOn(manifestData, "fetchManifest").mockImplementation(
        async (_cityId, analysisId) =>
          ({
            analysis: {
              id: analysisId,
              title:
                analysisId === "remove-135"
                  ? "Remove Route 135"
                  : "Network review",
              description: "d",
              consultation: null,
            },
          }) as manifestData.Manifest,
      );
    });

    it("marks the currently-viewed proposal as current instead of selectable", async () => {
      localStorage.setItem(
        "haere.wizardState",
        JSON.stringify({
          ...emptyWizardState(),
          cityId: "christchurch",
          analysisId: "remove-135",
          origin: { address: "x", lat: 1, lng: 1 },
        }),
      );

      render(
        <WizardStateProvider>
          <Proposal />
        </WizardStateProvider>,
      );

      await waitFor(() => screen.getByText("Remove Route 135"));
      expect(screen.getByText("Current")).toBeInTheDocument();
      expect(
        screen.queryAllByRole("button", { name: /select this proposal/i }),
      ).toHaveLength(1);
    });

    it("keeps the saved trip and jumps straight to Results when picking a different proposal", async () => {
      localStorage.setItem(
        "haere.wizardState",
        JSON.stringify({
          ...emptyWizardState(),
          cityId: "christchurch",
          analysisId: "remove-135",
          origin: { address: "x", lat: 1, lng: 1 },
          destinations: [{ label: "Work", address: "y", lat: 2, lng: 2 }],
        }),
      );

      render(
        <WizardStateProvider>
          <Proposal />
        </WizardStateProvider>,
      );

      await waitFor(() => screen.getByText("Network review"));
      fireEvent.click(
        screen.getByRole("button", { name: /select this proposal/i }),
      );

      expect(window.location.pathname).toBe("/results");
      const saved = JSON.parse(
        localStorage.getItem("haere.wizardState") ?? "{}",
      );
      expect(saved.analysisId).toBe("network-review");
      expect(saved.destinations).toEqual([
        { label: "Work", address: "y", lat: 2, lng: 2 },
      ]);
    });
  });
});
