import { latLngToCell } from "h3-js";
import { DATA_BASE_URL } from "../config";

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

export async function fetchHexIds(
  cityId: string,
  analysisId: string,
): Promise<string[]> {
  const response = await fetch(
    `${DATA_BASE_URL}/${cityId}/${analysisId}/hexes.json`,
  );
  return (await response.json()) as string[];
}
