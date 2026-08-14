import {
  AlertCircle,
  ArrowUpRight,
  ChevronDown,
  Megaphone,
  RefreshCw,
  Repeat,
  Share,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DumbbellChart, type DumbbellTone } from "../components/DumbbellChart";
import { WizardShell } from "../components/WizardShell";
import { Alert } from "../components/ui/alert";
import { Badge, type BadgeTone } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ToggleGroup } from "../components/ui/toggle-group";
import { DATA_BASE_URL } from "../config";
import { type AnalysisSummary, fetchAnalyses } from "../data/analysisCatalogue";
import { fetchHexIds, resolveHexRowIndex } from "../data/hexLookup";
import {
  type Manifest,
  type Scenario,
  fetchManifest,
  findScenario,
  isConsultationOpen,
} from "../data/manifest";
import {
  computeDeltaMinutes,
  fetchRow,
  readValueAt,
  toVerdictValue,
} from "../data/travelTimes";
import { navigate, replaceScreen, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import { appendHistoryEntry } from "../state/resultsHistory";
import {
  type ResultsPayload,
  decodeResultsParam,
  encodeResultsParam,
  toWizardState,
} from "../state/resultsUrl";
import { availableCombos, defaultScenario } from "../state/scenarioDefaults";
import type { Destination } from "../state/wizardState";

export interface PercentileMinutes {
  low: number | null;
  mid: number | null;
  high: number | null;
}

export function readPercentileMinutes(
  rows: Record<number, Uint8Array>,
  colIndex: number,
  bytesPerValue: number,
  unreachable: number,
  percentiles: number[],
): PercentileMinutes {
  const read = (p: number): number | null => {
    const row = rows[p];
    if (!row) return null;
    return toVerdictValue(
      readValueAt(row, colIndex, bytesPerValue),
      unreachable,
    ).minutes;
  };
  const sorted = [...percentiles].sort((a, b) => a - b);
  const midPercentile = sorted.reduce((closest, p) =>
    Math.abs(p - 50) < Math.abs(closest - 50) ? p : closest,
  );
  const mid = read(midPercentile);
  if (sorted.length < 2) {
    return { low: null, mid, high: null };
  }
  return { low: read(sorted[0]), mid, high: read(sorted[sorted.length - 1]) };
}

// r5py routing noise can shift a trip by 1-2 min with no real-world cause;
// treat anything that small as no change rather than a false positive.
const NOISE_THRESHOLD_MINUTES = 2;

export function deltaFor(
  baseline: PercentileMinutes,
  modified: PercentileMinutes,
): number | null {
  const delta = computeDeltaMinutes(
    { minutes: baseline.mid },
    { minutes: modified.mid },
  );
  if (delta !== null && Math.abs(delta) <= NOISE_THRESHOLD_MINUTES) return 0;
  return delta;
}

function formatSide(
  minutes: PercentileMinutes,
  whenLabel: "today" | "after",
): string {
  if (minutes.mid === null) return `not reachable ${whenLabel}`;
  if (minutes.low !== null && minutes.high !== null) {
    return `${minutes.mid} min ${whenLabel} (usually ${minutes.low}–${minutes.high})`;
  }
  return `${minutes.mid} min ${whenLabel}`;
}

export function formatArrow(
  baseline: PercentileMinutes,
  modified: PercentileMinutes,
  delta: number | null,
): string {
  if (baseline.mid === null && modified.mid === null) {
    return "No transit route reaches this destination, before or after.";
  }
  // Noise-thresholded delta is 0: show "after" as unchanged from "today" so
  // this sentence doesn't contradict the "No change" badge above it.
  const effectiveModified = delta === 0 ? baseline : modified;
  return `${formatSide(baseline, "today")} → ${formatSide(effectiveModified, "after")}.`;
}

export function formatDelta(
  delta: number | null,
  baseline: PercentileMinutes,
  modified: PercentileMinutes,
): { text: string; tone: "better" | "worse" | "none" } {
  if (delta === null) {
    if (baseline.mid !== null && modified.mid === null)
      return { text: "No longer reachable", tone: "worse" };
    if (baseline.mid === null && modified.mid !== null)
      return { text: "Newly reachable", tone: "better" };
    return { text: "No route today or after", tone: "none" };
  }
  if (delta === 0) return { text: "No change", tone: "none" };
  const tone = delta > 0 ? "worse" : "better";
  const sign = delta > 0 ? "+" : "";
  return { text: `${sign}${delta} min · ${tone}`, tone };
}

export function formatHeadline(changedCount: number, total: number): string {
  if (total === 1) {
    return changedCount === 1
      ? "Your trip changes under this proposal."
      : "Your trip doesn't change under this proposal.";
  }
  if (changedCount === 0)
    return "None of your trips change under this proposal.";
  if (changedCount === total)
    return "All of your trips change under this proposal.";
  const verb = changedCount === 1 ? "changes" : "change";
  return `${changedCount} of your ${total} trips ${verb} under this proposal.`;
}

const TONE_TO_BADGE: Record<"better" | "worse" | "none", BadgeTone> = {
  better: "teal",
  worse: "brown",
  none: "grey",
};

export function computeAxisMaxMinutes(
  percentileSets: PercentileMinutes[],
): number {
  const values = percentileSets
    .map((p) => p.mid)
    .filter((m): m is number => m !== null);
  if (values.length === 0) return 10;
  return Math.max(10, Math.ceil(Math.max(...values) / 10) * 10);
}

const TONE_TO_DUMBBELL: Record<"better" | "worse" | "none", DumbbellTone> = {
  better: "better",
  worse: "worse",
  none: "none",
};

interface VerdictRow {
  destination: Destination;
  baseline: PercentileMinutes;
  modified: PercentileMinutes;
  delta: number | null;
}

interface FetchedRows {
  baseline: Record<number, Uint8Array>;
  modified: Record<number, Uint8Array>;
}

async function fetchAllRows(
  cityId: string,
  analysisId: string,
  scenario: Scenario,
  percentiles: number[],
  rowIndex: number,
  hexCount: number,
  bytesPerValue: number,
): Promise<FetchedRows> {
  async function fetchVariant(
    variant: "baseline" | "modified",
  ): Promise<Record<number, Uint8Array>> {
    const rows: Record<number, Uint8Array> = {};
    await Promise.all(
      percentiles.map(async (p) => {
        const path = scenario.variants[variant]?.[String(p)];
        if (!path) return;
        rows[p] = await fetchRow(
          `${DATA_BASE_URL}/${cityId}/${analysisId}/${path}`,
          rowIndex,
          hexCount,
          bytesPerValue,
        );
      }),
    );
    return rows;
  }

  const [baseline, modified] = await Promise.all([
    fetchVariant("baseline"),
    fetchVariant("modified"),
  ]);
  return { baseline, modified };
}

function buildVerdictRows(
  destinations: Destination[],
  manifest: Manifest,
  hexIds: string[],
  rows: FetchedRows,
): VerdictRow[] {
  return destinations.map((destination) => {
    const colIndex = resolveHexRowIndex(
      destination.lat,
      destination.lng,
      manifest.hexagonResolution,
      hexIds,
    );
    const unreachable: PercentileMinutes = { low: null, mid: null, high: null };
    const colInRange =
      colIndex !== null && colIndex >= 0 && colIndex < manifest.hexCount;
    const baseline = !colInRange
      ? unreachable
      : readPercentileMinutes(
          rows.baseline,
          colIndex,
          manifest.encoding.bytesPerValue,
          manifest.encoding.unreachable,
          manifest.percentiles,
        );
    const modified = !colInRange
      ? unreachable
      : readPercentileMinutes(
          rows.modified,
          colIndex,
          manifest.encoding.bytesPerValue,
          manifest.encoding.unreachable,
          manifest.percentiles,
        );
    return {
      destination,
      baseline,
      modified,
      delta: deltaFor(baseline, modified),
    };
  });
}

function shareResults(onCopied: () => void): void {
  const shareData = { title: "haere", url: location.href };
  const nav = navigator as Navigator & {
    share?: (data: typeof shareData) => Promise<void>;
  };
  if (nav.share) {
    nav.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(location.href).then(onCopied, () => {});
  }
}

interface LoadedData {
  analysis: AnalysisSummary | null;
  manifest: Manifest;
  hexIds: string[];
  payload: ResultsPayload;
  rows: FetchedRows;
}

export function Results() {
  const { wizard, setWizard } = useWizardState();
  const search = useSearchParams();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; data: LoadedData }
  >({ status: "loading" });
  // The scenario currently being viewed on screen. Neither updating wizard
  // state nor rewriting the URL (via replaceState, which fires no event)
  // triggers a re-render on its own, so changeScenario() below writes here
  // too — this is what actually drives the data-loading effect to re-run.
  const [viewScenario, setViewScenario] = useState<{
    calendarType: string;
    timeWindow: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [expandedDestinations, setExpandedDestinations] = useState<Set<string>>(
    new Set(),
  );

  function toggleExpanded(label: string) {
    setExpandedDestinations((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const encoded = search.get("r");
  const {
    cityId,
    analysisId,
    origin,
    destinations,
    scenario: savedScenario,
  } = wizard;

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is a re-run trigger, not a read dependency.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      let payload = encoded ? decodeResultsParam(encoded) : null;

      if (!payload) {
        if (!cityId || !analysisId || !origin || destinations.length === 0) {
          navigate("landing");
          return;
        }

        let scenario = viewScenario ?? savedScenario;
        if (!scenario) {
          const manifestForDefault = await fetchManifest(cityId, analysisId);
          scenario = defaultScenario(availableCombos(manifestForDefault));
          if (!scenario) {
            if (!cancelled) setState({ status: "error" });
            return;
          }
        }

        payload = {
          cityId,
          analysisId,
          origin,
          destinations,
          scenario,
        };
        replaceScreen("results", `?r=${encodeResultsParam(payload)}`);
      } else if (viewScenario) {
        payload = { ...payload, scenario: viewScenario };
      }

      if (!viewScenario && !cancelled) {
        setViewScenario(payload.scenario);
      }

      try {
        const [manifest, hexIds, analyses] = await Promise.all([
          fetchManifest(payload.cityId, payload.analysisId),
          fetchHexIds(payload.cityId, payload.analysisId),
          fetchAnalyses(),
        ]);
        const analysis =
          analyses.find(
            (a) =>
              a.cityId === payload.cityId &&
              a.analysisId === payload.analysisId,
          ) ?? null;
        const scenario = findScenario(
          manifest,
          payload.scenario.calendarType,
          payload.scenario.timeWindow,
        );
        const originRow = resolveHexRowIndex(
          payload.origin.lat,
          payload.origin.lng,
          manifest.hexagonResolution,
          hexIds,
        );
        if (!scenario || originRow === null) {
          if (!cancelled) setState({ status: "error" });
          return;
        }

        const rows = await fetchAllRows(
          payload.cityId,
          payload.analysisId,
          scenario,
          manifest.percentiles,
          originRow,
          manifest.hexCount,
          manifest.encoding.bytesPerValue,
        );

        if (!cancelled) {
          setState({
            status: "ready",
            data: { analysis, manifest, hexIds, payload, rows },
          });
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // Re-runs when the URL payload, the wizard's own saved trip, or the
    // in-screen scenario selection changes. retryCount isn't read in the
    // body — it exists only to force a re-run when the user clicks Retry.
  }, [
    encoded,
    cityId,
    analysisId,
    origin,
    destinations,
    savedScenario,
    viewScenario,
    retryCount,
  ]);

  const verdictRows = useMemo(
    () =>
      state.status === "ready"
        ? buildVerdictRows(
            state.data.payload.destinations,
            state.data.manifest,
            state.data.hexIds,
            state.data.rows,
          )
        : [],
    [state],
  );

  const changedCount = verdictRows.filter(
    (row) => row.delta !== null && row.delta !== 0,
  ).length;

  useEffect(() => {
    if (state.status !== "ready") return;
    const { analysis, manifest, payload } = state.data;

    appendHistoryEntry({
      cityId: payload.cityId,
      analysisId: payload.analysisId,
      proposalTitle: manifest.analysis.title,
      cityName: analysis?.cityName ?? payload.cityId,
      origin: payload.origin,
      destinations: payload.destinations,
      scenario: payload.scenario,
      destinationCount: payload.destinations.length,
      changedCount,
    });
  }, [state, changedCount]);

  if (state.status === "loading") {
    return (
      <WizardShell step={3} title="Your results">
        <p className="text-ink-soft">Loading your results…</p>
      </WizardShell>
    );
  }
  if (state.status === "error") {
    return (
      <WizardShell step={3} title="Your results">
        <Alert>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-ink-soft" />
              <div>
                <p className="mb-1 text-[13px] font-bold text-ink">
                  Couldn't load your results
                </p>
                <p className="text-[11.5px] leading-snug text-ink-faint">
                  Try again shortly — this is usually temporary.
                </p>
              </div>
            </div>
            <Button
              className="flex-shrink-0"
              variant="outline"
              onClick={() => {
                setState({ status: "loading" });
                setRetryCount((n) => n + 1);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </Alert>
      </WizardShell>
    );
  }

  const { manifest, payload } = state.data;
  const combos = availableCombos(manifest);
  const calendarTypes = combos.filter(
    (c, index) =>
      combos.findIndex((other) => other.calendarType === c.calendarType) ===
      index,
  );
  const timeWindows = combos.filter(
    (c) => c.calendarType === payload.scenario.calendarType,
  );
  function backToLocation() {
    setWizard(toWizardState(payload));
    navigate("location");
  }

  function changeScenario(next: { calendarType: string; timeWindow: string }) {
    const updated = { ...payload, scenario: next };
    setViewScenario(next);
    setWizard(toWizardState(updated));
    replaceScreen("results", `?r=${encodeResultsParam(updated)}`);
  }

  return (
    <WizardShell step={3} title="Your results">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        Selected proposal
      </div>

      <p className="mb-1 truncate text-[15px] sm:text-[17px] font-bold tracking-[-0.01em] text-ink">
        {manifest.analysis.title}
      </p>

      <h3 className="mb-4 text-[22px] sm:text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink">
        {formatHeadline(changedCount, verdictRows.length)}
      </h3>

      <div className="mb-4 border-b border-kotare-grey/50 pb-4">
        <div className="flex flex-col items-start gap-3">
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
              Day type
            </div>
            <p className="mb-1.5 text-[10.5px] leading-snug text-ink-faint">
              Which kind of day to compare trips on.
            </p>
            <ToggleGroup
              aria-label="Day type"
              value={payload.scenario.calendarType}
              onValueChange={(calendarType) => {
                const firstForType = combos.find(
                  (c) => c.calendarType === calendarType && c.complete,
                );
                if (firstForType)
                  changeScenario({
                    calendarType,
                    timeWindow: firstForType.timeWindow,
                  });
              }}
              options={calendarTypes.map((c) => ({
                value: c.calendarType,
                label: c.calendarTypeLabel,
              }))}
            />
          </div>
          <div>
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
              Time window
            </div>
            <p className="mb-1.5 text-[10.5px] leading-snug text-ink-faint">
              Which part of the day to compare trips in. Each trip is checked
              many times, not once — hollow dot is today's typical trip, solid
              is after.
            </p>
            <ToggleGroup
              aria-label="Time window"
              value={payload.scenario.timeWindow}
              onValueChange={(timeWindow) =>
                changeScenario({
                  calendarType: payload.scenario.calendarType,
                  timeWindow,
                })
              }
              options={timeWindows.map((c) => ({
                value: c.timeWindow,
                label: c.timeWindowLabel,
                disabled: !c.complete,
              }))}
            />
          </div>
        </div>
      </div>

      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
        Your trips
      </div>

      <div className="flex flex-col divide-y divide-kotare-grey/60">
        {(() => {
          const axisMaxMinutes = computeAxisMaxMinutes(
            verdictRows.flatMap(({ baseline, modified }) => [
              baseline,
              modified,
            ]),
          );
          return (
            <>
              {verdictRows.map(
                ({ destination, baseline, modified, delta }, index) => {
                  const { text, tone } = formatDelta(delta, baseline, modified);
                  const hasChart =
                    baseline.mid !== null && modified.mid !== null;
                  const expanded = expandedDestinations.has(destination.label);
                  const detailId = `destination-detail-${index}`;
                  return (
                    <div key={destination.label} className="py-3">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={() => toggleExpanded(destination.label)}
                        className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                      >
                        <strong className="text-[13.5px] font-bold text-ink">
                          {destination.label}
                        </strong>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          <Badge tone={TONE_TO_BADGE[tone]}>{text}</Badge>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-ink-faint transition-transform duration-150 ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                      {hasChart ? (
                        <DumbbellChart
                          todayMinutes={baseline.mid as number}
                          afterMinutes={
                            delta === 0
                              ? (baseline.mid as number)
                              : (modified.mid as number)
                          }
                          axisMaxMinutes={axisMaxMinutes}
                          tone={TONE_TO_DUMBBELL[tone]}
                          staggerIndex={index}
                        />
                      ) : (
                        <div className="flex h-4 items-center justify-center rounded-full border border-dashed border-ink-faint/60">
                          <span className="whitespace-nowrap bg-surface-card px-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                            no route found
                          </span>
                        </div>
                      )}
                      {expanded && (
                        <p
                          id={detailId}
                          className="mt-2 text-[11.5px] leading-snug text-ink-soft"
                        >
                          {formatArrow(baseline, modified, delta)}
                        </p>
                      )}
                    </div>
                  );
                },
              )}
            </>
          );
        })()}
      </div>

      {manifest.analysis.consultation?.url &&
        (() => {
          const consultationOpen = isConsultationOpen(
            manifest.analysis.consultation,
          );
          if (!consultationOpen) {
            return (
              <div className="mt-4 rounded-lg border border-kotare-grey/70 bg-surface-card p-4">
                <p className="mb-1 text-[13px] font-extrabold text-ink-soft">
                  Consultation closed
                </p>
                <p className="mb-2 text-[11.5px] text-ink-faint">
                  Consultation on this proposal has closed.
                </p>
                <a
                  href={manifest.analysis.consultation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="sd-focus inline-flex items-center gap-1 text-[11.5px] font-bold text-kotare-blue"
                >
                  See the proposal
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            );
          }
          return (
            <div className="mt-4 rounded-lg bg-kotare-navy p-4 shadow-md shadow-kotare-navy/25">
              <div className="mb-1 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-white" />
                <p className="text-[13px] font-extrabold text-white">
                  Consultation open
                </p>
              </div>
              <p className="mb-3 text-[11.5px] text-white/85">
                Have your say on this proposal before it's decided.
              </p>
              <a
                href={manifest.analysis.consultation.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-white text-[12.5px] font-extrabold text-kotare-navy"
              >
                Have your say
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          );
        })()}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={backToLocation}>
          ← Back
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            shareResults(() => {
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            })
          }
        >
          <Share className="h-3.5 w-3.5" />
          {linkCopied ? "Link copied!" : "Share"}
        </Button>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={() =>
            navigate(
              "proposal",
              `?switch=1&city=${encodeURIComponent(payload.cityId)}`,
            )
          }
        >
          <Repeat className="h-3.5 w-3.5" />
          Switch proposal
        </Button>
      </div>
    </WizardShell>
  );
}
