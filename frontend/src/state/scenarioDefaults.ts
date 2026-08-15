import { isScenarioComplete, type Manifest } from "../data/manifest";

export interface ScenarioCombo {
  calendarType: string;
  calendarTypeLabel: string;
  timeWindow: string;
  timeWindowLabel: string;
  complete: boolean;
}

export function availableCombos(manifest: Manifest): ScenarioCombo[] {
  return manifest.scenarios.map((s) => ({
    calendarType: s.calendarType,
    calendarTypeLabel: s.calendarTypeLabel,
    timeWindow: s.timeWindow,
    timeWindowLabel: s.timeWindowLabel,
    complete: isScenarioComplete(s, manifest.percentiles),
  }));
}

export function defaultScenario(
  combos: ScenarioCombo[],
): { calendarType: string; timeWindow: string } | null {
  const weekdayAmPeak = combos.find(
    (c) =>
      c.calendarType === "weekday" && c.timeWindow === "am_peak" && c.complete,
  );
  const match = weekdayAmPeak ?? combos.find((c) => c.complete);
  return match
    ? { calendarType: match.calendarType, timeWindow: match.timeWindow }
    : null;
}
