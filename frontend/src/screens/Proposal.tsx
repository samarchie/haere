import { AlertCircle, X } from "lucide-react";
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
import {
  type Consultation,
  fetchManifest,
  isConsultationOpen,
} from "../data/manifest";
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

interface ProposalCardsResult {
  cards: ProposalCard[];
  failedCount: number;
}

async function loadProposalCards(): Promise<ProposalCardsResult> {
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
  const cards = results
    .filter(
      (r): r is PromiseFulfilledResult<ProposalCard> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
  return { cards, failedCount: results.length - cards.length };
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

interface RedirectBanner {
  title: string;
  subtitle: string;
}

export function bannerFor(
  reason: string | null,
  cityName: string | null,
): RedirectBanner | null {
  if (reason === "outside-area") {
    return {
      title: "That address isn't in a studied area yet",
      subtitle: "Showing every proposal so far — pick the one you meant.",
    };
  }
  if (reason === "multi-match") {
    return {
      title: "That address falls inside more than one proposal",
      subtitle: cityName
        ? `Showing every ${cityName} proposal — pick the one you meant.`
        : "Pick the one you meant.",
    };
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
  const [result, setResult] = useState<ProposalCardsResult | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const [cardsMinHeight, setCardsMinHeight] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // retryCount isn't read in the body — it exists only to force a re-run
  // when the user clicks Retry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a re-run trigger, not a read dependency.
  useEffect(() => {
    setLoadError(false);
    loadProposalCards()
      .then(setResult)
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

  if (!result) {
    return <p className="text-ink-soft">Loading interventions…</p>;
  }

  const { cards, failedCount } = result;
  const rawCity = search.get("city");
  const cityId = rawCity === null ? wizard.cityId : rawCity || null;
  const reason = search.get("reason");
  const shown = filterByCity(cards, cityId);
  const cities = cityOptions(cards);
  const cityName = cities.find((c) => c.id === cityId)?.name ?? null;
  const banner = bannerDismissed ? null : bannerFor(reason, cityName);

  return (
    <WizardShell step={1} title="Choose a proposal">
      {failedCount > 0 && (
        <Alert className="mb-4">
          {failedCount === 1
            ? "1 intervention couldn't be loaded and isn't shown below."
            : `${failedCount} interventions couldn't be loaded and aren't shown below.`}
        </Alert>
      )}
      {banner && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-kotare-grey bg-kotare-grey/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-soft" />
          <div className="flex-1">
            <div className="mb-0.5 text-[12px] font-bold text-ink">
              {banner.title}
            </div>
            <div className="text-[11px] leading-snug text-ink-soft">
              {banner.subtitle}
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="sd-focus flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-kotare-grey/25"
            onClick={() => setBannerDismissed(true)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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
        {pickerSummaryText(cards.length + failedCount, shown.length)}
      </p>
    </WizardShell>
  );
}
