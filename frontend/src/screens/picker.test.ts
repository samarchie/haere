import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import {
  bannerTextFor,
  pickerSummaryText,
  renderPicker,
  selectAnalysis,
} from "./picker";

describe("pickerSummaryText", () => {
  it("has no filter clause when no city is selected", () => {
    expect(pickerSummaryText(3, 3, null)).toBe("3 of 3 interventions");
  });

  it("names the filtering city", () => {
    expect(pickerSummaryText(3, 1, "Christchurch")).toBe(
      "1 of 3 interventions · filtered by: Christchurch",
    );
  });
});

describe("bannerTextFor", () => {
  it("returns null for no reason", () => {
    expect(bannerTextFor(null)).toBeNull();
  });

  it("explains an outside-area redirect", () => {
    expect(bannerTextFor("outside-area")).toContain("isn't inside");
  });

  it("explains a multi-match redirect", () => {
    expect(bannerTextFor("multi-match")).toContain("more than one");
  });

  it("returns null for an unrecognized reason", () => {
    expect(bannerTextFor("something-else")).toBeNull();
  });
});

describe("selectAnalysis", () => {
  it("sets cityId and analysisId, resetting downstream fields when the analysis changes", () => {
    const state = {
      ...emptyWizardState(),
      cityId: "canterbury",
      analysisId: "remove-route-135",
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    };

    const next = selectAnalysis(state, "canterbury", "another-analysis");

    expect(next.cityId).toBe("canterbury");
    expect(next.analysisId).toBe("another-analysis");
    expect(next.scenario).toBeNull();
    expect(next.destinations).toEqual([]);
  });

  it("returns the same state unchanged when re-selecting the current analysis", () => {
    const state = {
      ...emptyWizardState(),
      cityId: "canterbury",
      analysisId: "remove-route-135",
    };

    expect(selectAnalysis(state, "canterbury", "remove-route-135")).toBe(state);
  });
});

describe("renderPicker stepper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a stepper with picker as the current step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }),
    );
    const root = document.createElement("div");

    renderPicker(root);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const current = root.querySelector("[data-step='picker']");
    expect(current).not.toBeNull();
    expect(current?.tagName).toBe("SPAN");
  });
});

describe("renderPicker city filter defaulting from wizardState", () => {
  const analyses = [
    {
      city_id: "canterbury",
      city_name: "Christchurch",
      analysis_id: "remove-route-135",
      title: "Remove route 135",
      description: "desc",
      consultation_url: null,
      consultation_status: null,
    },
    {
      city_id: "wellington",
      city_name: "Wellington",
      analysis_id: "add-route-9",
      title: "Add route 9",
      description: "desc",
      consultation_url: null,
      consultation_status: null,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/picker");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/picker");
  });

  it("defaults the filter from wizard.cityId when no ?city= param is present", async () => {
    saveWizardState({ ...emptyWizardState(), cityId: "canterbury" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(analyses) }),
    );
    const root = document.createElement("div");

    renderPicker(root);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.textContent).toContain(
      "1 of 2 interventions · filtered by: Christchurch",
    );
    const selectedChip = root.querySelector(".chip.selected");
    expect(selectedChip?.textContent).toBe("Christchurch");
  });

  it("clicking All cities shows the unfiltered list and does not snap back to the wizardState city", async () => {
    saveWizardState({ ...emptyWizardState(), cityId: "canterbury" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(analyses) }),
    );
    const root = document.createElement("div");

    renderPicker(root);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const allCitiesChip = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "All cities",
    ) as HTMLButtonElement;
    expect(allCitiesChip).toBeTruthy();
    allCitiesChip.click();
    expect(window.location.search).toBe("?city=");

    // Simulate the app's popstate-driven re-render of the current screen.
    renderPicker(root);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.textContent).toContain("2 of 2 interventions");
    const selectedChip = root.querySelector(".chip.selected");
    expect(selectedChip?.textContent).toBe("All cities");
  });
});
