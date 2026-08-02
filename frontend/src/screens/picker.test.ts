import { describe, expect, it } from "vitest";
import { emptyWizardState } from "../state/wizardState";
import { bannerTextFor, pickerSummaryText, selectAnalysis } from "./picker";

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
