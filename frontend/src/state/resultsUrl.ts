import type { Destination } from "./wizardState";

export interface ResultsPayload {
  cityId: string;
  analysisId: string;
  origin: { address: string; lat: number; lng: number };
  destinations: Destination[];
  scenario: { calendarType: string; timeWindow: string };
}

function isResultsPayload(value: unknown): value is ResultsPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.cityId === "string" &&
    typeof v.analysisId === "string" &&
    typeof v.origin === "object" &&
    v.origin !== null &&
    Array.isArray(v.destinations) &&
    typeof v.scenario === "object" &&
    v.scenario !== null
  );
}

export function encodeResultsParam(payload: ResultsPayload): string {
  return encodeURIComponent(btoa(JSON.stringify(payload)));
}

export function decodeResultsParam(param: string): ResultsPayload | null {
  try {
    const decoded = JSON.parse(atob(decodeURIComponent(param)));
    return isResultsPayload(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
