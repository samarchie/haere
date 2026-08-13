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
  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
    );
    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }

    const data = (await response.json()) as PhotonResponse;
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
  try {
    const response = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`,
    );
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as PhotonResponse;
    return data.features.map((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      return { lat, lng, label: labelFor(feature, query) };
    });
  } catch {
    return [];
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://photon.komoot.io/reverse/?lat=${lat}&lon=${lng}`,
    );
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PhotonResponse;
    const [feature] = data.features;
    return feature ? labelFor(feature, `${lat}, ${lng}`) : null;
  } catch {
    return null;
  }
}
