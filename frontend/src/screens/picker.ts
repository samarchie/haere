import { renderChip } from "../components/chip";
import { renderStepper } from "../components/stepper";
import {
  type AnalysisSummary,
  cityOptions,
  fetchAnalyses,
  filterByCity,
} from "../data/analysisCatalogue";
import { el, mount, renderErrorBanner } from "../dom";
import { currentSearch, navigate } from "../router";
import {
  type WizardState,
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "../state/wizardState";

export function pickerSummaryText(
  total: number,
  shown: number,
  cityName: string | null,
): string {
  return cityName
    ? `${shown} of ${total} interventions · filtered by: ${cityName}`
    : `${shown} of ${total} interventions`;
}

export function bannerTextFor(reason: string | null): string | null {
  if (reason === "outside-area") {
    return "The address you entered isn't inside any modelled area yet. Here are the interventions we do have.";
  }
  if (reason === "multi-match") {
    return "That address falls inside more than one intervention in this city — pick the one you meant.";
  }
  return null;
}

export function selectAnalysis(
  state: WizardState,
  cityId: string,
  analysisId: string,
): WizardState {
  if (state.analysisId === analysisId) {
    return state;
  }
  return { ...emptyWizardState(), cityId, analysisId };
}

function consultationChipText(analysis: AnalysisSummary): string {
  if (analysis.consultationStatus === "open") {
    return `${analysis.cityName} · consultation open`;
  }
  if (analysis.consultationStatus === "closed") {
    return `${analysis.cityName} · consultation closed`;
  }
  return analysis.cityName;
}

export function renderPicker(root: HTMLElement): void {
  mount(root, el("p", {}, "Loading interventions…"));

  fetchAnalyses()
    .then((analyses) => {
      const cityId =
        currentSearch().get("city") ?? loadWizardState()?.cityId ?? null;
      const reason = currentSearch().get("reason");
      const shown = filterByCity(analyses, cityId);
      const cities = cityOptions(analyses);
      const cityName = cities.find((c) => c.id === cityId)?.name ?? null;
      const bannerText = bannerTextFor(reason);

      const chips = [
        renderChip("All cities", cityId === null, () => navigate("picker")),
        ...cities.map((c) =>
          renderChip(c.name, c.id === cityId, () =>
            navigate("picker", `?city=${encodeURIComponent(c.id)}`),
          ),
        ),
      ];

      const cards = shown.map((a) =>
        el(
          "div",
          { class: "card" },
          el("h3", {}, a.title),
          el("p", {}, a.description),
          el("span", { class: "chip" }, consultationChipText(a)),
          el(
            "div",
            {},
            el(
              "button",
              {
                class: "btn btn-primary",
                onclick: () => {
                  const current = loadWizardState() ?? emptyWizardState();
                  saveWizardState(
                    selectAnalysis(current, a.cityId, a.analysisId),
                  );
                  navigate("location");
                },
              },
              "Choose this intervention",
            ),
            a.consultationUrl
              ? el(
                  "a",
                  {
                    href: a.consultationUrl,
                    target: "_blank",
                    rel: "noopener",
                  },
                  "Learn more ↗",
                )
              : null,
          ),
        ),
      );

      mount(
        root,
        renderStepper("picker"),
        bannerText
          ? el("div", { class: "banner banner--warning" }, bannerText)
          : null,
        el("h2", {}, "Choose an intervention"),
        el("div", {}, ...chips),
        el("div", {}, ...cards),
        el("p", {}, pickerSummaryText(analyses.length, shown.length, cityName)),
      );
    })
    .catch(() => {
      renderErrorBanner(root, "Couldn't load interventions.", () =>
        renderPicker(root),
      );
    });
}
