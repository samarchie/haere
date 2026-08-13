import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSuggestions, forwardGeocode, reverseGeocode } from "./geocode";

describe("forwardGeocode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a match with lat/lng and a human label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            features: [
              {
                geometry: { coordinates: [172.62, -43.53] },
                properties: {
                  name: "123",
                  street: "Riccarton Road",
                  city: "Christchurch",
                },
              },
            ],
          }),
      }),
    );

    const outcome = await forwardGeocode("123 Riccarton Road, Christchurch");

    expect(outcome).toEqual({
      ok: true,
      result: {
        lat: -43.53,
        lng: 172.62,
        label: "123 Riccarton Road, Christchurch",
      },
    });
  });

  it("calls Photon's forward endpoint with the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await forwardGeocode("15 Cashel Street");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://photon.komoot.io/api/?q=15%20Cashel%20Street&limit=1",
    );
  });

  it("returns no-match when features is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ features: [] }),
      }),
    );

    expect(await forwardGeocode("nonsense address")).toEqual({
      ok: false,
      reason: "no-match",
    });
  });

  it("returns unavailable when the response isn't ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    expect(await forwardGeocode("anything")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("returns unavailable when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    expect(await forwardGeocode("anything")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("fetchSuggestions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns up to five labeled results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            features: [
              {
                geometry: { coordinates: [172.62, -43.53] },
                properties: {
                  name: "123",
                  street: "Riccarton Road",
                  city: "Christchurch",
                },
              },
              {
                geometry: { coordinates: [172.6, -43.5] },
                properties: {
                  name: "125",
                  street: "Riccarton Road",
                  city: "Christchurch",
                },
              },
            ],
          }),
      }),
    );

    const results = await fetchSuggestions("123 Riccarton");

    expect(results).toEqual([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
      { lat: -43.5, lng: 172.6, label: "125 Riccarton Road, Christchurch" },
    ]);
  });

  it("calls Photon with limit=5", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchSuggestions("15 Cashel Street");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://photon.komoot.io/api/?q=15%20Cashel%20Street&limit=5",
    );
  });

  it("throws when the response isn't ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(fetchSuggestions("anything")).rejects.toThrow();
  });

  it("propagates the error when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(fetchSuggestions("anything")).rejects.toThrow("network down");
  });
});

describe("reverseGeocode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a human label for the coordinate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            features: [
              {
                geometry: { coordinates: [172.62, -43.53] },
                properties: {
                  name: "123",
                  street: "Riccarton Road",
                  city: "Christchurch",
                },
              },
            ],
          }),
      }),
    );

    expect(await reverseGeocode(-43.53, 172.62)).toBe(
      "123 Riccarton Road, Christchurch",
    );
  });

  it("calls Photon's reverse endpoint with lat/lon", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await reverseGeocode(-43.53, 172.62);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://photon.komoot.io/reverse/?lat=-43.53&lon=172.62",
    );
  });

  it("returns null when there are no features", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ features: [] }),
      }),
    );
    expect(await reverseGeocode(-43.53, 172.62)).toBeNull();
  });

  it("returns null when the response isn't ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    expect(await reverseGeocode(-43.53, 172.62)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    expect(await reverseGeocode(-43.53, 172.62)).toBeNull();
  });
});
