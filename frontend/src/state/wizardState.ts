export interface Destination {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface WizardOrigin {
  address: string;
  lat: number;
  lng: number;
}

export interface WizardScenario {
  calendarType: string;
  timeWindow: string;
}

export interface WizardState {
  cityId: string | null;
  analysisId: string | null;
  origin: WizardOrigin | null;
  destinations: Destination[];
  scenario: WizardScenario | null;
}

export const WIZARD_STORAGE_KEY = "haere.wizardState";

export function isValidOrigin(value: unknown): value is WizardOrigin {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.address === "string" &&
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng)
  );
}

export function isValidScenario(value: unknown): value is WizardScenario {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.calendarType === "string" && typeof v.timeWindow === "string";
}

export function isValidDestination(value: unknown): value is Destination {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === "string" &&
    typeof v.address === "string" &&
    typeof v.lat === "number" &&
    Number.isFinite(v.lat) &&
    typeof v.lng === "number" &&
    Number.isFinite(v.lng)
  );
}

export function isWizardState(value: unknown): value is WizardState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (typeof v.cityId === "string" || v.cityId === null) &&
    (typeof v.analysisId === "string" || v.analysisId === null) &&
    (v.origin === null || isValidOrigin(v.origin)) &&
    Array.isArray(v.destinations) &&
    v.destinations.every(isValidDestination) &&
    (v.scenario === null || isValidScenario(v.scenario))
  );
}

export function emptyWizardState(): WizardState {
  return {
    cityId: null,
    analysisId: null,
    origin: null,
    destinations: [],
    scenario: null,
  };
}

export function saveWizardState(state: WizardState): void {
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(state));
}

export function loadWizardState(): WizardState | null {
  const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isWizardState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearWizardState(): void {
  localStorage.removeItem(WIZARD_STORAGE_KEY);
}
