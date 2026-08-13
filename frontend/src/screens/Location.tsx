import { AlertCircle, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { WizardShell } from "../components/WizardShell";
import { Button } from "../components/ui/button";
import { fetchAnalyses, filterByCity } from "../data/analysisCatalogue";
import type { GeocodeResult } from "../data/geocode";
import {
  fetchHexIds,
  pointFallsInAnalysis,
  resolveHexRowIndex,
} from "../data/hexLookup";
import { type Manifest, fetchManifest } from "../data/manifest";
import { navigate, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import { requireCityAndAnalysis } from "../state/wizardState";

export type FieldStatus = "idle" | "resolved" | "outside-area";

// "unavailable" covers both a failed address search and a failed area
// lookup after a search succeeded — either way, the app couldn't tell
// whether the address is really outside the modelled area, so it shouldn't
// say so. Kept distinct from "no-match" (a completed search, genuinely
// no results) so the two aren't shown as the same message.
export type SearchIssue = "none" | "no-match" | "unavailable";

export interface FieldRow {
  id: number;
  address: string;
  status: FieldStatus;
  point: GeocodeResult | null;
  searchIssue: SearchIssue;
}

let nextRowId = 0;

export function emptyFieldRow(): FieldRow {
  return {
    id: nextRowId++,
    address: "",
    status: "idle",
    point: null,
    searchIssue: "none",
  };
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
  return row.status === "outside-area"
    ? "That point falls outside the modelled area."
    : null;
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

  const siblingMatches = await Promise.all(
    siblings.map((sibling) =>
      pointFallsInAnalysis(
        point.lat,
        point.lng,
        sibling.cityId,
        sibling.analysisId,
      ),
    ),
  );

  // Multi-match narrows the wall to the visitor's own city, since another
  // proposal there actually covers them. A true outside-area clears the
  // city filter instead — narrowing it would hide every other city's
  // proposals from a visitor who isn't covered by any of them.
  const reason = siblingMatches.some(Boolean) ? "multi-match" : "outside-area";
  const cityParam = reason === "multi-match" ? cityId : "";
  return {
    type: "reroute",
    search: `?city=${encodeURIComponent(cityParam)}&reason=${reason}`,
  };
}

export function Location() {
  const { wizard, setWizard } = useWizardState();
  const search = useSearchParams();
  const ids = requireCityAndAnalysis(wizard);

  const [rows, setRows] = useState<FieldRow[]>(() => {
    const originRow: FieldRow = wizard.origin
      ? {
          id: nextRowId++,
          address: wizard.origin.address,
          status: "resolved",
          point: {
            lat: wizard.origin.lat,
            lng: wizard.origin.lng,
            label: wizard.origin.address,
          },
          searchIssue: "none",
        }
      : emptyFieldRow();
    const destinationRows: FieldRow[] = wizard.destinations.map((d) => ({
      id: nextRowId++,
      address: d.address,
      status: "resolved" as const,
      point: { lat: d.lat, lng: d.lng, label: d.address },
      searchIssue: "none",
    }));
    if (
      search.get("addDestination") === "1" &&
      canAddDestination(destinationRows)
    ) {
      destinationRows.push(emptyFieldRow());
    }
    return [
      originRow,
      ...(destinationRows.length > 0 ? destinationRows : [emptyFieldRow()]),
    ];
  });
  const [origin, ...destinations] = rows;
  const [removedStack, setRemovedStack] = useState<
    { row: FieldRow; index: number }[]
  >([]);

  const areaDataRef = useRef<Promise<{
    manifest: Manifest;
    hexIds: string[];
  }> | null>(null);
  // Guards against a stale handleResolve response (from an address picked
  // earlier, still resolving) overwriting a row that's since been resolved
  // again with a different address.
  const resolveSeqRef = useRef(new Map<number, number>());

  useEffect(() => {
    if (!ids) {
      navigate("proposal");
    }
  }, [ids]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: wizard/setWizard excluded so this effect's own setWizard call doesn't retrigger itself via wizard's changed identity — rows changing is the only thing that should schedule a new persist.
  useEffect(() => {
    const timer = setTimeout(() => {
      const resolvedDestinations = destinations
        .map((d, i) => ({ ...d, label: `Destination ${i + 1}` }))
        .filter(
          (d): d is FieldRow & { point: GeocodeResult; label: string } =>
            d.status !== "outside-area" && d.point !== null,
        )
        .map((d) => ({
          label: d.label,
          address: d.point.label,
          lat: d.point.lat,
          lng: d.point.lng,
        }));

      setWizard({
        ...wizard,
        // Keyed on point rather than status === "resolved" so a row
        // mid-edit (status "idle") still persists its last-resolved point —
        // clicking the edit pencil shouldn't wipe a value that hasn't
        // actually changed yet.
        origin:
          origin.point !== null
            ? {
                address: origin.point.label,
                lat: origin.point.lat,
                lng: origin.point.lng,
              }
            : null,
        destinations: resolvedDestinations,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [rows]);

  if (!ids) {
    return null;
  }
  const { cityId, analysisId } = ids;

  function ensureAreaData(): Promise<{ manifest: Manifest; hexIds: string[] }> {
    if (areaDataRef.current === null) {
      areaDataRef.current = Promise.all([
        fetchManifest(cityId, analysisId),
        fetchHexIds(cityId, analysisId),
      ])
        .then(([manifest, hexIds]) => ({ manifest, hexIds }))
        .catch((err) => {
          areaDataRef.current = null;
          throw err;
        });
    }
    return areaDataRef.current;
  }

  function updateRow(id: number, updater: (row: FieldRow) => FieldRow) {
    setRows((current) =>
      current.map((row) => (row.id === id ? updater(row) : row)),
    );
  }

  async function handleResolve(
    rowId: number,
    result: GeocodeResult,
    isOrigin: boolean,
  ) {
    const seq = (resolveSeqRef.current.get(rowId) ?? 0) + 1;
    resolveSeqRef.current.set(rowId, seq);
    const isStale = () => resolveSeqRef.current.get(rowId) !== seq;

    updateRow(rowId, (row) => ({
      ...row,
      address: result.label,
      point: result,
      searchIssue: "none",
    }));

    try {
      const { manifest, hexIds } = await ensureAreaData();
      if (isStale()) return;

      if (isOrigin) {
        const routing = await resolveOriginRouting(
          result,
          cityId,
          analysisId,
          manifest,
          hexIds,
        );
        if (isStale()) return;
        if (routing.type === "reroute") {
          navigate("proposal", routing.search);
          return;
        }
        updateRow(rowId, (row) => ({ ...row, status: "resolved" }));
        return;
      }

      const rowIndex = resolveHexRowIndex(
        result.lat,
        result.lng,
        manifest.hexagonResolution,
        hexIds,
      );
      updateRow(rowId, (row) => ({
        ...row,
        status: rowIndex === null ? "outside-area" : "resolved",
      }));
    } catch {
      if (isStale()) return;
      updateRow(rowId, (row) => ({ ...row, searchIssue: "unavailable" }));
    }
  }

  function handleAddressChange(rowId: number, value: string) {
    updateRow(rowId, (row) => ({
      ...row,
      address: value,
      searchIssue: "none",
    }));
  }

  function handleEdit(rowId: number) {
    updateRow(rowId, (row) => ({ ...row, status: "idle" }));
  }

  function handleDelete(row: FieldRow, index: number) {
    setRows((current) => current.filter((r) => r.id !== row.id));
    setRemovedStack((current) => [...current, { row, index }]);
  }

  function handleUndo(rowId: number) {
    const entry = removedStack.find(({ row }) => row.id === rowId);
    if (!entry) return;
    setRows((current) => {
      const next = [...current];
      next.splice(entry.index, 0, entry.row);
      return next;
    });
    setRemovedStack((current) => current.filter(({ row }) => row.id !== rowId));
  }

  function renderSummaryRow(
    row: FieldRow,
    label: string,
    onDelete?: () => void,
  ) {
    const statusText = fieldStatusText(row);
    return (
      <div
        key={row.id}
        className="flex items-center justify-between border-b border-kotare-grey/50 py-2.5"
      >
        <div className="min-w-0">
          <div className="mb-0.5 text-[10px] font-medium text-ink-soft">
            {label}
          </div>
          <div className="truncate text-[13.5px] font-semibold text-ink">
            {row.address}
          </div>
          {statusText && (
            <p className="mt-0.5 text-[12px] text-ink-soft">{statusText}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={`Edit ${label}`}
            className="sd-focus flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-kotare-grey/25"
            onClick={() => handleEdit(row.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button
              type="button"
              aria-label={`Delete ${label}`}
              className="sd-focus flex h-7 w-7 items-center justify-center rounded-md text-ink-soft hover:bg-kotare-grey/25"
              onClick={onDelete}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderEditingRow(row: FieldRow, label: string, isOrigin: boolean) {
    return (
      <div key={row.id} className="mb-4">
        <AddressAutocomplete
          id={`field-${row.id}`}
          label={label}
          value={row.address}
          point={row.point}
          onChange={(value) => handleAddressChange(row.id, value)}
          onResolve={(result) => handleResolve(row.id, result, isOrigin)}
          onSearchSettled={(outcome) =>
            updateRow(row.id, (r) => ({
              ...r,
              searchIssue:
                outcome === "found"
                  ? "none"
                  : outcome === "empty"
                    ? "no-match"
                    : "unavailable",
            }))
          }
        />
        {isOrigin && row.searchIssue === "no-match" && (
          <div className="mt-2 rounded-md border border-kotare-grey bg-kotare-grey/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-ink-soft" />
              <div>
                <div className="mb-0.5 text-[12px] font-bold text-ink">
                  No study area covers this address yet
                </div>
                <div className="text-[12px] leading-snug text-ink-soft">
                  {row.address} sits outside every network change modelled so
                  far — this can happen with a typo or an address outside the
                  studied area.
                </div>
              </div>
            </div>
            <button
              type="button"
              className="sd-focus mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-kotare-navy text-[11.5px] font-bold text-white"
              onClick={() => navigate("proposal", "?city=")}
            >
              View all proposals →
            </button>
          </div>
        )}
        {isOrigin && row.searchIssue === "unavailable" && (
          <p className="mt-2 text-[12px] text-ink-soft">
            Address lookup is unavailable right now — try again shortly.
          </p>
        )}
        {!isOrigin && row.searchIssue === "no-match" && (
          <p className="mt-1 text-[12px] text-ink-soft">
            No matching address found — check the spelling.
          </p>
        )}
        {!isOrigin && row.searchIssue === "unavailable" && (
          <p className="mt-1 text-[12px] text-ink-soft">
            Address lookup is unavailable right now — try again shortly.
          </p>
        )}
        {!isOrigin && fieldStatusText(row) && (
          <p className="mt-1 text-[12px] text-ink-soft">
            {fieldStatusText(row)}
          </p>
        )}
      </div>
    );
  }

  const continueEnabled = canContinue(origin, destinations);

  return (
    <WizardShell step={2} title="Your addresses">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
        Starting point
      </div>
      {origin.status === "resolved"
        ? renderSummaryRow(origin, "Home address")
        : renderEditingRow(origin, "Home address", true)}

      {origin.status === "resolved" && (
        <>
          <div className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            Destinations
          </div>
          <p className="mb-2 text-[12.5px] leading-snug text-ink-soft">
            Add every place you regularly travel to — work, school, the gym.
          </p>

          {destinations.map((d, i) =>
            d.status === "resolved"
              ? renderSummaryRow(
                  d,
                  `Destination ${i + 1}`,
                  destinations.length > 1
                    ? () => handleDelete(d, i + 1)
                    : undefined,
                )
              : renderEditingRow(d, `Destination ${i + 1}`, false),
          )}

          {removedStack.map(({ row }) => (
            <div
              key={row.id}
              className="mb-1 mt-1 flex items-center justify-between rounded-md border border-kotare-grey bg-kotare-grey/15 px-3 py-2"
            >
              <span className="text-[11.5px] text-ink-soft">
                Destination removed
              </span>
              <button
                type="button"
                className="sd-focus text-[11.5px] font-bold text-kotare-blue"
                onClick={() => handleUndo(row.id)}
              >
                Undo
              </button>
            </div>
          ))}

          {canAddDestination(destinations) && (
            <button
              type="button"
              className="sd-focus mb-1 mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-kotare-grey text-[12px] font-medium text-ink-soft hover:border-kotare-blue/50 hover:text-kotare-blue"
              onClick={() => {
                // Adding a row changes what "restore at this index" means
                // for every pending removal, so in-flight undos are dropped
                // rather than left to restore into the wrong position.
                setRemovedStack([]);
                setRows((current) => [...current, emptyFieldRow()]);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add another destination
            </button>
          )}

          <p className="mb-4 font-mono text-[11px] text-ink-soft">
            {destinations.length} of 5 destinations
          </p>
        </>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate("proposal")}>
          ← Back
        </Button>
        <Button
          disabled={!continueEnabled}
          onClick={() => continueEnabled && navigate("results")}
        >
          Continue →
        </Button>
      </div>
    </WizardShell>
  );
}
