import { beforeEach, describe, expect, it } from "vitest";
import {
  HISTORY_STORAGE_KEY,
  type HistoryEntry,
  appendHistoryEntry,
  historyEntryToWizardState,
  loadHistory,
  pruneHistory,
  saveHistory,
} from "./resultsHistory";

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "1",
    savedAt: "2026-06-03T00:00:00.000Z",
    cityId: "christchurch",
    analysisId: "remove-135",
    proposalTitle: "Remove Route 135",
    cityName: "Christchurch",
    origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
    destinations: [
      { label: "Work", address: "2 Work St", lat: -43.5, lng: 172.6 },
    ],
    scenario: { calendarType: "Weekday", timeWindow: "AM peak" },
    destinationCount: 1,
    changedCount: 1,
    ...overrides,
  };
}

describe("loadHistory / saveHistory", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty array when nothing is saved", () => {
    expect(loadHistory()).toEqual([]);
  });

  it("round-trips entries through localStorage", () => {
    const entries = [makeEntry()];
    saveHistory(entries);
    expect(loadHistory()).toEqual(entries);
  });

  it("returns an empty array for corrupt JSON", () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, "not json");
    expect(loadHistory()).toEqual([]);
  });
});

describe("appendHistoryEntry", () => {
  beforeEach(() => localStorage.clear());

  it("saves a new entry with a generated id and timestamp", () => {
    appendHistoryEntry({
      cityId: "christchurch",
      analysisId: "remove-135",
      proposalTitle: "Remove Route 135",
      cityName: "Christchurch",
      origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
      destinations: [],
      scenario: { calendarType: "Weekday", timeWindow: "AM peak" },
      destinationCount: 0,
      changedCount: 0,
    });

    const stored = loadHistory();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBeTruthy();
    expect(stored[0].savedAt).toBeTruthy();
  });

  it("replaces an existing entry for the same city/analysis/address instead of duplicating", () => {
    saveHistory([makeEntry({ id: "old", changedCount: 0 })]);

    appendHistoryEntry({
      cityId: "christchurch",
      analysisId: "remove-135",
      proposalTitle: "Remove Route 135",
      cityName: "Christchurch",
      origin: { address: "1 Main St", lat: -43.5, lng: 172.6 },
      destinations: [],
      scenario: { calendarType: "Weekday", timeWindow: "AM peak" },
      destinationCount: 1,
      changedCount: 1,
    });

    const stored = loadHistory();
    expect(stored).toHaveLength(1);
    expect(stored[0].changedCount).toBe(1);
    expect(stored[0].id).not.toBe("old");
  });

  it("caps the list at 10 entries, dropping the oldest", () => {
    const existing = Array.from({ length: 10 }, (_, i) =>
      makeEntry({
        id: `${i}`,
        origin: { address: `${i} Main St`, lat: -43.5, lng: 172.6 },
      }),
    );
    saveHistory(existing);

    appendHistoryEntry({
      cityId: "christchurch",
      analysisId: "remove-135",
      proposalTitle: "Remove Route 135",
      cityName: "Christchurch",
      origin: { address: "new address", lat: -43.5, lng: 172.6 },
      destinations: [],
      scenario: { calendarType: "Weekday", timeWindow: "AM peak" },
      destinationCount: 0,
      changedCount: 0,
    });

    const stored = loadHistory();
    expect(stored).toHaveLength(10);
    expect(stored.some((e) => e.id === "0")).toBe(false); // oldest dropped
    expect(stored[0].origin.address).toBe("new address"); // newest first
  });
});

describe("pruneHistory", () => {
  it("drops entries whose analysisId is no longer live", () => {
    const entries = [
      makeEntry({ id: "a", cityId: "christchurch", analysisId: "remove-135" }),
      makeEntry({
        id: "b",
        cityId: "christchurch",
        analysisId: "retired-proposal",
      }),
    ];
    const result = pruneHistory(entries, new Set(["christchurch::remove-135"]));
    expect(result.map((e) => e.id)).toEqual(["a"]);
  });

  it("returns the same-length array unchanged when everything is still live", () => {
    const entries = [makeEntry({ id: "a" })];
    const result = pruneHistory(entries, new Set(["christchurch::remove-135"]));
    expect(result).toEqual(entries);
  });
});

describe("historyEntryToWizardState", () => {
  it("maps an entry onto a resumable wizard state", () => {
    const entry = makeEntry();
    expect(historyEntryToWizardState(entry)).toEqual({
      cityId: entry.cityId,
      analysisId: entry.analysisId,
      origin: entry.origin,
      destinations: entry.destinations,
      scenario: entry.scenario,
    });
  });
});
