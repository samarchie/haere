import { latLngToCell } from "h3-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "../data/manifest";
import { el } from "../dom";
import {
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "../state/wizardState";
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
      search: "?city=canterbury&reason=outside-area",
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
  beforeEach(() => {
    // renderLocation's renderForm() only renders while the location screen
    // is the current one (see Finding 3's guard) — the real router always
    // navigates (updating the path) before rendering a screen, so tests
    // must reflect that same precondition.
    window.history.replaceState(null, "", "/location");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
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

  it("appends a blank destination row when navigated with ?addDestination=1", () => {
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
    window.history.replaceState(null, "", "/location?addDestination=1");
    const root = makeRoot();

    renderLocation(root);

    const destinationInputs = root.querySelectorAll(
      'input[id^="destination-"]',
    );
    expect(destinationInputs.length).toBe(2);
  });

  it("does not append a 6th destination row when already at the 5-destination cap", () => {
    seedWizard({
      destinations: [1, 2, 3, 4, 5].map((n) => ({
        label: `Destination ${n}`,
        address: "Old Address",
        lat: -43.5,
        lng: 172.6,
      })),
    });
    window.history.replaceState(null, "", "/location?addDestination=1");
    const root = makeRoot();

    renderLocation(root);

    const destinationInputs = root.querySelectorAll(
      'input[id^="destination-"]',
    );
    expect(destinationInputs.length).toBe(5);
    expect(window.location.search).not.toContain("addDestination");
  });

  it("clears the addDestination flag from the URL after consuming it", () => {
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
    window.history.replaceState(null, "", "/location?addDestination=1");
    const root = makeRoot();

    renderLocation(root);

    expect(window.location.search).not.toContain("addDestination");
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

  it("keeps focus and caret in a destination field across the immediate re-render triggered by typing", () => {
    seedWizard();
    const root = makeRoot();
    renderLocation(root);

    const input = root.querySelector("#destination-0") as HTMLInputElement;
    input.focus();
    input.value = "1600 Amp";
    input.setSelectionRange(5, 5);
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const afterRerender = root.querySelector(
      "#destination-0",
    ) as HTMLInputElement;
    expect(afterRerender).toBeTruthy();
    expect(document.activeElement).toBe(afterRerender);
    expect(afterRerender.selectionStart).toBe(5);
    expect(afterRerender.selectionEnd).toBe(5);
  });

  it("gives each field its own debounce timer, so typing in one field does not cancel another field's pending geocode", async () => {
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

    const originInput = root.querySelector("#origin") as HTMLInputElement;
    originInput.value = "Origin Address";
    originInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Switch to the destination field within the origin's debounce window.
    await vi.advanceTimersByTimeAsync(200);
    const destInput = root.querySelector("#destination-0") as HTMLInputElement;
    destInput.value = "Destination Address";
    destInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Advance far enough for both fields' own 500ms debounce timers to fire.
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    const matches = root.textContent?.match(/No address found/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("disables Continue immediately when a resolved field is edited, before the debounce fires", () => {
    vi.useFakeTimers();
    seedWizard({
      origin: { address: "123 Main St", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "456 Other St",
          lat: -43.51,
          lng: 172.61,
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ features: [] }),
      }),
    );

    const root = makeRoot();
    renderLocation(root);

    const findContinue = () =>
      Array.from(root.querySelectorAll("button")).find(
        (b) => b.textContent === "Continue →",
      ) as HTMLButtonElement;

    expect(findContinue().disabled).toBe(false);

    const originInput = root.querySelector("#origin") as HTMLInputElement;
    originInput.value = "New Address";
    originInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(findContinue().disabled).toBe(true);
  });

  it("uses a monotonic per-row counter so a stale response can't win an edit-away-and-back race", async () => {
    vi.useFakeTimers();
    seedWizard();

    const resolution = 9;
    const hexIds = [
      latLngToCell(-43.5, 172.6, resolution),
      latLngToCell(-43.51, 172.61, resolution),
    ].sort();

    const photonQueue = [
      deferred<{ ok: boolean; json: () => Promise<unknown> }>(),
      deferred<{ ok: boolean; json: () => Promise<unknown> }>(),
      deferred<{ ok: boolean; json: () => Promise<unknown> }>(),
    ];
    let photonCallIndex = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("photon.komoot.io")) {
          return photonQueue[photonCallIndex++].promise;
        }
        if (url.includes("/manifest.json")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                hexagon_resolution: resolution,
                hex_count: hexIds.length,
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
        if (url.includes("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(hexIds),
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const root = makeRoot();
    renderLocation(root);

    // Request #1: type "abc" and let its debounce fire (photon call #1
    // goes in flight).
    let input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "abc";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);

    // Request #2: edit away to "abcd" and let its debounce fire (photon
    // call #2 goes in flight).
    input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "abcd";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);

    // Request #3: edit back to "abc" (the SAME address as request #1) and
    // let its debounce fire (photon call #3 goes in flight). Address-
    // equality staleness checks can't tell #1 and #3 apart; a monotonic
    // counter can.
    input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "abc";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);

    // Resolve the CURRENT request (#3) first, then the stale #2, then the
    // stale #1 LAST — deliberately out of order. An address-equality
    // staleness guard sees #1's captured address ("abc") still matches the
    // row's current address ("abc", since we edited back to it) and would
    // wrongly accept this late-arriving stale response, clobbering the
    // already-correct state from #3. A monotonic per-row counter rejects
    // #1 regardless of resolution order, because a newer request (#3) has
    // since started for this row.
    photonQueue[2].resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [172.61, -43.51] },
              properties: { name: "Third (current)" },
            },
          ],
        }),
    });
    await flushMicrotasks();

    photonQueue[1].resolve({
      ok: true,
      json: () => Promise.resolve({ features: [] }),
    });
    await flushMicrotasks();

    photonQueue[0].resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [172.6, -43.5] },
              properties: { name: "First (stale)" },
            },
          ],
        }),
    });
    await flushMicrotasks();

    expect(root.textContent).toContain("Third (current)");
    expect(root.textContent).not.toContain("First (stale)");
  });

  it("invalidates an in-flight geocode when the field is edited before it resolves, even when the edit doesn't fire a new request", async () => {
    vi.useFakeTimers();
    seedWizard();
    const resolution = 9;
    const cell = latLngToCell(-43.5, 172.6, resolution);
    const first = deferred<{
      ok: boolean;
      json?: () => Promise<{ features: unknown[] }>;
    }>();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes(encodeURIComponent("full address"))) {
          return first.promise;
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
        if (url.includes("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([cell]),
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const root = makeRoot();
    renderLocation(root);

    const input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "full address";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    // Request is now in flight (mid-await on forwardGeocode).

    // Edit the field down to a value short enough that no new geocode is
    // scheduled (below the 3-character threshold, so cancelScheduledGeocode
    // runs instead of scheduleGeocode). This isolates the oninput counter
    // bump: nothing else in the codebase invalidates the in-flight request
    // here except that bump.
    input.value = "ab";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Now let the orphaned in-flight request resolve successfully.
    first.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [172.6, -43.5] },
              properties: { name: "Full Address Match" },
            },
          ],
        }),
    });
    await flushMicrotasks();

    const finalInput = root.querySelector("#destination-0") as HTMLInputElement;
    expect(finalInput.value).toBe("ab");
    expect(root.textContent).not.toContain("Full Address Match");
    expect(root.textContent).not.toContain("matched to the model grid");
  });

  it("does not re-render the location form over a screen navigated to while a geocode was in flight", async () => {
    vi.useFakeTimers();
    seedWizard({
      origin: { address: "123 Main St", lat: -43.5, lng: 172.6 },
    });
    const { promise: pending, resolve } = deferred<{
      ok: boolean;
      json?: () => Promise<{ features: unknown[] }>;
    }>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));

    const root = makeRoot();
    renderLocation(root);

    const input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "New Destination";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    // The geocode is now in flight (mid-await on forwardGeocode).

    // Simulate the user navigating away (e.g. clicking Continue) before the
    // in-flight geocode resolves, the same way router.test.ts simulates
    // navigation.
    window.history.pushState(null, "", "/scenario");
    root.replaceChildren(el("p", {}, "scenario screen placeholder"));

    resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              geometry: { coordinates: [172.61, -43.51] },
              properties: { name: "New Destination Match" },
            },
          ],
        }),
    });
    await flushMicrotasks();

    expect(root.textContent).toBe("scenario screen placeholder");
    expect(root.textContent).not.toContain("New Destination Match");
  });

  it("recovers from a transient area-data fetch failure instead of getting stuck at 'geocoding' forever", async () => {
    vi.useFakeTimers();
    seedWizard();

    const resolution = 9;
    const cell = latLngToCell(-43.5, 172.6, resolution);
    let manifestCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("photon.komoot.io")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                features: [
                  {
                    geometry: { coordinates: [172.6, -43.5] },
                    properties: { name: "Some Address" },
                  },
                ],
              }),
          });
        }
        if (url.includes("/manifest.json")) {
          manifestCallCount++;
          if (manifestCallCount === 1) {
            return Promise.resolve({ ok: false, status: 500 });
          }
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
        if (url.includes("/hexes.json")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([cell]),
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const root = makeRoot();
    renderLocation(root);

    // First attempt: the manifest fetch fails once, so ensureAreaData()'s
    // cached promise rejects.
    let input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "first attempt";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    expect(root.textContent).toContain("unavailable right now");

    // Second attempt on the same field: the manifest fetch now succeeds.
    // This only works if the rejected promise was evicted from the cache,
    // proving Finding 2 is fixed rather than permanently poisoned.
    input = root.querySelector("#destination-0") as HTMLInputElement;
    input.value = "second attempt";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);
    await flushMicrotasks();

    expect(root.textContent).toContain("matched to the model grid");
  });
});

