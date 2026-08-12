import {
  type Destination,
  type WizardState,
  isValidDestination,
  isValidOrigin,
  isValidScenario,
} from "./wizardState";

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
    isValidOrigin(v.origin) &&
    Array.isArray(v.destinations) &&
    v.destinations.every(isValidDestination) &&
    isValidScenario(v.scenario)
  );
}

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(input: string): string {
  const bytes = Uint8Array.from(atob(input), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeResultsParam(payload: ResultsPayload): string {
  return encodeURIComponent(toBase64(JSON.stringify(payload)));
}

export function decodeResultsParam(param: string): ResultsPayload | null {
  try {
    const decoded = JSON.parse(fromBase64(decodeURIComponent(param)));
    return isResultsPayload(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function toWizardState(payload: ResultsPayload): WizardState {
  return {
    cityId: payload.cityId,
    analysisId: payload.analysisId,
    origin: payload.origin,
    destinations: payload.destinations,
    scenario: payload.scenario,
  };
}
