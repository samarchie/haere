import { beforeEach, describe, expect, it } from "vitest";
import {
  WIZARD_STORAGE_KEY,
  type WizardState,
  clearWizardState,
  emptyWizardState,
  isValidDestination,
  loadWizardState,
  requireCityAndAnalysis,
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

  it("returns null for a malformed/legacy-shaped stored value instead of throwing downstream", () => {
    localStorage.setItem(
      WIZARD_STORAGE_KEY,
      JSON.stringify({
        cityId: "canterbury",
        analysisId: "remove-route-135",
        origin: null,
        // Legacy/corrupted shape: destinations missing entirely, and no
        // scenario field either.
      }),
    );
    expect(loadWizardState()).toBeNull();
  });

  it("returns null when destinations entries are missing required fields", () => {
    localStorage.setItem(
      WIZARD_STORAGE_KEY,
      JSON.stringify({
        cityId: "canterbury",
        analysisId: "remove-route-135",
        origin: null,
        destinations: [{ label: "Work" }],
        scenario: null,
      }),
    );
    expect(loadWizardState()).toBeNull();
  });

  it("clearWizardState removes the saved state", () => {
    saveWizardState(emptyWizardState());
    clearWizardState();
    expect(loadWizardState()).toBeNull();
  });

  it("returns null for a destination with a blank label", () => {
    localStorage.setItem(
      WIZARD_STORAGE_KEY,
      JSON.stringify({
        cityId: "canterbury",
        analysisId: "remove-route-135",
        origin: null,
        destinations: [
          { label: "", address: "15 Cashel Street", lat: -43.53, lng: 172.64 },
        ],
        scenario: null,
      }),
    );
    expect(loadWizardState()).toBeNull();
  });
});

describe("isValidDestination", () => {
  it("rejects a blank/whitespace-only label", () => {
    expect(
      isValidDestination({
        label: "   ",
        address: "15 Cashel Street",
        lat: -43.53,
        lng: 172.64,
      }),
    ).toBe(false);
  });

  it("accepts a valid destination", () => {
    expect(
      isValidDestination({
        label: "Work",
        address: "15 Cashel Street",
        lat: -43.53,
        lng: 172.64,
      }),
    ).toBe(true);
  });
});

describe("requireCityAndAnalysis", () => {
  it("returns null when cityId is missing", () => {
    expect(
      requireCityAndAnalysis({
        ...emptyWizardState(),
        analysisId: "remove-route-135",
      }),
    ).toBeNull();
  });

  it("returns null when analysisId is missing", () => {
    expect(
      requireCityAndAnalysis({ ...emptyWizardState(), cityId: "canterbury" }),
    ).toBeNull();
  });

  it("returns the cityId and analysisId when both are present", () => {
    const wizard: WizardState = {
      ...emptyWizardState(),
      cityId: "canterbury",
      analysisId: "remove-route-135",
    };
    expect(requireCityAndAnalysis(wizard)).toEqual({
      cityId: "canterbury",
      analysisId: "remove-route-135",
    });
  });
});