describe("renderLocation destination label numbering", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/location");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
  });

  it("numbers resolved destinations sequentially, skipping an unresolved middle row", () => {
    seedWizard({
      destinations: [
        { label: "Destination 1", address: "First", lat: -43.5, lng: 172.6 },
        { label: "Destination 2", address: "Second", lat: -43.51, lng: 172.61 },
        { label: "Destination 3", address: "Third", lat: -43.52, lng: 172.62 },
      ],
    });
    const root = makeRoot();
    renderLocation(root);

    // Make the middle destination unresolved by editing it to a short,
    // non-geocodable value (idle status, no new request scheduled).
    const middleInput = root.querySelector(
      "#destination-1",
    ) as HTMLInputElement;
    middleInput.value = "ab";
    middleInput.dispatchEvent(new Event("input", { bubbles: true }));

    const saved = loadWizardState();
    expect(saved?.destinations.map((d) => d.label)).toEqual([
      "Destination 1",
      "Destination 2",
    ]);
    expect(saved?.destinations.map((d) => d.address)).toEqual([
      "First",
      "Third",
    ]);
  });
});

describe("renderLocation stepper", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/location");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
  });

  it("renders a stepper with location as the current step and picker as a clickable prior step", () => {
    seedWizard();
    const root = makeRoot();

    renderLocation(root);

    const current = root.querySelector("[data-step='location']");
    expect(current?.tagName).toBe("SPAN");
    const priorStep = root.querySelector("[data-step='picker']");
    expect(priorStep?.tagName).toBe("BUTTON");
    expect(priorStep?.classList.contains("stepper__link")).toBe(true);
  });
});
