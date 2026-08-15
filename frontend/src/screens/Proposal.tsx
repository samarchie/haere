import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  Repeat,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { ToggleGroup } from "../components/ui/toggle-group";
import { WizardShell } from "../components/WizardShell";
import { DATA_BASE_URL } from "../config";
import type { AnalysisSummary } from "../data/analysisCatalogue";
import {
  cityOptions,
  fetchAnalyses,
  filterByCity,
} from "../data/analysisCatalogue";
import {
  type Consultation,
  fetchManifest,
  isConsultationOpen,
} from "../data/manifest";
import { renderMarkdownLite, stripMarkdownLite } from "../lib/markdownLite";
import { useDocumentHead } from "../lib/useDocumentHead";
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
  if (state.cityId === cityId && state.analysisId === analysisId) {
    return state;
  }
  return { ...emptyWizardState(), cityId, analysisId, origin: state.origin };
}

// Switching proposals from Results changes nothing about the visitor's own
// trip — same origin, same destinations — so only the proposal itself and
// its (now stale) scenario reset; unlike selectAnalysis, nothing is thrown away.
export function switchAnalysis(
  state: WizardState,
  cityId: string,
  analysisId: string,
): WizardState {
  if (state.cityId === cityId && state.analysisId === analysisId) {
    return state;
  }
  return { ...state, cityId, analysisId, scenario: null };
}

export function Proposal() {
  useDocumentHead({
    title: "Choose a proposal",
    description:
      "Pick which proposed transport network change to check against your own trips.",
    path: "/proposal",
    noindex: true,
  });
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
    return (
      <WizardShell step={1} title="Choose a proposal">
        <div className="animate-pulse">
          <div className="flex gap-1.5 rounded-lg bg-kotare-grey/20 p-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-7 w-24 rounded-md bg-kotare-grey/60" />
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-kotare-grey/50 p-4"
              >
                <div className="mb-2 h-2.5 w-20 rounded bg-kotare-grey/60" />
                <div className="mb-1.5 h-4 w-2/3 rounded bg-kotare-grey/60" />
                <div className="mb-1 h-2.5 w-full rounded bg-kotare-grey/40" />
                <div className="mb-3 h-2.5 w-4/5 rounded bg-kotare-grey/40" />
                <div className="h-11 w-full rounded-lg bg-kotare-grey/60" />
              </div>
            ))}
          </div>
        </div>
      </WizardShell>
    );
  }

  const { cards, failedCount } = result;
  const isSwitching = search.get("switch") === "1";
  const rawCity = search.get("city");
  // Switching proposals keeps the visitor's saved origin, which was only
  // ever resolved against their current city's hex grid — so the city
  // filter is locked to it rather than left open to the URL/"all cities".
  const cityId = isSwitching
    ? (wizard.cityId ?? rawCity ?? null)
    : rawCity === null
      ? wizard.cityId
      : rawCity || null;
  const reason = search.get("reason");
  const shown = filterByCity(cards, cityId);
  const cities = cityOptions(cards);
  const cityName = cities.find((c) => c.id === cityId)?.name ?? null;
  const banner = bannerDismissed ? null : bannerFor(reason, cityName);

  return (
    <WizardShell
      step={isSwitching ? null : 1}
      title="Choose a proposal"
      headerAction={
        isSwitching && (
          <button
            type="button"
            className="sd-focus inline-flex flex-shrink-0 items-center gap-1 text-[11.5px] font-medium text-ink-soft hover:text-ink"
            onClick={() => navigate("results")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to results
          </button>
        )
      }
    >
      {failedCount > 0 && (
        <Alert className="mb-4">
          {failedCount === 1
            ? "1 intervention couldn't be loaded and isn't shown below."
            : `${failedCount} interventions couldn't be loaded and aren't shown below.`}
        </Alert>
      )}
      {isSwitching && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-kotare-blue/30 bg-kotare-blue/[0.05] p-3">
          <Repeat className="mt-0.5 h-4 w-4 flex-shrink-0 text-kotare-blue" />
          <div className="text-[11.5px] leading-snug text-ink-soft">
            Your address, destinations and travel times are saved — pick another
            proposal to see how it compares. Nothing to re-enter.
          </div>
        </div>
      )}
      {!isSwitching && banner && (
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
          { value: ALL_CITIES, label: "All cities", disabled: isSwitching },
          ...cities.map((c) => ({
            value: c.id,
            label: c.name,
            disabled: isSwitching && c.id !== cityId,
          })),
        ]}
      />
      {isSwitching && (
        <p className="mt-1.5 text-[11px] text-ink-faint">
          Locked to {cityName} — your saved address is only checked against this
          city's proposals.
        </p>
      )}

      <div
        ref={cardsContainerRef}
        className="mt-5 flex flex-col gap-3"
        style={{ minHeight: cardsMinHeight || undefined }}
      >
        {shown.map((a) => {
          const isCurrent =
            isSwitching &&
            wizard.cityId === a.cityId &&
            wizard.analysisId === a.analysisId;
          return (
            <Card
              key={a.analysisId}
              className={
                isCurrent
                  ? "border-2 border-kotare-navy bg-kotare-navy/[0.03]"
                  : undefined
              }
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                  {a.cityName}
                </span>
                {isCurrent && <Badge tone="grey">Current</Badge>}
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
              <h4 className="mb-1.5 text-[15px] font-bold text-ink">
                {a.title}
              </h4>
              <ProposalDescription
                description={a.description}
                imageBase={`${DATA_BASE_URL}/${a.cityId}/${a.analysisId}`}
              />
              {isCurrent ? (
                <p className="text-[11.5px] text-ink-soft">
                  You're viewing results for this proposal now.
                </p>
              ) : (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      if (isSwitching) {
                        setWizard(
                          switchAnalysis(wizard, a.cityId, a.analysisId),
                        );
                        navigate("results");
                      } else {
                        setWizard(
                          selectAnalysis(wizard, a.cityId, a.analysisId),
                        );
                        navigate("location");
                      }
                    }}
                  >
                    Select this proposal
                  </Button>
                  {a.consultation?.url && (
                    <a
                      href={a.consultation.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label="Learn more about this proposal's consultation"
                      className="sd-focus flex-1 inline-flex items-center justify-center gap-1 h-11 rounded-lg border-2 border-kotare-blue text-[12.5px] font-bold text-kotare-blue hover:bg-kotare-blue/[0.06]"
                    >
                      Learn more
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-4 font-mono text-[11px] text-ink-soft">
        {pickerSummaryText(cards.length + failedCount, shown.length)}
      </p>

      <Button
        variant="outline"
        className="mt-4"
        onClick={() => navigate("landing")}
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </Button>
    </WizardShell>
  );
}
