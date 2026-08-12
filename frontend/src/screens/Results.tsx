import { useEffect, useState } from "react";
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
} from "../data/manifest";
import {
  computeDeltaMinutes,
  fetchRow,
  readValueAt,
  toVerdictValue,
} from "../data/travelTimes";
import { navigate, replaceScreen, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import {
  type ResultsPayload,
  decodeResultsParam,
  encodeResultsParam,
} from "../state/resultsUrl";
import { availableCombos, defaultScenario } from "../state/scenarioDefaults";
import type { Destination } from "../state/wizardState";

export interface PercentileMinutes {
  p25: number | null;
  p50: number | null;
  p75: number | null;
}

export function readPercentileMinutes(
  rows: Record<number, Uint8Array>,
  colIndex: number,
  bytesPerValue: number,
  unreachable: number,
): PercentileMinutes {
  const read = (p: number): number | null => {
    const row = rows[p];
    if (!row) return null;
    return toVerdictValue(
      readValueAt(row, colIndex, bytesPerValue),
      unreachable,
    ).minutes;
  };
  return { p25: read(25), p50: read(50), p75: read(75) };
}

export function formatRange(minutes: PercentileMinutes): string {
  if (minutes.p50 === null) return "—";
  if (minutes.p25 !== null && minutes.p75 !== null) {
    return `${minutes.p25}–${minutes.p75} min (typically ${minutes.p50})`;
  }
  return `${minutes.p50} min`;
}

export function deltaFor(
  baseline: PercentileMinutes,
  modified: PercentileMinutes,
): number | null {
  return computeDeltaMinutes(
    { minutes: baseline.p50 },
    { minutes: modified.p50 },
  );
}

export function formatDelta(
  delta: number | null,
  baseline: PercentileMinutes,
  modified: PercentileMinutes,
): { text: string; tone: "better" | "worse" | "none" } {
  if (delta === null) {
    if (baseline.p50 !== null && modified.p50 === null)
      return { text: "No longer reachable", tone: "worse" };
    if (baseline.p50 === null && modified.p50 !== null)
      return { text: "Newly reachable", tone: "better" };
    return { text: "No route today or after", tone: "none" };
  }
  if (delta === 0) return { text: "No change", tone: "none" };
  const tone = delta > 0 ? "worse" : "better";
  const sign = delta > 0 ? "+" : "";
  return { text: `${sign}${delta} min · ${tone}`, tone };
}

const TONE_TO_BADGE: Record<"better" | "worse" | "none", BadgeTone> = {
  better: "teal",
  worse: "brown",
  none: "grey",
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
  const jobs: Array<{
    p: number;
    variant: "baseline" | "modified";
    path: string;
  }> = [];
  for (const p of percentiles) {
    const baselinePath = scenario.variants.baseline?.[String(p)];
    const modifiedPath = scenario.variants.modified?.[String(p)];
    if (baselinePath) jobs.push({ p, variant: "baseline", path: baselinePath });
    if (modifiedPath) jobs.push({ p, variant: "modified", path: modifiedPath });
  }

  const fetched = await Promise.all(
    jobs.map((job) =>
      fetchRow(
        `${DATA_BASE_URL}/${cityId}/${analysisId}/${job.path}`,
        rowIndex,
        hexCount,
        bytesPerValue,
      ),
    ),
  );

  const baseline: Record<number, Uint8Array> = {};
  const modified: Record<number, Uint8Array> = {};
  jobs.forEach((job, i) => {
    (job.variant === "baseline" ? baseline : modified)[job.p] = fetched[i];
  });
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
    const unreachable: PercentileMinutes = { p25: null, p50: null, p75: null };
    const colInRange =
      colIndex !== null && colIndex >= 0 && colIndex < manifest.hexCount;
    const baseline = !colInRange
      ? unreachable
      : readPercentileMinutes(
          rows.baseline,
          colIndex,
          manifest.encoding.bytesPerValue,
          manifest.encoding.unreachable,
        );
    const modified = !colInRange
      ? unreachable
      : readPercentileMinutes(
          rows.modified,
          colIndex,
          manifest.encoding.bytesPerValue,
          manifest.encoding.unreachable,
        );
    return {
      destination,
      baseline,
      modified,
      delta: deltaFor(baseline, modified),
    };
  });
}

