import {
  type Manifest,
  fetchManifest,
  isScenarioComplete,
} from "../data/manifest";
import { el, mount } from "../dom";
import { navigate } from "../router";
import {
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "../state/wizardState";

export interface ScenarioCombo {
  calendarType: string;
  timeWindow: string;
  complete: boolean;
}

export function availableCombos(manifest: Manifest): ScenarioCombo[] {
  return manifest.scenarios.map((s) => ({
    calendarType: s.calendarType,
    timeWindow: s.timeWindow,
    complete: isScenarioComplete(s, manifest.percentiles),
  }));
}

export function defaultScenario(
  combos: ScenarioCombo[],
): { calendarType: string; timeWindow: string } | null {
  const weekdayAmPeak = combos.find(
    (c) =>
      c.calendarType === "weekday" && c.timeWindow === "am_peak" && c.complete,
  );
  if (weekdayAmPeak) {
    return {
      calendarType: weekdayAmPeak.calendarType,
      timeWindow: weekdayAmPeak.timeWindow,
    };
  }
  const firstComplete = combos.find((c) => c.complete);
  return firstComplete
    ? {
        calendarType: firstComplete.calendarType,
        timeWindow: firstComplete.timeWindow,
      }
    : null;
}

export function renderScenario(root: HTMLElement): void {
  const wizard = loadWizardState() ?? emptyWizardState();
  if (wizard.cityId === null || wizard.analysisId === null) {
    navigate("picker");
    return;
  }
  const cityId = wizard.cityId;
  const analysisId = wizard.analysisId;

  mount(root, el("p", {}, "Loading scenario options…"));

  fetchManifest(cityId, analysisId)
    .then((manifest) => {
      const combos = availableCombos(manifest);
      let selected = wizard.scenario ?? defaultScenario(combos);

      function renderChips(): void {
        const calendarTypes = Array.from(
          new Set(combos.map((c) => c.calendarType)),
        );
        const timeWindows = selected
          ? combos.filter((c) => c.calendarType === selected?.calendarType)
          : [];

        const calendarChips = calendarTypes.map((ct) =>
          el(
            "button",
            {
              class: selected?.calendarType === ct ? "chip selected" : "chip",
              onclick: () => {
                const firstForType = combos.find(
                  (c) => c.calendarType === ct && c.complete,
                );
                selected = firstForType
                  ? {
                      calendarType: firstForType.calendarType,
                      timeWindow: firstForType.timeWindow,
                    }
                  : {
                      calendarType: ct,
                      timeWindow:
                        combos.find((c) => c.calendarType === ct)?.timeWindow ??
                        "",
                    };
                renderChips();
              },
            },
            ct,
          ),
        );

        const timeWindowChips = timeWindows.map((c) =>
          el(
            "button",
            {
              class:
                selected?.timeWindow === c.timeWindow
                  ? "chip selected"
                  : "chip",
              disabled: !c.complete,
              title: c.complete
                ? ""
                : "This combination isn't fully modelled yet",
              onclick: () => {
                if (!c.complete) return;
                selected = {
                  calendarType: c.calendarType,
                  timeWindow: c.timeWindow,
                };
                renderChips();
              },
            },
            c.timeWindow,
          ),
        );

        const canProceed =
          selected !== null &&
          combos.some(
            (c) =>
              c.calendarType === selected?.calendarType &&
              c.timeWindow === selected?.timeWindow &&
              c.complete,
          );

        mount(
          root,
          el(
            "div",
            { class: "stepper" },
            "① City/Analysis  ② Location  ③ Scenario  ④ Results",
          ),
          el("h2", {}, "When are you travelling?"),
          el("div", {}, ...calendarChips),
          el("div", {}, ...timeWindowChips),
          el(
            "button",
            {
              class: "btn btn-primary",
              disabled: !canProceed,
              onclick: () => {
                if (!canProceed || !selected) return;
                saveWizardState({ ...wizard, scenario: selected });
                navigate("results");
              },
            },
            "See results →",
          ),
        );
      }

      renderChips();
    })
    .catch(() => {
      mount(
        root,
        el(
          "div",
          { class: "banner banner--warning" },
          "Couldn't load scenario options.",
        ),
        el(
          "button",
          { class: "btn", onclick: () => renderScenario(root) },
          "Retry",
        ),
      );
    });
}
