import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeDeltaMinutes,
  fetchRow,
  readValueAt,
  rowByteRange,
  toVerdictValue,
} from "./travelTimes";

describe("rowByteRange", () => {
  it("computes the byte range for a row in a uint8 matrix", () => {
    // hexCount = 10, bytesPerValue = 1: row 3 is bytes [30, 40)
    expect(rowByteRange(3, 10, 1)).toEqual({ start: 30, end: 40 });
  });

  it("computes the byte range for a row in a uint16 matrix", () => {
    // hexCount = 10, bytesPerValue = 2: row 3 is bytes [60, 80)
    expect(rowByteRange(3, 10, 2)).toEqual({ start: 60, end: 80 });
  });

  it("row 0 starts at byte 0", () => {
    expect(rowByteRange(0, 10, 1)).toEqual({ start: 0, end: 10 });
  });
});

describe("readValueAt", () => {
  it("reads a uint8 value at a given column index", () => {
    const row = new Uint8Array([5, 12, 255, 0]);
    expect(readValueAt(row, 2, 1)).toBe(255);
  });

  it("reads a little-endian uint16 value at a given column index", () => {
    // column 1 of a uint16 row: bytes [2,3) -> 0x0201 little-endian = 513
    const row = new Uint8Array([0, 0, 0x01, 0x02]);
    expect(readValueAt(row, 1, 2)).toBe(513);
  });
});

describe("toVerdictValue", () => {
  it("maps a real value straight through", () => {
    expect(toVerdictValue(18, 255)).toEqual({ minutes: 18 });
  });

  it("maps the unreachable sentinel to null", () => {
    expect(toVerdictValue(255, 255)).toEqual({ minutes: null });
  });

  it("maps a uint16 unreachable sentinel to null", () => {
    expect(toVerdictValue(65535, 65535)).toEqual({ minutes: null });
  });
});

describe("computeDeltaMinutes", () => {
  it("computes modified minus baseline when both are reachable", () => {
    expect(computeDeltaMinutes({ minutes: 18 }, { minutes: 34 })).toBe(16);
  });

  it("returns null when baseline is unreachable", () => {
    expect(computeDeltaMinutes({ minutes: null }, { minutes: 34 })).toBeNull();
  });

  it("returns null when modified is unreachable", () => {
    expect(computeDeltaMinutes({ minutes: 18 }, { minutes: null })).toBeNull();
  });

  it("returns 0 when there's no change", () => {
    expect(computeDeltaMinutes({ minutes: 18 }, { minutes: 18 })).toBe(0);
  });
});

describe("fetchRow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues a Range request for the row's byte offsets and returns its bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRow(
      "/data/canterbury/remove-route-135/weekday/am_peak/baseline.p50.bin",
      3,
      10,
      1,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/data/canterbury/remove-route-135/weekday/am_peak/baseline.p50.bin",
      { headers: { Range: "bytes=30-39" } },
    );
    expect(result).toEqual(bytes);
  });

  it("throws when the server ignores the Range request and returns a full 200 response (e.g. a dev proxy without Range support silently returning row 0)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      }),
    );

    await expect(
      fetchRow(
        "/data/canterbury/remove-route-135/weekday/am_peak/baseline.p50.bin",
        3,
        10,
        1,
      ),
    ).rejects.toThrow();
  });
});
