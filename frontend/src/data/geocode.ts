import { readJsonFromStorage, writeJsonToStorage } from "../lib/storageCache";
import { fetchJson } from "./fetchJson";

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

export type GeocodeOutcome =
  | { ok: true; result: GeocodeResult }
  | { ok: false; reason: "no-match" | "unavailable" };

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

// localStorage cache, no TTL/eviction. Addresses don't move and the
// key space is small for a personal-use tool; add eviction if it ever matters.

function labelFor(feature: PhotonFeature, fallbackQuery: string): string {
  const { name, housenumber, street, city } = feature.properties;
  // Photon puts the number in `name` for address results (street stays
  // separate), but in `housenumber` for POI results where `name` is the
  // POI's title instead — so try both rather than assuming one shape.
  const line = street
    ? [housenumber ?? name, street].filter(Boolean).join(" ")
    : name;
  const parts = [line, city].filter((p) => p && p.length > 0);
  return parts.length > 0 ? parts.join(", ") : fallbackQuery;
}

export async function forwardGeocode(query: string): Promise<GeocodeOutcome> {
  const key = `geocode:fwd:${query}`;
  const hit = readJsonFromStorage<GeocodeOutcome>(key);
  if (hit) return hit;

  const outcome = await forwardGeocodeUncached(query);
  if (outcome.ok) writeJsonToStorage(key, outcome);
  return outcome;
}

async function forwardGeocodeUncached(query: string): Promise<GeocodeOutcome> {
  try {
    const data = await fetchJson<PhotonResponse>(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
    );
    const [feature] = data.features;
    if (!feature) {
      return { ok: false, reason: "no-match" };
    }

    const [lng, lat] = feature.geometry.coordinates;
    return { ok: true, result: { lat, lng, label: labelFor(feature, query) } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function fetchSuggestions(
  query: string,
): Promise<GeocodeResult[]> {
  const key = `geocode:suggest:${query}`;
  const hit = readJsonFromStorage<GeocodeResult[]>(key);
  if (hit) return hit;

  // Unlike forwardGeocode, a fetch failure here isn't swallowed to an empty
  // array — callers need to tell "no suggestions" apart from "lookup broke"
  // (see AddressAutocomplete's onSearchSettled).
  const data = await fetchJson<PhotonResponse>(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
  );
  const results = data.features.map((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng, label: labelFor(feature, query) };
  });
  if (results.length > 0) writeJsonToStorage(key, results);
  return results;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  // Round to ~1m precision so repeat clicks near the same spot hit cache.
  const key = `geocode:reverse:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = readJsonFromStorage<string>(key);
  if (hit) return hit;

  try {
    const data = await fetchJson<PhotonResponse>(
      `https://photon.komoot.io/reverse/?lat=${lat}&lon=${lng}`,
    );
    const [feature] = data.features;
    const label = feature ? labelFor(feature, `${lat}, ${lng}`) : null;
    if (label) writeJsonToStorage(key, label);
    return label;
  } catch {
    return null;
  }
}
