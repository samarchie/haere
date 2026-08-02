import { fetchAnalyses, filterByCity } from "../data/analysisCatalogue";
import { type GeocodeResult, forwardGeocode } from "../data/geocode";
import { fetchHexIds, resolveHexRowIndex } from "../data/hexLookup";
import { type Manifest, fetchManifest } from "../data/manifest";
import { el, mount } from "../dom";
import { navigate } from "../router";
import {
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "../state/wizardState";

export type FieldStatus =
  | "idle"
  | "geocoding"
  | "resolved"
  | "no-match"
  | "unavailable"
  | "outside-area";

export interface FieldRow {
  address: string;
  status: FieldStatus;
  point: GeocodeResult | null;
}

export function emptyFieldRow(): FieldRow {
  return { address: "", status: "idle", point: null };
}

export function canContinue(
  origin: FieldRow,
  destinations: FieldRow[],
): boolean {
  return (
    origin.status === "resolved" &&
    destinations.some((d) => d.status === "resolved")
  );
}

export function canAddDestination(destinations: FieldRow[]): boolean {
  return destinations.length < 5;
}

export function fieldStatusText(row: FieldRow): string | null {
  switch (row.status) {
    case "geocoding":
      return "Looking that up…";
    case "no-match":
      return "No address found — check the spelling.";
    case "unavailable":
      return "Address lookup is unavailable right now — try again shortly.";
    case "outside-area":
      return "That point falls outside the modelled area.";
    case "resolved":
      return `✓ ${row.point?.label ?? row.address} · matched to the model grid`;
    default:
      return null;
  }
}

export type OriginRouting =
  | { type: "in-area" }
  | { type: "reroute"; search: string };

export async function resolveOriginRouting(
  point: GeocodeResult,
  cityId: string,
  analysisId: string,
  manifest: Manifest,
  currentHexIds: string[],
): Promise<OriginRouting> {
  const row = resolveHexRowIndex(
    point.lat,
    point.lng,
    manifest.hexagonResolution,
    currentHexIds,
  );
  if (row !== null) {
    return { type: "in-area" };
  }

  const allAnalyses = await fetchAnalyses();
  const siblings = filterByCity(allAnalyses, cityId).filter(
    (a) => a.analysisId !== analysisId,
  );

  for (const sibling of siblings) {
    const [siblingHexIds, siblingManifest] = await Promise.all([
      fetchHexIds(sibling.cityId, sibling.analysisId),
      fetchManifest(sibling.cityId, sibling.analysisId),
    ]);
    const siblingRow = resolveHexRowIndex(
      point.lat,
      point.lng,
      siblingManifest.hexagonResolution,
      siblingHexIds,
    );
    if (siblingRow !== null) {
      return {
        type: "reroute",
        search: `?city=${encodeURIComponent(cityId)}&reason=multi-match`,
      };
    }
  }

  return { type: "reroute", search: "?reason=outside-area" };
}

function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function renderLocation(root: HTMLElement): void {
  const wizard = loadWizardState() ?? emptyWizardState();
  if (wizard.cityId === null || wizard.analysisId === null) {
    navigate("picker");
    return;
  }
  const cityId = wizard.cityId;
  const analysisId = wizard.analysisId;

  const origin: FieldRow = wizard.origin
    ? {
        address: wizard.origin.address,
        status: "resolved",
        point: { ...wizard.origin, label: wizard.origin.address },
      }
    : emptyFieldRow();
  const destinations: FieldRow[] =
    wizard.destinations.length > 0
      ? wizard.destinations.map((d) => ({
          address: d.address,
          status: "resolved",
          point: { lat: d.lat, lng: d.lng, label: d.address },
        }))
      : [emptyFieldRow()];

  let manifestCache: Manifest | null = null;
  let hexIdsCache: string[] | null = null;

  async function ensureAreaData(): Promise<{
    manifest: Manifest;
    hexIds: string[];
  }> {
    if (manifestCache === null || hexIdsCache === null) {
      const [manifest, hexIds] = await Promise.all([
        fetchManifest(cityId, analysisId),
        fetchHexIds(cityId, analysisId),
      ]);
      manifestCache = manifest;
      hexIdsCache = hexIds;
    }
    return { manifest: manifestCache, hexIds: hexIdsCache };
  }

  function commit(): void {
    const resolvedDestinations = destinations
      .filter((d) => d.status === "resolved" && d.point)
      .map((d, i) => {
        const point = d.point as GeocodeResult;
        return {
          label: `Destination ${i + 1}`,
          address: d.address,
          lat: point.lat,
          lng: point.lng,
        };
      });

    saveWizardState({
      ...wizard,
      origin:
        origin.status === "resolved" && origin.point
          ? {
              address: origin.address,
              lat: origin.point.lat,
              lng: origin.point.lng,
            }
          : null,
      destinations: resolvedDestinations,
    });
    renderLocation(root);
  }

  function handleGeocode(row: FieldRow, isOrigin: boolean): void {
    row.status = "geocoding";
    commit();

    forwardGeocode(row.address).then(async (outcome) => {
      if (!outcome.ok) {
        row.status = outcome.reason;
        commit();
        return;
      }

      const { manifest, hexIds } = await ensureAreaData();
      const rowIndex = resolveHexRowIndex(
        outcome.result.lat,
        outcome.result.lng,
        manifest.hexagonResolution,
        hexIds,
      );

      if (rowIndex === null && isOrigin) {
        const routing = await resolveOriginRouting(
          outcome.result,
          cityId,
          analysisId,
          manifest,
          hexIds,
        );
        if (routing.type === "reroute") {
          navigate("picker", routing.search);
          return;
        }
      }

      row.point = outcome.result;
      row.status = rowIndex === null ? "outside-area" : "resolved";
      commit();
    });
  }

  const debouncedGeocode = debounce(handleGeocode, 500);

  function fieldEl(
    row: FieldRow,
    label: string,
    isOrigin: boolean,
    onRemove?: () => void,
  ): HTMLElement {
    const statusText = fieldStatusText(row);
    const statusClass =
      row.status === "resolved"
        ? "field-status field-status--ok"
        : row.status === "idle" || row.status === "geocoding"
          ? "field-status"
          : "field-status field-status--error";

    return el(
      "div",
      { class: "field" },
      el("label", {}, label),
      el("input", {
        type: "text",
        value: row.address,
        oninput: (e: Event) => {
          row.address = (e.target as HTMLInputElement).value;
          row.status = "idle";
          row.point = null;
          if (row.address.trim().length > 2) {
            debouncedGeocode(row, isOrigin);
          }
        },
      }),
      el(
        "button",
        { class: "btn", disabled: true, title: "coming in a future update" },
        "📍",
      ),
      statusText ? el("p", { class: statusClass }, statusText) : null,
      onRemove
        ? el("button", { class: "btn btn-ghost", onclick: onRemove }, "Remove")
        : null,
    );
  }

  const destinationEls = destinations.map((d, i) =>
    fieldEl(
      d,
      `Destination ${i + 1}`,
      false,
      destinations.length > 1
        ? () => {
            destinations.splice(i, 1);
            commit();
          }
        : undefined,
    ),
  );

  const continueEnabled = canContinue(origin, destinations);

  mount(
    root,
    el(
      "div",
      { class: "stepper" },
      "① City/Analysis  ② Location  ③ Scenario  ④ Results",
    ),
    el("h2", {}, "Where are you starting from?"),
    fieldEl(origin, "Home address", true),
    el("h3", {}, "Where do you need to get to?"),
    ...destinationEls,
    canAddDestination(destinations)
      ? el(
          "button",
          {
            class: "btn btn-ghost",
            onclick: () => {
              destinations.push(emptyFieldRow());
              commit();
            },
          },
          "+ Add another destination",
        )
      : null,
    el("p", {}, `${destinations.length} of 5 destinations`),
    el(
      "button",
      {
        class: "btn btn-primary",
        disabled: !continueEnabled,
        onclick: () => {
          if (continueEnabled) {
            navigate("scenario");
          }
        },
      },
      "Continue →",
    ),
  );
}
