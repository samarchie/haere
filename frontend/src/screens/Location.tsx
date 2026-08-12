import { AlertCircle, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { WizardShell } from "../components/WizardShell";
import { Button } from "../components/ui/button";
import { fetchAnalyses, filterByCity } from "../data/analysisCatalogue";
import type { GeocodeResult } from "../data/geocode";
import { fetchHexIds, resolveHexRowIndex } from "../data/hexLookup";
import { type Manifest, fetchManifest } from "../data/manifest";
import { navigate, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import { requireCityAndAnalysis } from "../state/wizardState";

export type FieldStatus = "idle" | "resolved" | "outside-area";

export interface FieldRow {
  id: number;
  address: string;
  status: FieldStatus;
  point: GeocodeResult | null;
  noResults: boolean;
}

let nextRowId = 0;

export function emptyFieldRow(): FieldRow {
  return {
    id: nextRowId++,
    address: "",
    status: "idle",
    point: null,
    noResults: false,
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
    siblings.map(async (sibling) => {
      const [siblingHexIds, siblingManifest] = await Promise.all([
        fetchHexIds(sibling.cityId, sibling.analysisId),
        fetchManifest(sibling.cityId, sibling.analysisId),
      ]);
      return (
        resolveHexRowIndex(
          point.lat,
          point.lng,
          siblingManifest.hexagonResolution,
          siblingHexIds,
        ) !== null
      );
    }),
  );

  const reason = siblingMatches.some(Boolean) ? "multi-match" : "outside-area";
  return {
    type: "reroute",
    search: `?city=${encodeURIComponent(cityId)}&reason=${reason}`,
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
          noResults: false,
        }
      : emptyFieldRow();
    const destinationRows: FieldRow[] = wizard.destinations.map((d) => ({
      id: nextRowId++,
      address: d.address,
      status: "resolved" as const,
      point: { lat: d.lat, lng: d.lng, label: d.address },
      noResults: false,
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
  const [justRemoved, setJustRemoved] = useState<{
    row: FieldRow;
    index: number;
  } | null>(null);

  const areaDataRef = useRef<Promise<{
    manifest: Manifest;
    hexIds: string[];
  }> | null>(null);

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
            d.status === "resolved" && d.point !== null,
        )
        .map((d) => ({
          label: d.label,
          address: d.address,
          lat: d.point.lat,
          lng: d.point.lng,
        }));

      setWizard({
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
    updateRow(rowId, (row) => ({
      ...row,
      address: result.label,
      point: result,
      noResults: false,
    }));

    try {
      const { manifest, hexIds } = await ensureAreaData();

      if (isOrigin) {
        const routing = await resolveOriginRouting(
          result,
          cityId,
          analysisId,
          manifest,
          hexIds,
        );
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
      updateRow(rowId, (row) => ({ ...row, noResults: true }));
    }
  }

  function handleAddressChange(rowId: number, value: string) {
    updateRow(rowId, (row) => ({ ...row, address: value, noResults: false }));
  }

  function handleEdit(rowId: number) {
    updateRow(rowId, (row) => ({ ...row, status: "idle" }));
  }

  function handleDelete(row: FieldRow, index: number) {
    setRows((current) => current.filter((r) => r.id !== row.id));
    setJustRemoved({ row, index });
  }

  function handleUndo() {
    if (!justRemoved) return;
    const { row, index } = justRemoved;
    setRows((current) => {
      const next = [...current];
      next.splice(index, 0, row);
      return next;
    });
    setJustRemoved(null);
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
            <p className="mt-0.5 text-[11px] text-ink-soft">{statusText}</p>
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
          onSearchSettled={(found) =>
            updateRow(row.id, (r) => ({ ...r, noResults: !found }))
          }
        />
        {isOrigin && row.noResults && (
          <div className="mt-2 rounded-md border border-kotare-grey bg-kotare-grey/10 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-ink-soft" />
              <div>
                <div className="mb-0.5 text-[12px] font-bold text-ink">
                  No study area covers this address yet
                </div>
                <div className="text-[11px] leading-snug text-ink-soft">
                  {row.address} sits outside every network change modelled so
                  far — this can happen with a typo, an address outside the
                  studied area, or a temporary lookup issue.
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
        {!isOrigin && row.noResults && (
          <p className="mt-1 text-[12px] text-ink-soft">
            No matching address found — check the spelling.
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
              ? renderSummaryRow(d, `Destination ${i + 1}`, () =>
                  handleDelete(d, i + 1),
                )
              : renderEditingRow(d, `Destination ${i + 1}`, false),
          )}

          {justRemoved && (
            <div className="mb-1 mt-1 flex items-center justify-between rounded-md border border-kotare-grey bg-kotare-grey/15 px-3 py-2">
              <span className="text-[11.5px] text-ink-soft">
                Destination removed
              </span>
              <button
                type="button"
                className="sd-focus text-[11.5px] font-bold text-kotare-blue"
                onClick={handleUndo}
              >
                Undo
              </button>
            </div>
          )}

          {canAddDestination(destinations) && (
            <button
              type="button"
              className="sd-focus mb-1 mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-kotare-grey text-[12px] font-medium text-ink-soft hover:border-kotare-blue/50 hover:text-kotare-blue"
              onClick={() =>
                setRows((current) => [...current, emptyFieldRow()])
              }
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
