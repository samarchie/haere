import { latLngToCell } from "h3-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "../data/manifest";
import {
  type FieldRow,
  canAddDestination,
  canContinue,
  emptyFieldRow,
  fieldStatusText,
  resolveOriginRouting,
} from "./location";

function resolvedRow(lat: number, lng: number): FieldRow {
  return {
    address: "123 Main St",
    status: "resolved",
    point: { lat, lng, label: "123 Main St" },
  };
}

describe("canContinue", () => {
  it("is false when the origin isn't resolved", () => {
    expect(canContinue(emptyFieldRow(), [resolvedRow(-43.5, 172.6)])).toBe(
      false,
    );
  });

  it("is false with no resolved destination", () => {
    expect(canContinue(resolvedRow(-43.5, 172.6), [emptyFieldRow()])).toBe(
      false,
    );
  });

  it("is true with a resolved origin and at least one resolved destination", () => {
    expect(
      canContinue(resolvedRow(-43.5, 172.6), [
        emptyFieldRow(),
        resolvedRow(-43.53, 172.63),
      ]),
    ).toBe(true);
  });
});

describe("canAddDestination", () => {
  it("allows up to 5 destinations", () => {
    const four = [1, 2, 3, 4].map(() => emptyFieldRow());
    const five = [1, 2, 3, 4, 5].map(() => emptyFieldRow());
    expect(canAddDestination(four)).toBe(true);
    expect(canAddDestination(five)).toBe(false);
  });
});

describe("fieldStatusText", () => {
  it("describes each status", () => {
    expect(fieldStatusText({ ...emptyFieldRow(), status: "geocoding" })).toBe(
      "Looking that up…",
    );
    expect(
      fieldStatusText({ ...emptyFieldRow(), status: "no-match" }),
    ).toContain("No address found");
    expect(
      fieldStatusText({ ...emptyFieldRow(), status: "unavailable" }),
    ).toContain("unavailable");
    expect(
      fieldStatusText({ ...emptyFieldRow(), status: "outside-area" }),
    ).toContain("outside the modelled area");
    expect(fieldStatusText(resolvedRow(-43.5, 172.6))).toContain("✓");
    expect(fieldStatusText(emptyFieldRow())).toBeNull();
  });
});

describe("resolveOriginRouting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns in-area when the point resolves within the current analysis", async () => {
    const resolution = 9;
    const point = { lat: -43.532, lng: 172.636, label: "origin" };
    const cell = latLngToCell(point.lat, point.lng, resolution);
    const manifest = { hexagonResolution: resolution } as Manifest;

    const routing = await resolveOriginRouting(
      point,
      "canterbury",
      "remove-route-135",
      manifest,
      [cell],
    );

    expect(routing).toEqual({ type: "in-area" });
  });

  it("reroutes to picker with an outside-area reason when no sibling analysis matches", async () => {
    const resolution = 9;
    const point = { lat: -43.532, lng: 172.636, label: "origin" };
    const otherCell = latLngToCell(-40.0, 175.0, resolution);
    const manifest = { hexagonResolution: resolution } as Manifest;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    );

    const routing = await resolveOriginRouting(
      point,
      "canterbury",
      "remove-route-135",
      manifest,
      [otherCell],
    );

    expect(routing).toEqual({
      type: "reroute",
      search: "?reason=outside-area",
    });
  });

  it("reroutes to picker with a multi-match reason when a sibling analysis in the same city matches", async () => {
    const resolution = 9;
    const point = { lat: -43.532, lng: 172.636, label: "origin" };
    const cell = latLngToCell(point.lat, point.lng, resolution);
    const otherCell = latLngToCell(-40.0, 175.0, resolution);
    const manifest = { hexagonResolution: resolution } as Manifest;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/analyses.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  city_id: "canterbury",
                  city_name: "Canterbury",
                  analysis_id: "another-analysis",
                  title: "Another analysis",
                  description: "",
                  consultation_url: null,
                  consultation_status: null,
                },
              ]),
          });
        }
        if (url.includes("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([cell]),
          });
        }
        if (url.includes("/manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                hexagon_resolution: resolution,
                hex_count: 1,
                percentiles: [50],
                encoding: {
                  dtype: "uint8",
                  bytes_per_value: 1,
                  byte_order: "little",
                  unreachable: 255,
                },
                scenarios: [],
              }),
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const routing = await resolveOriginRouting(
      point,
      "canterbury",
      "remove-route-135",
      manifest,
      [otherCell],
    );

    expect(routing).toEqual({
      type: "reroute",
      search: "?city=canterbury&reason=multi-match",
    });
  });
});
