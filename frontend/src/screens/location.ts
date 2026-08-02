import { renderStepper } from "../components/stepper";
import { fetchAnalyses, filterByCity } from "../data/analysisCatalogue";
import { type GeocodeResult, forwardGeocode } from "../data/geocode";
import { fetchHexIds, resolveHexRowIndex } from "../data/hexLookup";
import { type Manifest, fetchManifest } from "../data/manifest";
import { el, mount } from "../dom";
import { currentScreen, navigate } from "../router";
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
        point: {
          lat: wizard.origin.lat,
          lng: wizard.origin.lng,
          label: wizard.origin.address,
        },
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

  let areaDataPromise: Promise<{
    manifest: Manifest;
    hexIds: string[];
  }> | null = null;

  // Per-row debounce timers and monotonic request counters. Keyed by the
  // FieldRow object itself (via WeakMap) so each field's pending geocode
  // is independent of every other field's, and so an edit-away-and-back
  // on the same field can invalidate an earlier in-flight request for
  // that field without relying on address equality.
  const debounceTimers = new WeakMap<FieldRow, ReturnType<typeof setTimeout>>();
  const requestCounters = new WeakMap<FieldRow, number>();

  function ensureAreaData(): Promise<{
    manifest: Manifest;
    hexIds: string[];
  }> {
    if (areaDataPromise === null) {
      areaDataPromise = Promise.all([
        fetchManifest(cityId, analysisId),
        fetchHexIds(cityId, analysisId),
      ])
        .then(([manifest, hexIds]) => ({ manifest, hexIds }))
        .catch((err) => {
          // Don't let a transient failure permanently poison every future
          // geocode attempt on this screen visit — clear the cache so the
          // next call retries the fetch, while still surfacing this
          // rejection to the current caller.
          areaDataPromise = null;
          throw err;
        });
    }
    return areaDataPromise;
  }

  // Writes the resolved subset of origin/destinations to wizardState.
  // Does NOT touch the in-memory origin/destinations arrays and does NOT
  // re-render — call renderForm() separately if the DOM needs updating.
  function persist(): void {
    const resolvedDestinations = destinations.flatMap((d, i) => {
      if (d.status !== "resolved" || !d.point) {
        return [];
      }
      return [
        {
          label: `Destination ${i + 1}`,
          address: d.address,
          lat: d.point.lat,
          lng: d.point.lng,
        },
      ];
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
  }

  // Re-renders the DOM from the current in-memory origin/destinations
  // arrays (mutated in place — never re-derived from storage). Preserves
  // focus and caret position across the underlying mount()'s
  // replaceChildren(), since this now runs on every keystroke (not just
  // after the debounce), and losing focus mid-typing would be jarring.
  function renderForm(): void {
    if (currentScreen() !== "location") {
      return;
    }
    const active = document.activeElement;
    let restoreId: string | null = null;
    let restoreStart: number | null = null;
    let restoreEnd: number | null = null;
    if (
      active instanceof HTMLInputElement &&
      active.id &&
      root.contains(active)
    ) {
      restoreId = active.id;
      restoreStart = active.selectionStart;
      restoreEnd = active.selectionEnd;
    }

    renderFields();

    if (restoreId) {
      const toRestore = root.querySelector(
        `input[id="${restoreId}"]`,
      ) as HTMLInputElement | null;
      if (toRestore) {
        toRestore.focus();
        if (restoreStart !== null && restoreEnd !== null) {
          toRestore.setSelectionRange(restoreStart, restoreEnd);
        }
      }
    }
  }

  function handleGeocode(row: FieldRow, isOrigin: boolean): void {
    const requestId = (requestCounters.get(row) ?? 0) + 1;
    requestCounters.set(row, requestId);
    const isStale = () => requestCounters.get(row) !== requestId;

    row.status = "geocoding";
    persist();
    renderForm();

    forwardGeocode(row.address)
      .then(async (outcome) => {
        if (isStale()) {
          return;
        }
        if (!outcome.ok) {
          row.status = outcome.reason;
          persist();
          renderForm();
          return;
        }

        if (isOrigin) {
          const { manifest, hexIds } = await ensureAreaData();
          if (isStale()) {
            return;
          }
          const routing = await resolveOriginRouting(
            outcome.result,
            cityId,
            analysisId,
            manifest,
            hexIds,
          );
          if (isStale()) {
            return;
          }
          if (routing.type === "reroute") {
            navigate("picker", routing.search);
            return;
          }
          row.point = outcome.result;
          row.status = "resolved";
          persist();
          renderForm();
          return;
        }

        const { manifest, hexIds } = await ensureAreaData();
        if (isStale()) {
          return;
        }
        const rowIndex = resolveHexRowIndex(
          outcome.result.lat,
          outcome.result.lng,
          manifest.hexagonResolution,
          hexIds,
        );

        row.point = outcome.result;
        row.status = rowIndex === null ? "outside-area" : "resolved";
        persist();
        renderForm();
      })
      .catch(() => {
        // Anything throwing in the chain above (most notably a rejected
        // ensureAreaData() after exhausting retries, or resolveOriginRouting
        // failing) must not leave the row stuck at "geocoding" forever with
        // an unhandled rejection.
        if (isStale()) {
          return;
        }
        row.status = "unavailable";
        persist();
        renderForm();
      });
  }

  function scheduleGeocode(row: FieldRow, isOrigin: boolean): void {
    const existing = debounceTimers.get(row);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    debounceTimers.set(
      row,
      setTimeout(() => {
        debounceTimers.delete(row);
        handleGeocode(row, isOrigin);
      }, 500),
    );
  }

  function cancelScheduledGeocode(row: FieldRow): void {
    const existing = debounceTimers.get(row);
    if (existing !== undefined) {
      clearTimeout(existing);
      debounceTimers.delete(row);
    }
  }

  function fieldEl(
    row: FieldRow,
    label: string,
    fieldId: string,
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
      el("label", { for: fieldId }, label),
      el("input", {
        id: fieldId,
        type: "text",
        value: row.address,
        oninput: (e: Event) => {
          row.address = (e.target as HTMLInputElement).value;
          row.status = "idle";
          row.point = null;
          // Orphan any in-flight request for this row immediately (not just
          // pending debounce timers) so its eventual resolution is always
          // treated as stale by the isStale() checks in handleGeocode.
          requestCounters.set(row, (requestCounters.get(row) ?? 0) + 1);
          persist();
          renderForm();
          if (row.address.trim().length > 2) {
            scheduleGeocode(row, isOrigin);
          } else {
            cancelScheduledGeocode(row);
          }
        },
      }),
      el(
        "button",
        {
          type: "button",
          class: "btn",
          disabled: true,
          title: "coming in a future update",
        },
        "📍",
      ),
      statusText ? el("p", { class: statusClass }, statusText) : null,
      onRemove
        ? el(
            "button",
            { type: "button", class: "btn btn-ghost", onclick: onRemove },
            "Remove",
          )
        : null,
    );
  }

  function renderFields(): void {
    const destinationEls = destinations.map((d, i) =>
      fieldEl(
        d,
        `Destination ${i + 1}`,
        `destination-${i}`,
        false,
        destinations.length > 1
          ? () => {
              cancelScheduledGeocode(d);
              requestCounters.set(d, (requestCounters.get(d) ?? 0) + 1);
              destinations.splice(i, 1);
              persist();
              renderForm();
            }
          : undefined,
      ),
    );

    const continueEnabled = canContinue(origin, destinations);

    mount(
      root,
      renderStepper("location"),
      el("h2", {}, "Where are you starting from?"),
      fieldEl(origin, "Home address", "origin", true),
      el("h3", {}, "Where do you need to get to?"),
      ...destinationEls,
      canAddDestination(destinations)
        ? el(
            "button",
            {
              type: "button",
              class: "btn btn-ghost",
              onclick: () => {
                destinations.push(emptyFieldRow());
                renderForm();
              },
            },
            "+ Add another destination",
          )
        : null,
      el("p", {}, `${destinations.length} of 5 destinations`),
      el(
        "button",
        {
          type: "button",
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

  renderForm();
}
