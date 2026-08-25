import { DATA_BASE_URL } from "../config";
import { memoizeAsync } from "../lib/memoizeAsync";
import { fetchJson } from "./fetchJson";

export interface EncodingInfo {
  dtype: "uint8" | "uint16";
  bytesPerValue: number;
  byteOrder: string;
  unreachable: number;
}

export interface Consultation {
  closesAt: string;
  url: string;
}

export interface AnalysisInfo {
  id: string;
  title: string;
  description: string;
  consultation: Consultation | null;
}

export interface CityInfo {
  id: string;
  name: string;
  center: { lat: number; lng: number } | null;
}

export interface ScenarioVariants {
  baseline?: Record<string, string>;
  modified?: Record<string, string>;
}

export interface Scenario {
  calendarType: string;
  calendarTypeLabel: string;
  timeWindow: string;
  timeWindowLabel: string;
  start: string;
  end: string;
  variants: ScenarioVariants;
}

export interface Manifest {
  city: CityInfo;
  analysis: AnalysisInfo;
  hexagonResolution: number;
  hexCount: number;
  percentiles: number[];
  encoding: EncodingInfo;
  scenarios: Scenario[];
}

interface RawScenario {
  calendar_type: string;
  calendar_type_label: string;
  time_window: string;
  time_window_label: string;
  start: string;
  end: string;
  variants: ScenarioVariants;
}

interface RawManifest {
  city: {
    id: string;
    name: string;
    center: { lat: number; lng: number } | null;
  };
  analysis: {
    id: string;
    title: string;
    description: string;
    consultation: { closes_at: string; url: string } | null;
  };
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

// Manifests are static per deploy, so callers that check the same
// city/analysis repeatedly (e.g. matchingCityIds across every proposal) share
// one in-flight/resolved fetch instead of re-downloading it each time.
export const fetchManifest = memoizeAsync(
  fetchManifestUncached,
  (cityId, analysisId) => `${cityId}/${analysisId}`,
);

async function fetchManifestUncached(
  cityId: string,
  analysisId: string,
): Promise<Manifest> {
  const raw = await fetchJson<RawManifest>(
    `${DATA_BASE_URL}/${cityId}/${analysisId}/manifest.json`,
  );

  return {
    city: {
      id: raw.city.id,
      name: raw.city.name,
      center: raw.city.center,
    },
    analysis: {
      id: raw.analysis.id,
      title: raw.analysis.title,
      description: raw.analysis.description,
      consultation: raw.analysis.consultation
        ? {
            closesAt: raw.analysis.consultation.closes_at,
            url: raw.analysis.consultation.url,
          }
        : null,
    },
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
      calendarTypeLabel: s.calendar_type_label,
      timeWindow: s.time_window,
      timeWindowLabel: s.time_window_label,
      start: s.start,
      end: s.end,
      variants: s.variants,
    })),
  };
}

export function isConsultationOpen(
  consultation: Consultation | null,
  now: Date = new Date(),
): boolean {
  return consultation !== null && new Date(consultation.closesAt) > now;
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
