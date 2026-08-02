import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchError, fetchJson } from "./fetchJson";

describe("fetchJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ foo: "bar" }),
      }),
    );

    const result = await fetchJson<{ foo: string }>("/data/thing.json");

    expect(result).toEqual({ foo: "bar" });
  });

  it("throws a FetchError with the status for a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve(null),
      }),
    );

    await expect(fetchJson("/data/missing.json")).rejects.toMatchObject({
      name: "FetchError",
      status: 404,
    });
    await expect(fetchJson("/data/missing.json")).rejects.toBeInstanceOf(
      FetchError,
    );
  });

  it("propagates a rejected fetch (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network error")),
    );

    await expect(fetchJson("/data/thing.json")).rejects.toThrow(
      "network error",
    );
  });
});
