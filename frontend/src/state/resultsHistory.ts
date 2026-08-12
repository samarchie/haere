import type {
  Destination,
  WizardOrigin,
  WizardScenario,
  WizardState,
} from "./wizardState";

export interface HistoryEntry {
  id: string;
  savedAt: string;
  cityId: string;
  analysisId: string;
  proposalTitle: string;
  cityName: string;
  origin: WizardOrigin;
  destinations: Destination[];
  scenario: WizardScenario;
  destinationCount: number;
  changedCount: number;
}

export const HISTORY_STORAGE_KEY = "haere.resultsHistory";
const MAX_HISTORY_ENTRIES = 10;

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.savedAt === "string" &&
    typeof v.cityId === "string" &&
    typeof v.analysisId === "string" &&
    typeof v.proposalTitle === "string" &&
    typeof v.cityName === "string" &&
    typeof v.destinationCount === "number" &&
    typeof v.changedCount === "number" &&
    Array.isArray(v.destinations)
  );
}

export function loadHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

export function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

function dedupeKey(e: {
  cityId: string;
  analysisId: string;
  origin: { address: string };
}): string {
  return `${e.cityId}::${e.analysisId}::${e.origin.address}`;
}

export function appendHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "savedAt">,
): void {
  const key = dedupeKey(entry);
  const loaded = loadHistory().reverse();
  const withoutDuplicate = loaded.filter((e) => dedupeKey(e) !== key);
  const next: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  saveHistory([next, ...withoutDuplicate].slice(0, MAX_HISTORY_ENTRIES));
}

export function pruneHistory(
  entries: HistoryEntry[],
  liveAnalysisIds: Set<string>,
): HistoryEntry[] {
  return entries.filter((e) =>
    liveAnalysisIds.has(`${e.cityId}::${e.analysisId}`),
  );
}

export function historyEntryToWizardState(entry: HistoryEntry): WizardState {
  return {
    cityId: entry.cityId,
    analysisId: entry.analysisId,
    origin: entry.origin,
    destinations: entry.destinations,
    scenario: entry.scenario,
  };
}
