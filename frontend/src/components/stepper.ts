import { el } from "../dom";
import { type Screen, navigate } from "../router";

interface StepDefinition {
  screen: Screen;
  label: string;
}

const STEPS: StepDefinition[] = [
  { screen: "picker", label: "① City/Analysis" },
  { screen: "location", label: "② Location" },
  { screen: "scenario", label: "③ Scenario" },
  { screen: "results", label: "④ Results" },
];

export function renderStepper(
  current: Screen,
  onNavigate: (screen: Screen) => void = navigate,
): HTMLElement {
  const currentIndex = STEPS.findIndex((step) => step.screen === current);

  const stepEls = STEPS.map((step, index) => {
    if (index < currentIndex) {
      return el(
        "button",
        {
          class: "stepper__link",
          "data-step": step.screen,
          type: "button",
          onclick: () => onNavigate(step.screen),
        },
        step.label,
      );
    }
    if (index === currentIndex) {
      return el(
        "span",
        { class: "stepper__current", "data-step": step.screen },
        step.label,
      );
    }
    return el(
      "span",
      { class: "stepper__future", "data-step": step.screen },
      step.label,
    );
  });

  const spacedStepEls = stepEls.flatMap((stepEl, index) =>
    index === 0 ? [stepEl] : [" ", stepEl],
  );

  return el("div", { class: "stepper" }, ...spacedStepEls);
}
