import { DATA_BASE_URL } from "../config";
import { type AnalysisSummary, fetchAnalyses } from "../data/analysisCatalogue";
import { fetchHexIds, resolveHexRowIndex } from "../data/hexLookup";
import { type Scenario, fetchManifest, findScenario } from "../data/manifest";
import {
  computeDeltaMinutes,
  fetchRow,
  readValueAt,
  toVerdictValue,
} from "../data/travelTimes";
import { el, mount } from "../dom";
import { currentSearch, navigate } from "../router";
import {
  type ResultsPayload,
  decodeResultsParam,
  encodeResultsParam,
} from "../state/resultsUrl";
import { type Destination, loadWizardState } from "../state/wizardState";

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
    if (!row) {
      return null;
    }
    return toVerdictValue(
      readValueAt(row, colIndex, bytesPerValue),
      unreachable,
    ).minutes;
  };
  return { p25: read(25), p50: read(50), p75: read(75) };
}

export function formatRange(minutes: PercentileMinutes): string {
  if (minutes.p50 === null) {
    return "—";
  }
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

export function formatDelta(delta: number | null): {
  text: string;
  tone: "better" | "worse" | "none";
} {
  if (delta === null) {
    return { text: "No route today or after", tone: "none" };
  }
  if (delta === 0) {
    return { text: "No change", tone: "none" };
  }
  const tone = delta > 0 ? "worse" : "better";
  const sign = delta > 0 ? "+" : "";
  return { text: `${sign}${delta} min · ${tone}`, tone };
}

async function fetchAllRows(
  cityId: string,
  analysisId: string,
  scenario: Scenario,
  percentiles: number[],
  rowIndex: number,
  hexCount: number,
  bytesPerValue: number,
): Promise<{
  baseline: Record<number, Uint8Array>;
  modified: Record<number, Uint8Array>;
}> {
  const baseline: Record<number, Uint8Array> = {};
  const modified: Record<number, Uint8Array> = {};

  for (const p of percentiles) {
    const baselinePath = scenario.variants.baseline?.[String(p)];
    const modifiedPath = scenario.variants.modified?.[String(p)];
    if (baselinePath) {
      baseline[p] = await fetchRow(
        `${DATA_BASE_URL}/${cityId}/${analysisId}/${baselinePath}`,
        rowIndex,
        hexCount,
        bytesPerValue,
      );
    }
    if (modifiedPath) {
      modified[p] = await fetchRow(
        `${DATA_BASE_URL}/${cityId}/${analysisId}/${modifiedPath}`,
        rowIndex,
        hexCount,
        bytesPerValue,
      );
    }
  }

  return { baseline, modified };
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

export function renderResults(root: HTMLElement): void {
  const encoded = currentSearch().get("r");
  const decoded = encoded ? decodeResultsParam(encoded) : null;

  if (!decoded) {
    const wizard = loadWizardState();
    if (
      !wizard ||
      wizard.cityId === null ||
      wizard.analysisId === null ||
      wizard.origin === null ||
      wizard.destinations.length === 0 ||
      wizard.scenario === null
    ) {
      navigate("landing");
      return;
    }
    const payload: ResultsPayload = {
      cityId: wizard.cityId,
      analysisId: wizard.analysisId,
      origin: wizard.origin,
      destinations: wizard.destinations,
      scenario: wizard.scenario,
    };
    window.history.replaceState(
      null,
      "",
      `/results?r=${encodeResultsParam(payload)}`,
    );
    renderResults(root);
    return;
  }

  mount(root, el("p", {}, "Loading your results…"));
  loadResults(root, decoded);
}

async function loadResults(
  root: HTMLElement,
  payload: ResultsPayload,
): Promise<void> {
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
    if (!scenario) {
      mount(
        root,
        el(
          "div",
          { class: "banner banner--warning" },
          "This scenario is no longer available.",
        ),
      );
      return;
    }

    const originRow = resolveHexRowIndex(
      payload.origin.lat,
      payload.origin.lng,
      manifest.hexagonResolution,
      hexIds,
    );
    if (originRow === null) {
      mount(
        root,
        el(
          "div",
          { class: "banner banner--warning" },
          "Your starting point falls outside the modelled area.",
        ),
      );
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

    const verdictRows = payload.destinations.map((destination) => {
      const colIndex = resolveHexRowIndex(
        destination.lat,
        destination.lng,
        manifest.hexagonResolution,
        hexIds,
      );
      const unreachable: PercentileMinutes = {
        p25: null,
        p50: null,
        p75: null,
      };
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

    renderVerdictScreen(root, analysis, payload, verdictRows);
  } catch {
    mount(
      root,
      el(
        "div",
        { class: "banner banner--warning" },
        "Couldn't load your results.",
      ),
      el(
        "button",
        { class: "btn", onclick: () => loadResults(root, payload) },
        "Retry",
      ),
    );
  }
}

function renderVerdictScreen(
  root: HTMLElement,
  analysis: AnalysisSummary | null,
  payload: ResultsPayload,
  rows: Array<{
    destination: Destination;
    baseline: PercentileMinutes;
    modified: PercentileMinutes;
    delta: number | null;
  }>,
): void {
  const rowEls = rows.map(({ destination, baseline, modified, delta }, i) => {
    const { text: deltaText, tone } = formatDelta(delta);
    return el(
      "div",
      { class: "verdict-row" },
      el(
        "div",
        {},
        el("strong", {}, destination.label || destination.address),
        rows.length > 1
          ? el(
              "button",
              {
                class: "btn btn-ghost",
                onclick: () => {
                  const remainingDestinations = payload.destinations.filter(
                    (_, idx) => idx !== i,
                  );
                  const nextPayload: ResultsPayload = {
                    ...payload,
                    destinations: remainingDestinations,
                  };
                  window.history.replaceState(
                    null,
                    "",
                    `/results?r=${encodeResultsParam(nextPayload)}`,
                  );
                  renderResults(root);
                },
              },
              "✕",
            )
          : null,
      ),
      el(
        "span",
        { class: `verdict-row__delta verdict-row__delta--${tone}` },
        deltaText,
      ),
      el("p", {}, `Today: ${formatRange(baseline)}`),
      el("p", {}, `After: ${formatRange(modified)}`),
      el(
        "details",
        {},
        el("summary", {}, "Why a range?"),
        el(
          "p",
          {},
          "Travel time varies trip to trip. We show the typical time plus the fastest and slowest 25% of trips, so you see the range you might actually experience.",
        ),
      ),
    );
  });

  const consultationBanner = analysis?.consultationUrl
    ? el(
        "div",
        { class: "banner" },
        el(
          "p",
          {},
          analysis.consultationStatus === "closed"
            ? "Consultation closed"
            : "Consultation open",
        ),
        el(
          "a",
          { href: analysis.consultationUrl, target: "_blank", rel: "noopener" },
          "Have your say ↗",
        ),
      )
    : null;

  mount(
    root,
    el("div", { class: "stepper" }, "① ② ③ ④ Results"),
    el("h2", {}, "Here's what changes"),
    ...rowEls,
    el(
      "button",
      // Note: this navigates to the location screen, which reads/writes wizardState —
      // that can diverge from the URL `payload` this screen renders from (e.g. on a
      // shared link opened in a fresh session). Same class of bug as the ✕ handler
      // fixed above; not addressed here.
      { class: "btn btn-ghost", onclick: () => navigate("location") },
      "+ Add another destination",
    ),
    consultationBanner,
    el(
      "button",
      { class: "btn", disabled: true, title: "coming in a future update" },
      "🗺 See how this change looks across the whole area",
    ),
    el(
      "button",
      { class: "btn btn-primary", onclick: () => shareResults() },
      "Share these results",
    ),
  );
}
