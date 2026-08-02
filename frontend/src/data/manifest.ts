import { DATA_BASE_URL } from "../config";

export interface EncodingInfo {
  dtype: "uint8" | "uint16";
  bytesPerValue: number;
  unreachable: number;
}

export interface ScenarioVariants {
  baseline?: Record<string, string>;
  modified?: Record<string, string>;
}

export interface Scenario {
  calendarType: string;
  timeWindow: string;
  start: string;
  end: string;
  variants: ScenarioVariants;
}

export interface Manifest {
  hexagonResolution: number;
  hexCount: number;
  percentiles: number[];
  encoding: EncodingInfo;
  scenarios: Scenario[];
}

interface RawScenario {
  calendar_type: string;
  time_window: string;
  start: string;
  end: string;
  variants: ScenarioVariants;
}

interface RawManifest {
  hexagon_resolution: number;
  hex_count: number;
  percentiles: number[];
  encoding: {
    dtype: "uint8" | "uint16";
    bytes_per_value: number;
    unreachable: number;
  };
  scenarios: RawScenario[];
}

export async function fetchManifest(
  cityId: string,
  analysisId: string,
): Promise<Manifest> {
  const response = await fetch(
    `${DATA_BASE_URL}/${cityId}/${analysisId}/manifest.json`,
  );
  const raw = (await response.json()) as RawManifest;

  return {
    hexagonResolution: raw.hexagon_resolution,
    hexCount: raw.hex_count,
    percentiles: raw.percentiles,
    encoding: {
      dtype: raw.encoding.dtype,
      bytesPerValue: raw.encoding.bytes_per_value,
      unreachable: raw.encoding.unreachable,
    },
    scenarios: raw.scenarios.map((s) => ({
      calendarType: s.calendar_type,
      timeWindow: s.time_window,
      start: s.start,
      end: s.end,
      variants: s.variants,
    })),
  };
}

export function isScenarioComplete(scenario: Scenario): boolean {
  return (
    Boolean(scenario.variants.baseline) && Boolean(scenario.variants.modified)
  );
}

export function findScenario(
  manifest: Manifest,
  calendarType: string,
  timeWindow: string,
): Scenario | null {
  return (
    manifest.scenarios.find(
      (s) => s.calendarType === calendarType && s.timeWindow === timeWindow,
    ) ?? null
  );
}
