import { describe, expect, it } from "vitest";
import { emptyWizardState } from "../state/wizardState";
import { hasResumableProgress, resumeScreen } from "./landing";

describe("hasResumableProgress", () => {
  it("is false for a fresh state", () => {
    expect(hasResumableProgress(emptyWizardState())).toBe(false);
  });

  it("is true once an analysis is picked", () => {
    expect(
      hasResumableProgress({
        ...emptyWizardState(),
        analysisId: "remove-route-135",
      }),
    ).toBe(true);
  });
});

describe("resumeScreen", () => {
  it("resumes to picker with no analysis chosen", () => {
    expect(resumeScreen(emptyWizardState())).toBe("picker");
  });

  it("resumes to location once an analysis is chosen but no destinations", () => {
    expect(
      resumeScreen({
        ...emptyWizardState(),
        cityId: "canterbury",
        analysisId: "remove-route-135",
      }),
    ).toBe("location");
  });

  it("resumes to scenario once origin and a destination exist but no scenario", () => {
    expect(
      resumeScreen({
        cityId: "canterbury",
        analysisId: "remove-route-135",
        origin: { address: "123 Main St", lat: -43.5, lng: 172.6 },
        destinations: [
          { label: "Work", address: "1 Cashel St", lat: -43.53, lng: 172.63 },
        ],
        scenario: null,
      }),
    ).toBe("scenario");
  });

  it("resumes to results once everything is set", () => {
    expect(
      resumeScreen({
        cityId: "canterbury",
        analysisId: "remove-route-135",
        origin: { address: "123 Main St", lat: -43.5, lng: 172.6 },
        destinations: [
          { label: "Work", address: "1 Cashel St", lat: -43.53, lng: 172.63 },
        ],
        scenario: { calendarType: "weekday", timeWindow: "am_peak" },
      }),
    ).toBe("results");
  });
});
