import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WizardShell } from "../components/WizardShell";
import { Alert } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ToggleGroup } from "../components/ui/toggle-group";
import { DATA_BASE_URL } from "../config";
import {
  cityOptions,
  fetchAnalyses,
  filterByCity,
} from "../data/analysisCatalogue";
import type { AnalysisSummary } from "../data/analysisCatalogue";
import { type Consultation, fetchManifest } from "../data/manifest";
import { renderMarkdownLite, stripMarkdownLite } from "../lib/markdownLite";
import { navigate, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import type { WizardState } from "../state/wizardState";
import { emptyWizardState } from "../state/wizardState";

export interface ProposalCard extends AnalysisSummary {
  title: string;
  description: string;
  consultation: Consultation | null;
}

async function loadProposalCards(): Promise<ProposalCard[]> {
  const analyses = await fetchAnalyses();
  const results = await Promise.allSettled(
    analyses.map(async (a) => {
      const { analysis } = await fetchManifest(a.cityId, a.analysisId);
      return {
        ...a,
        title: analysis.title,
        description: analysis.description,
        consultation: analysis.consultation,
      };
    }),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<ProposalCard> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
}

export function isConsultationOpen(
  consultation: Consultation | null,
  now: Date = new Date(),
): boolean {
  return consultation !== null && new Date(consultation.closesAt) > now;
}

export function formatConsultationClose(closesAt: string): string {
  return new Date(closesAt).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Radix's ToggleGroup can't have an item whose own value is "" (see
// toggle-group.tsx), so "All cities" needs a real sentinel value instead.
const ALL_CITIES = "all";

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

// Descriptions can run to several paragraphs (they're the same copy used on
// a full detail page), so the card only shows a plain-text preview until the
// visitor asks for the rest.
const DESCRIPTION_PREVIEW_CHARS = 220;

function ProposalDescription({
  description,
  imageBase,
}: {
  description: string;
  imageBase: string;
}) {
  const [open, setOpen] = useState(false);
  const plain = stripMarkdownLite(description);
  const needsToggle = plain.length > DESCRIPTION_PREVIEW_CHARS;

  return (
    <>
      {open ? (
        <div className="mb-2 text-[12.5px] leading-relaxed text-ink-soft">
          {renderMarkdownLite(description, imageBase)}
        </div>
      ) : (
        <p className="mb-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-soft">
          {plain}
        </p>
      )}
      {needsToggle && (
        <button
          type="button"
          className="sd-focus mb-2 text-[11px] font-semibold text-kotare-blue"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
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
  const [cards, setCards] = useState<ProposalCard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const [cardsMinHeight, setCardsMinHeight] = useState(0);

  // retryCount isn't read in the body — it exists only to force a re-run
  // when the user clicks Retry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a re-run trigger, not a read dependency.
  useEffect(() => {
    setLoadError(false);
    loadProposalCards()
      .then(setCards)
      .catch(() => setLoadError(true));
  }, [retryCount]);

  // The "all cities" list is the tallest the card stack ever gets, so once
  // it's been measured, reserving that height keeps switching filters from
  // making the page jump/scroll.
  useLayoutEffect(() => {
    const height = cardsContainerRef.current?.scrollHeight ?? 0;
    if (height > cardsMinHeight) {
      setCardsMinHeight(height);
    }
  });

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

  if (!cards) {
    return <p className="text-ink-soft">Loading interventions…</p>;
  }

  const rawCity = search.get("city");
  const cityId = rawCity === null ? wizard.cityId : rawCity || null;
  const reason = search.get("reason");
  const shown = filterByCity(cards, cityId);
  const cities = cityOptions(cards);
  const bannerText = bannerTextFor(reason);

  return (
    <WizardShell step={1} title="Choose a proposal">
      {bannerText && <Alert className="mb-4">{bannerText}</Alert>}

      <ToggleGroup
        aria-label="Filter by city"
        value={cityId ?? ALL_CITIES}
        onValueChange={(next) =>
          navigate(
            "proposal",
            next === ALL_CITIES
              ? "?city="
              : `?city=${encodeURIComponent(next)}`,
          )
        }
        options={[
          { value: ALL_CITIES, label: "All cities" },
          ...cities.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      <div
        ref={cardsContainerRef}
        className="mt-5 flex flex-col gap-3"
        style={{ minHeight: cardsMinHeight || undefined }}
      >
        {shown.map((a) => (
          <Card key={a.analysisId}>
            <div className="mb-2 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                {a.cityName}
              </span>
              {a.consultation &&
                (isConsultationOpen(a.consultation) ? (
                  <Badge tone="blue">
                    Consultation closes{" "}
                    {formatConsultationClose(a.consultation.closesAt)}
                  </Badge>
                ) : (
                  <Badge tone="blue">Consultation closed</Badge>
                ))}
            </div>
            <h4 className="mb-1.5 text-[15px] font-bold text-ink">{a.title}</h4>
            <ProposalDescription
              description={a.description}
              imageBase={`${DATA_BASE_URL}/${a.cityId}/${a.analysisId}`}
            />
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
              {a.consultation?.url && (
                <a
                  href={a.consultation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="sd-focus flex-1 inline-flex items-center justify-center gap-1 h-11 rounded-lg border-2 border-kotare-blue text-[12.5px] font-bold text-kotare-blue hover:bg-kotare-blue/[0.06]"
                >
                  Learn more
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-[12px] text-ink-soft">
        {pickerSummaryText(cards.length, shown.length)}
      </p>
    </WizardShell>
  );
}
