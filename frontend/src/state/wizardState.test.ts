import { beforeEach, describe, expect, it } from "vitest";
import {
  WIZARD_STORAGE_KEY,
  type WizardState,
  clearWizardState,
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "./wizardState";

describe("wizardState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is saved", () => {
    expect(loadWizardState()).toBeNull();
  });

  it("round-trips a full state through localStorage", () => {
    const state: WizardState = {
      cityId: "canterbury",
      analysisId: "remove-route-135",
      origin: { address: "123 Riccarton Road", lat: -43.53, lng: 172.62 },
      destinations: [
        {
          label: "Work",
          address: "15 Cashel Street",
          lat: -43.53,
          lng: 172.64,
        },
      ],
      scenario: { calendarType: "weekday", timeWindow: "am_peak" },
    };

    saveWizardState(state);

    expect(loadWizardState()).toEqual(state);
  });

  it("stores under the documented key", () => {
    saveWizardState(emptyWizardState());
    expect(localStorage.getItem(WIZARD_STORAGE_KEY)).not.toBeNull();
  });

  it("returns null for corrupted JSON rather than throwing", () => {
    localStorage.setItem(WIZARD_STORAGE_KEY, "{not json");
    expect(loadWizardState()).toBeNull();
  });

  it("clearWizardState removes the saved state", () => {
    saveWizardState(emptyWizardState());
    clearWizardState();
    expect(loadWizardState()).toBeNull();
  });
});
