import { renderChip } from "../components/chip";
import { renderStepper } from "../components/stepper";
import {
  type Manifest,
  fetchManifest,
  isScenarioComplete,
} from "../data/manifest";
import { el, mount, renderErrorBanner } from "../dom";
import { navigate } from "../router";
import {
  emptyWizardState,
  loadWizardState,
  requireCityAndAnalysis,
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

function isCompleteSelection(
  sel: { calendarType: string; timeWindow: string } | null,
  combos: ScenarioCombo[],
): boolean {
  return (
    sel !== null &&
    combos.some(
      (c) =>
        c.calendarType === sel.calendarType &&
        c.timeWindow === sel.timeWindow &&
        c.complete,
    )
  );
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
  const ids = requireCityAndAnalysis(wizard);
  if (!ids) {
    navigate("picker");
    return;
  }
  const { cityId, analysisId } = ids;

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

        function persistIfComplete(): void {
          // only a complete combo is safe to persist immediately — an incomplete pick stays local until corrected or abandoned
          if (isCompleteSelection(selected, combos)) {
            saveWizardState({ ...wizard, scenario: selected });
          }
        }

        const calendarChips = calendarTypes.map((ct) =>
          renderChip(ct, selected?.calendarType === ct, () => {
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
                    combos.find((c) => c.calendarType === ct)?.timeWindow ?? "",
                };
            persistIfComplete();
            renderChips();
          }),
        );

        const timeWindowChips = timeWindows.map((c) =>
          renderChip(
            c.timeWindow,
            selected?.timeWindow === c.timeWindow,
            () => {
              if (!c.complete) return;
              selected = {
                calendarType: c.calendarType,
                timeWindow: c.timeWindow,
              };
              persistIfComplete();
              renderChips();
            },
            {
              disabled: !c.complete,
              title: c.complete
                ? ""
                : "This combination isn't fully modelled yet",
            },
          ),
        );

        const canProceed = isCompleteSelection(selected, combos);

        mount(
          root,
          renderStepper("scenario"),
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
      renderErrorBanner(root, "Couldn't load scenario options.", () =>
        renderScenario(root),
      );
    });
}
