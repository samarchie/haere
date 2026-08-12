import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { navigate } from "../router";
import { WizardStateProvider } from "../state/WizardStateContext";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import { Landing, hasResumableProgress, resumeScreen } from "./Landing";

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
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("shows the primary CTA when there is no saved progress", () => {
    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    expect(
      screen.getByRole("button", { name: /check your address/i }),
    ).toBeInTheDocument();
  });

  it("shows a resume banner when there is saved progress", () => {
    saveWizardState({ ...emptyWizardState(), analysisId: "remove-135" });
    render(
      <WizardStateProvider>
        <Landing />
      </WizardStateProvider>,
    );
    const resumeButton = screen.getByRole("button", { name: /resume/i });
    fireEvent.click(resumeButton);
    expect(window.location.pathname).toBe("/location");
  });
});
