import { type Manifest, isScenarioComplete } from "../data/manifest";

export interface ScenarioCombo {
  calendarType: string;
  timeWindow: string;
  complete: boolean;
}

export function availableCombos(manifest: Manifest): ScenarioCombo[] {
  return manifest.scenarios.map((s) => ({
    calendarType: s.calendarType,
    timeWindow: s.timeWindow,
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
  if (weekdayAmPeak) {
    return {
      calendarType: weekdayAmPeak.calendarType,
      timeWindow: weekdayAmPeak.timeWindow,
    };
  }
  const firstComplete = combos.find((c) => c.complete);
  return firstComplete
    ? {
        calendarType: firstComplete.calendarType,
        timeWindow: firstComplete.timeWindow,
      }
    : null;
}
