import { DATA_BASE_URL } from "../config";
import { fetchJson } from "./fetchJson";

export interface AnalysisSummary {
  cityId: string;
  cityName: string;
  analysisId: string;
  title: string;
  description: string;
  consultationUrl: string | null;
  consultationStatus: "open" | "closed" | null;
}

interface RawAnalysisSummary {
  city_id: string;
  city_name: string;
  analysis_id: string;
  title: string;
  description: string;
  consultation_url: string | null;
  consultation_status: "open" | "closed" | null;
}

export async function fetchAnalyses(): Promise<AnalysisSummary[]> {
  const raw = await fetchJson<RawAnalysisSummary[]>(
    `${DATA_BASE_URL}/analyses.json`,
  );

  return raw.map((a) => ({
    cityId: a.city_id,
    cityName: a.city_name,
    analysisId: a.analysis_id,
    title: a.title,
    description: a.description,
    consultationUrl: a.consultation_url,
    consultationStatus: a.consultation_status,
  }));
}

export function filterByCity(
  analyses: AnalysisSummary[],
  cityId: string | null,
): AnalysisSummary[] {
  if (cityId === null) {
    return analyses;
  }
  return analyses.filter((a) => a.cityId === cityId);
}

export function cityOptions(
  analyses: AnalysisSummary[],
): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const a of analyses) {
    if (!seen.has(a.cityId)) {
      seen.set(a.cityId, a.cityName);
    }
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
}
