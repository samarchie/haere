import { el, mount } from "../dom";
import { navigate } from "../router";
import {
  type WizardState,
  clearWizardState,
  loadWizardState,
} from "../state/wizardState";

export function hasResumableProgress(state: WizardState): boolean {
  return (
    state.analysisId !== null ||
    state.origin !== null ||
    state.destinations.length > 0 ||
    state.scenario !== null
  );
}

export function resumeScreen(
  state: WizardState,
): "picker" | "location" | "scenario" | "results" {
  if (state.analysisId === null) {
    return "picker";
  }
  if (state.origin === null || state.destinations.length === 0) {
    return "location";
  }
  if (state.scenario === null) {
    return "scenario";
  }
  return "results";
}

export function renderLanding(root: HTMLElement): void {
  const state = loadWizardState();
  const resumable = state !== null && hasResumableProgress(state);

  mount(
    root,
    resumable
      ? el(
          "div",
          { class: "banner" },
          el("p", {}, "Continue where you left off?"),
          el(
            "button",
            {
              class: "btn btn-primary",
              onclick: () => navigate(resumeScreen(state as WizardState)),
            },
            "Continue",
          ),
          el(
            "button",
            {
              class: "btn btn-ghost",
              onclick: () => {
                clearWizardState();
                renderLanding(root);
              },
            },
            "Start over",
          ),
        )
      : null,
    el("h1", {}, "haere"),
    el(
      "p",
      {},
      "See how a proposed transit change affects the trips you actually take.",
    ),
    el(
      "button",
      { class: "btn btn-primary", onclick: () => navigate("picker") },
      "Check your address",
    ),
    el(
      "button",
      { class: "btn btn-ghost", onclick: () => navigate("picker") },
      "View proposed network changes →",
    ),
    el(
      "div",
      {},
      el("span", { class: "chip" }, "Interventions modelled so far"),
      el("span", { class: "chip" }, "Built from each council's own GTFS feed"),
    ),
  );
}
