import { latLngToCell } from "h3-js";
import { DATA_BASE_URL } from "../config";
import { fetchJson } from "./fetchJson";
import { fetchManifest } from "./manifest";

export function binarySearch(
  sortedIds: string[],
  target: string,
): number | null {
  let low = 0;
  let high = sortedIds.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (sortedIds[mid] === target) {
      return mid;
    }
    if (sortedIds[mid] < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return null;
}

export function resolveHexRowIndex(
  lat: number,
  lng: number,
  resolution: number,
  sortedHexIds: string[],
): number | null {
  const cellId = latLngToCell(lat, lng, resolution);
  return binarySearch(sortedHexIds, cellId);
}

// Hex lists are static per deploy, mirroring the cache in manifest.ts's
// fetchManifest — see that comment for why this matters for matchingCityIds.
const hexIdsCache = new Map<string, Promise<string[]>>();

export async function fetchHexIds(
  cityId: string,
  analysisId: string,
): Promise<string[]> {
  const key = `${cityId}/${analysisId}`;
  let cached = hexIdsCache.get(key);
  if (!cached) {
    cached = fetchJson<string[]>(
      `${DATA_BASE_URL}/${cityId}/${analysisId}/hexes.json`,
    );
    cached.catch(() => hexIdsCache.delete(key));
    hexIdsCache.set(key, cached);
  }
  return cached;
}

export async function pointFallsInAnalysis(
  lat: number,
  lng: number,
  cityId: string,
  analysisId: string,
): Promise<boolean> {
  const [manifest, hexIds] = await Promise.all([
    fetchManifest(cityId, analysisId),
    fetchHexIds(cityId, analysisId),
  ]);
  return (
    resolveHexRowIndex(lat, lng, manifest.hexagonResolution, hexIds) !== null
  );
}

export async function matchingCityIds(
  lat: number,
  lng: number,
  analyses: Array<{ cityId: string; analysisId: string }>,
): Promise<Set<string>> {
  const hits = await Promise.all(
    analyses.map(async (a) => ({
      cityId: a.cityId,
      matches: await pointFallsInAnalysis(lat, lng, a.cityId, a.analysisId),
    })),
  );
  return new Set(hits.filter((h) => h.matches).map((h) => h.cityId));
}
