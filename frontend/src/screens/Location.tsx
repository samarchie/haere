import { useEffect, useRef, useState } from "react";
import { WizardShell } from "../components/WizardShell";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { fetchAnalyses, filterByCity } from "../data/analysisCatalogue";
import { type GeocodeResult, forwardGeocode } from "../data/geocode";
import { fetchHexIds, resolveHexRowIndex } from "../data/hexLookup";
import { type Manifest, fetchManifest } from "../data/manifest";
import { navigate, useSearchParams } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import { requireCityAndAnalysis } from "../state/wizardState";

export type FieldStatus =
  | "idle"
  | "geocoding"
  | "resolved"
  | "no-match"
  | "unavailable"
  | "outside-area";

export interface FieldRow {
  id: number;
  address: string;
  status: FieldStatus;
  point: GeocodeResult | null;
}

let nextRowId = 0;

export function emptyFieldRow(): FieldRow {
  return { id: nextRowId++, address: "", status: "idle", point: null };
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

  // rows[0] is the origin (always present, never removable); rows[1:] are destinations.
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
        }
      : emptyFieldRow();
    const destinationRows: FieldRow[] = wizard.destinations.map((d) => ({
      id: nextRowId++,
      address: d.address,
      status: "resolved" as const,
      point: { lat: d.lat, lng: d.lng, label: d.address },
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

  const areaDataRef = useRef<Promise<{
    manifest: Manifest;
    hexIds: string[];
  }> | null>(null);
  const debounceTimers = useRef(
    new Map<number, ReturnType<typeof setTimeout>>(),
  );
  const abortControllers = useRef(new Map<number, AbortController>());

  useEffect(() => {
    if (!ids) {
      navigate("proposal");
    }
  }, [ids]);

  // Persisting is a side effect of rows changing, not of `wizard`/`setWizard` identity.
  // Debounced so typing an address doesn't write to localStorage on every keystroke.
  // biome-ignore lint/correctness/useExhaustiveDependencies: wizard/setWizard intentionally excluded, see above.
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

  function handleGeocode(rowId: number, address: string, isOrigin: boolean) {
    abortControllers.current.get(rowId)?.abort();
    const controller = new AbortController();
    abortControllers.current.set(rowId, controller);
    const { signal } = controller;

    updateRow(rowId, (row) => ({ ...row, status: "geocoding" }));

    forwardGeocode(address)
      .then(async (outcome) => {
        if (signal.aborted) return;
        if (!outcome.ok) {
          updateRow(rowId, (row) => ({ ...row, status: outcome.reason }));
          return;
        }

        if (isOrigin) {
          const { manifest, hexIds } = await ensureAreaData();
          if (signal.aborted) return;
          const routing = await resolveOriginRouting(
            outcome.result,
            cityId,
            analysisId,
            manifest,
            hexIds,
          );
          if (signal.aborted) return;
          if (routing.type === "reroute") {
            navigate("proposal", routing.search);
            return;
          }
          updateRow(rowId, (row) => ({
            ...row,
            point: outcome.result,
            status: "resolved",
          }));
          return;
        }

        const { manifest, hexIds } = await ensureAreaData();
        if (signal.aborted) return;
        const rowIndex = resolveHexRowIndex(
          outcome.result.lat,
          outcome.result.lng,
          manifest.hexagonResolution,
          hexIds,
        );
        updateRow(rowId, (row) => ({
          ...row,
          point: outcome.result,
          status: rowIndex === null ? "outside-area" : "resolved",
        }));
      })
      .catch(() => {
        if (signal.aborted) return;
        updateRow(rowId, (row) => ({ ...row, status: "unavailable" }));
      });
  }

  function scheduleGeocode(rowId: number, address: string, isOrigin: boolean) {
    const existing = debounceTimers.current.get(rowId);
    if (existing !== undefined) clearTimeout(existing);
    debounceTimers.current.set(
      rowId,
      setTimeout(() => {
        debounceTimers.current.delete(rowId);
        handleGeocode(rowId, address, isOrigin);
      }, 500),
    );
  }

  function handleAddressChange(
    rowId: number,
    value: string,
    isOrigin: boolean,
  ) {
    abortControllers.current.get(rowId)?.abort();
    const existing = debounceTimers.current.get(rowId);
    if (existing !== undefined) clearTimeout(existing);

    updateRow(rowId, (row) => ({
      ...row,
      address: value,
      status: "idle",
      point: null,
    }));

    if (value.trim().length > 2) {
      scheduleGeocode(rowId, value, isOrigin);
    }
  }

  function renderField(
    row: FieldRow,
    label: string,
    isOrigin: boolean,
    onRemove?: () => void,
  ) {
    const statusText = fieldStatusText(row);
    return (
      <div className="mb-4" key={row.id}>
        <label
          htmlFor={`field-${row.id}`}
          className="mb-1 block text-[13px] font-semibold text-ink"
        >
          {label}
        </label>
        <div className="flex gap-2">
          <Input
            id={`field-${row.id}`}
            aria-label={label}
            value={row.address}
            onChange={(e) =>
              handleAddressChange(row.id, e.target.value, isOrigin)
            }
          />
          {onRemove && (
            <button
              type="button"
              className="sd-focus text-[12px] text-ink-soft"
              onClick={onRemove}
            >
              Remove
            </button>
          )}
        </div>
        {statusText && (
          <p
            className={
              row.status === "resolved"
                ? "mt-1 text-[12px] text-ink"
                : "mt-1 text-[12px] text-ink-soft"
            }
          >
            {statusText}
          </p>
        )}
      </div>
    );
  }

  const continueEnabled = canContinue(origin, destinations);

  return (
    <WizardShell step={2} title="Where are you starting from?">
      {renderField(origin, "Home address", true)}

      <h3 className="mb-1 text-[13px] font-semibold text-ink">
        Where do you need to get to?
      </h3>
      <p className="mb-3 text-[12px] text-ink-soft">
        Add every place you regularly travel to — work, school, the gym.
      </p>

      {destinations.map((d, i) =>
        renderField(
          d,
          `Destination ${i + 1}`,
          false,
          destinations.length > 1
            ? () => {
                const existing = debounceTimers.current.get(d.id);
                if (existing !== undefined) clearTimeout(existing);
                abortControllers.current.get(d.id)?.abort();
                setRows((current) => current.filter((row) => row.id !== d.id));
              }
            : undefined,
        ),
      )}

      {canAddDestination(destinations) && (
        <button
          type="button"
          className="sd-focus mb-4 text-[12.5px] font-semibold text-kotare-blue"
          onClick={() => setRows((current) => [...current, emptyFieldRow()])}
        >
          + Add another destination
        </button>
      )}

      <p className="mb-4 font-mono text-[11px] text-ink-soft">
        {destinations.length} of 5 destinations
      </p>

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
