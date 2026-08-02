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
    return JSON.parse(raw) as WizardState;
  } catch {
    return null;
  }
}

export function clearWizardState(): void {
  localStorage.removeItem(WIZARD_STORAGE_KEY);
}
