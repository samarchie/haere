import { useEffect, useState } from "react";
import { WizardShell } from "../components/WizardShell";
import { Alert } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ToggleGroup } from "../components/ui/toggle-group";
import {
  type AnalysisSummary,
  cityOptions,
  fetchAnalyses,
  filterByCity,
} from "../data/analysisCatalogue";
import { navigate, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import type { WizardState } from "../state/wizardState";
import { emptyWizardState } from "../state/wizardState";

export function pickerSummaryText(total: number, shown: number): string {
  return `${shown} of ${total} interventions`;
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
  return { ...emptyWizardState(), cityId, analysisId, origin: state.origin };
}

export function Proposal() {
  const { wizard, setWizard } = useWizardState();
  const search = useSearchParams();
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // retryCount isn't read in the body — it exists only to force a re-run
  // when the user clicks Retry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a re-run trigger, not a read dependency.
  useEffect(() => {
    setLoadError(false);
    fetchAnalyses()
      .then((fetched) => {
        setAnalyses(fetched);
        setExpandedId(fetched[0]?.analysisId ?? null);
      })
      .catch(() => setLoadError(true));
  }, [retryCount]);

  if (loadError) {
    return (
      <div>
        <Alert className="mb-3">Couldn't load interventions.</Alert>
        <Button variant="outline" onClick={() => setRetryCount((n) => n + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (!analyses) {
    return <p className="text-ink-soft">Loading interventions…</p>;
  }

  const rawCity = search.get("city");
  const cityId = rawCity === null ? wizard.cityId : rawCity || null;
  const reason = search.get("reason");
  const shown = filterByCity(analyses, cityId);
  const cities = cityOptions(analyses);
  const bannerText = bannerTextFor(reason);

  return (
    <WizardShell step={1} title="Choose a proposal">
      {bannerText && <Alert className="mb-4">{bannerText}</Alert>}

      <ToggleGroup
        aria-label="Filter by city"
        value={cityId ?? ""}
        onValueChange={(next) =>
          navigate(
            "proposal",
            next ? `?city=${encodeURIComponent(next)}` : "?city=",
          )
        }
        options={[
          { value: "", label: "All cities" },
          ...cities.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      <div className="mt-5 flex flex-col gap-3">
        {shown.map((a) => {
          const isExpanded = expandedId === a.analysisId;
          return (
            <Card
              key={a.analysisId}
              state={isExpanded ? "expanded" : "resting"}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  {a.cityName}
                </span>
                {a.consultationStatus === "open" && (
                  <Badge tone="navy">Consultation open</Badge>
                )}
              </div>
              <h4 className="mb-1.5 text-[15px] font-bold text-ink">
                {a.title}
              </h4>
              <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
                {a.description}
              </p>
              {isExpanded ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      setWizard(selectAnalysis(wizard, a.cityId, a.analysisId));
                      navigate("location");
                    }}
                  >
                    Select this proposal
                  </Button>
                  {a.consultationUrl && (
                    <a
                      href={a.consultationUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="sd-focus flex-1 inline-flex items-center justify-center gap-1 h-11 rounded-lg border-2 border-kotare-blue text-[12.5px] font-bold text-kotare-blue hover:bg-kotare-blue/[0.06]"
                    >
                      Learn more
                    </a>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="sd-focus text-[11.5px] font-medium text-ink-soft"
                  onClick={() => setExpandedId(a.analysisId)}
                >
                  Expand
                </button>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-4 text-[12px] text-ink-soft">
        {pickerSummaryText(analyses.length, shown.length)}
      </p>
    </WizardShell>
  );
}
