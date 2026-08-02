import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardGeocode } from "./geocode";

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
