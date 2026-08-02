import { latLngToCell } from "h3-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "../data/manifest";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import {
  type FieldRow,
  canAddDestination,
  canContinue,
  emptyFieldRow,
  fieldStatusText,
  renderLocation,
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

function seedWizard(
  overrides: Partial<ReturnType<typeof emptyWizardState>> = {},
): void {
  saveWizardState({
    ...emptyWizardState(),
    cityId: "canterbury",
    analysisId: "test-analysis",
    ...overrides,
  });
}

function makeRoot(): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("renderLocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("adding a destination keeps both destination fields in the DOM", () => {
    seedWizard();
    const root = makeRoot();

    renderLocation(root);

    const addButton = Array.from(root.querySelectorAll("button")).find(
      (b) => b.textContent === "+ Add another destination",
    ) as HTMLButtonElement;
    expect(addButton).toBeTruthy();
    addButton.click();

    const destinationInputs = root.querySelectorAll(
      'input[id^="destination-"]',
    );
    expect(destinationInputs.length).toBe(2);
  });

  it("shows a no-match status and keeps the typed address after a failed geocode", async () => {
    vi.useFakeTimers();
    seedWizard();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ features: [] }),
      }),
    );

    const root = makeRoot();
    renderLocation(root);

    const input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "Sm Street";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    const updatedInput = root.querySelector(
      "#destination-0",
    ) as HTMLInputElement;
    expect(updatedInput.value).toBe("Sm Street");
    expect(root.textContent).toContain("No address found");
  });

  it("keeps an edited destination present as a field through the idle transition", async () => {
    vi.useFakeTimers();
    seedWizard({
      destinations: [
        {
          label: "Destination 1",
          address: "Old Address",
          lat: -43.5,
          lng: 172.6,
        },
      ],
    });
    const { promise: pending } = deferred<{
      ok: boolean;
      json: () => Promise<{ features: never[] }>;
    }>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    const root = makeRoot();
    renderLocation(root);

    expect(root.querySelectorAll('input[id^="destination-"]').length).toBe(1);

    const input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "New Address 123";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Before the debounced geocode fires, the field must still be present
    // with the freshly typed address.
    const stillThere = root.querySelector("#destination-0") as HTMLInputElement;
    expect(stillThere).toBeTruthy();
    expect(stillThere.value).toBe("New Address 123");

    // Advance to the point the debounce fires and the request is in flight
    // (status becomes "geocoding") — the field must still survive this
    // re-render, since it's driven from the live in-memory row, not from
    // whatever was last persisted to storage.
    await vi.advanceTimersByTimeAsync(500);

    const midFlight = root.querySelector("#destination-0") as HTMLInputElement;
    expect(midFlight).toBeTruthy();
    expect(midFlight.value).toBe("New Address 123");
    expect(root.textContent).toContain("Looking that up");
  });

  it("ignores a stale geocode response that resolves after a newer edit", async () => {
    vi.useFakeTimers();
    seedWizard();
    const first = deferred<{
      ok: boolean;
      json?: () => Promise<{ features: unknown[] }>;
    }>();
    const second = deferred<{
      ok: boolean;
      json?: () => Promise<{ features: unknown[] }>;
    }>();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes(encodeURIComponent("first address"))) {
          return first.promise;
        }
        if (url.includes(encodeURIComponent("second address"))) {
          return second.promise;
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const root = makeRoot();
    renderLocation(root);

    let input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "first address";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    // First request ("first address") is now in flight.

    input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "second address";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    // Second request ("second address") is now in flight too.

    // Resolve the NEWER request first, as a successful-looking no-match.
    second.resolve({ ok: true, json: () => Promise.resolve({ features: [] }) });
    await flushMicrotasks();

    // Now resolve the STALE, older request — this must be ignored because
    // the row's address has moved on since it was fired.
    first.resolve({ ok: false });
    await flushMicrotasks();

    const finalInput = root.querySelector("#destination-0") as HTMLInputElement;
    expect(finalInput.value).toBe("second address");
    expect(root.textContent).toContain("No address found");
    expect(root.textContent).not.toContain("unavailable right now");
  });
});
