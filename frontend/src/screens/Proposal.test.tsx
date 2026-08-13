import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as analysisCatalogue from "../data/analysisCatalogue";
import * as manifestData from "../data/manifest";
import { WizardStateProvider } from "../state/WizardStateContext";
import { emptyWizardState } from "../state/wizardState";
import {
  Proposal,
  bannerTextFor,
  formatConsultationClose,
  pickerSummaryText,
  selectAnalysis,
} from "./Proposal";

describe("pickerSummaryText", () => {
  it("reports totals without a city filter", () => {
    expect(pickerSummaryText(3, 3)).toBe("3 of 3 interventions");
  });

  it("names the city when filtered", () => {
    expect(pickerSummaryText(3, 1)).toBe("1 of 3 interventions");
  });
});

describe("bannerTextFor", () => {
  it("returns null for no reason", () => {
    expect(bannerTextFor(null)).toBeNull();
  });

  it("explains an outside-area redirect", () => {
    expect(bannerTextFor("outside-area")).toMatch(
      /isn't inside any modelled area/,
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

  it("is a no-op when re-selecting the same analysis", () => {
    const state = { ...emptyWizardState(), analysisId: "remove-135" };
    expect(selectAnalysis(state, "christchurch", "remove-135")).toBe(state);
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
});
