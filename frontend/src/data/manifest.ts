import { DATA_BASE_URL } from "../config";
import { fetchJson } from "./fetchJson";

export interface EncodingInfo {
  dtype: "uint8" | "uint16";
  bytesPerValue: number;
  byteOrder: string;
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
    byte_order: string;
    unreachable: number;
  };
  scenarios: RawScenario[];
}

export async function fetchManifest(
  cityId: string,
  analysisId: string,
): Promise<Manifest> {
  const raw = await fetchJson<RawManifest>(
    `${DATA_BASE_URL}/${cityId}/${analysisId}/manifest.json`,
  );

  return {
    hexagonResolution: raw.hexagon_resolution,
    hexCount: raw.hex_count,
    percentiles: raw.percentiles,
    encoding: {
      dtype: raw.encoding.dtype,
      bytesPerValue: raw.encoding.bytes_per_value,
      byteOrder: raw.encoding.byte_order,
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

export function isScenarioComplete(
  scenario: Scenario,
  percentiles: number[],
): boolean {
  const { baseline, modified } = scenario.variants;
  if (!baseline || !modified) {
    return false;
  }
  return percentiles.every(
    (p) => String(p) in baseline && String(p) in modified,
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
