import { latLngToCell } from "h3-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { binarySearch, fetchHexIds, resolveHexRowIndex } from "./hexLookup";

describe("binarySearch", () => {
  const sorted = [
    "89da94a0007ffff",
    "89da94a0023ffff",
    "89da94a0027ffff",
    "89da94a002bffff",
  ];

  it("finds the index of a present id", () => {
    expect(binarySearch(sorted, "89da94a0027ffff")).toBe(2);
  });

  it("finds the first and last elements", () => {
    expect(binarySearch(sorted, sorted[0])).toBe(0);
    expect(binarySearch(sorted, sorted[sorted.length - 1])).toBe(3);
  });

  it("returns null for a missing id", () => {
    expect(binarySearch(sorted, "ffffffffffffff0")).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(binarySearch([], "89da94a0007ffff")).toBeNull();
  });
});

describe("resolveHexRowIndex", () => {
  it("resolves a point inside the study area to its row index", () => {
    const resolution = 9;
    // A real Christchurch point, converted to its own H3 cell, then placed
    // into a small sorted fixture array alongside two other real cells.
    const cell = latLngToCell(-43.532, 172.636, resolution);
    const otherA = latLngToCell(-43.5, 172.6, resolution);
    const otherB = latLngToCell(-43.55, 172.65, resolution);
    const sorted = [cell, otherA, otherB].sort();

    const rowIndex = resolveHexRowIndex(-43.532, 172.636, resolution, sorted);

    expect(rowIndex).toBe(sorted.indexOf(cell));
  });

  it("returns null when the resolved cell isn't in the study area", () => {
    const resolution = 9;
    const otherA = latLngToCell(-43.5, 172.6, resolution);
    const otherB = latLngToCell(-43.55, 172.65, resolution);
    const sorted = [otherA, otherB].sort();

    // A point far from both fixture cells and outside their hex.
    const rowIndex = resolveHexRowIndex(-40.0, 175.0, resolution, sorted);

    expect(rowIndex).toBeNull();
  });
});

describe("fetchHexIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and parses the hexes.json array for a city/analysis", async () => {
    const ids = ["89da94a0007ffff", "89da94a0023ffff"];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(ids),
      }),
    );

    const result = await fetchHexIds("canterbury", "remove-route-135");

    expect(result).toEqual(ids);
    expect(fetch).toHaveBeenCalledWith(
      "/data/canterbury/remove-route-135/hexes.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