function shareResults(): void {
  const shareData = { title: "haere", url: location.href };
  const nav = navigator as Navigator & {
    share?: (data: typeof shareData) => Promise<void>;
  };
  if (nav.share) {
    nav.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(location.href).catch(() => {});
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

  const encoded = search.get("r");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      let payload = encoded ? decodeResultsParam(encoded) : null;

      if (!payload) {
        if (
          !wizard.cityId ||
          !wizard.analysisId ||
          !wizard.origin ||
          wizard.destinations.length === 0
        ) {
          navigate("landing");
          return;
        }

        let scenario = viewScenario ?? wizard.scenario;
        if (!scenario) {
          const manifestForDefault = await fetchManifest(
            wizard.cityId,
            wizard.analysisId,
          );
          scenario = defaultScenario(availableCombos(manifestForDefault));
          if (!scenario) {
            if (!cancelled) setState({ status: "error" });
            return;
          }
        }

        payload = {
          cityId: wizard.cityId,
          analysisId: wizard.analysisId,
          origin: wizard.origin,
          destinations: wizard.destinations,
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
          analyses.find((a) => a.analysisId === payload.analysisId) ?? null;
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
    // in-screen scenario selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encoded, wizard, viewScenario]);

  if (state.status === "loading") {
    return <p className="text-ink-soft">Loading your results…</p>;
  }
  if (state.status === "error") {
    return <Alert>Couldn't load your results. Try again shortly.</Alert>;
  }

  const { analysis, manifest, hexIds, payload, rows } = state.data;
  const verdictRows = buildVerdictRows(
    payload.destinations,
    manifest,
    hexIds,
    rows,
  );
  const combos = availableCombos(manifest);
  const calendarTypes = Array.from(new Set(combos.map((c) => c.calendarType)));
  const timeWindows = combos.filter(
    (c) => c.calendarType === payload.scenario.calendarType,
  );
  const defaultForManifest = defaultScenario(combos);
  const isDefaultScenario =
    defaultForManifest?.calendarType === payload.scenario.calendarType &&
    defaultForManifest?.timeWindow === payload.scenario.timeWindow;

  function changeScenario(next: { calendarType: string; timeWindow: string }) {
    const updated = { ...payload, scenario: next };
    setViewScenario(next);
    setWizard({
      cityId: updated.cityId,
      analysisId: updated.analysisId,
      origin: updated.origin,
      destinations: updated.destinations,
      scenario: updated.scenario,
    });
    replaceScreen("results", `?r=${encodeResultsParam(updated)}`);
  }

  return (
    <WizardShell step={3} title="Your results">
      <details className="mb-4 rounded-md border border-kotare-grey p-3 text-[12px] text-ink-soft">
        <summary className="cursor-pointer font-mono">
          {payload.scenario.calendarType} · {payload.scenario.timeWindow}
          {isDefaultScenario ? " (default)" : ""}
        </summary>
        <div className="mt-3 flex flex-col gap-2">
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
            options={calendarTypes.map((ct) => ({ value: ct, label: ct }))}
          />
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
              label: c.timeWindow,
              disabled: !c.complete,
            }))}
          />
        </div>
      </details>

      <div className="flex flex-col gap-3">
        {verdictRows.map(({ destination, baseline, modified, delta }) => {
          const { text, tone } = formatDelta(delta, baseline, modified);
          return (
            <div
              key={destination.label}
              className="rounded-lg border border-kotare-grey p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <strong className="text-[14px] text-ink">
                  {destination.label}
                </strong>
                <Badge tone={TONE_TO_BADGE[tone]}>{text}</Badge>
              </div>
              <p className="text-[12.5px] text-ink-soft">
                Today: {formatRange(baseline)}
              </p>
              <p className="text-[12.5px] text-ink-soft">
                After: {formatRange(modified)}
              </p>
            </div>
          );
        })}
      </div>

      {analysis?.consultationUrl && (
        <div className="mt-4 rounded-lg bg-kotare-navy p-4 text-white">
          <p className="mb-2 text-[13px] font-semibold">
            {analysis.consultationStatus === "closed"
              ? "Consultation closed"
              : "Consultation open"}
          </p>
          <a
            href={analysis.consultationUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[12.5px] underline"
          >
            Have your say ↗
          </a>
        </div>
      )}

      <Button className="mt-4" onClick={shareResults}>
        Share these results
      </Button>
    </WizardShell>
  );
}
