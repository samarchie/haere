import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as geocode from "../data/geocode";
import * as hexLookup from "../data/hexLookup";
import * as manifestData from "../data/manifest";
import { WizardStateProvider } from "../state/WizardStateContext";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import {
  Location,
  canAddDestination,
  canContinue,
  emptyFieldRow,
  fieldStatusText,
} from "./Location";

describe("emptyFieldRow", () => {
  it("starts idle with no point", () => {
    expect(emptyFieldRow()).toMatchObject({
      address: "",
      status: "idle",
      point: null,
    });
  });
});

describe("canContinue", () => {
  it("requires a resolved origin and at least one resolved destination", () => {
    const resolved = {
      ...emptyFieldRow(),
      status: "resolved" as const,
      point: { lat: 1, lng: 1, label: "x" },
    };
    expect(canContinue(emptyFieldRow(), [resolved])).toBe(false);
    expect(canContinue(resolved, [emptyFieldRow()])).toBe(false);
    expect(canContinue(resolved, [resolved])).toBe(true);
  });
});

describe("canAddDestination", () => {
  it("caps destinations at 5", () => {
    expect(canAddDestination(Array.from({ length: 5 }, emptyFieldRow))).toBe(
      false,
    );
    expect(canAddDestination(Array.from({ length: 4 }, emptyFieldRow))).toBe(
      true,
    );
  });
});

describe("fieldStatusText", () => {
  it("describes a no-match row", () => {
    expect(fieldStatusText({ ...emptyFieldRow(), status: "no-match" })).toMatch(
      /No address found/,
    );
  });
});

describe("Location", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState(null, "", "/location");
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
    });
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue({
      hexagonResolution: 8,
      hexCount: 10,
      percentiles: [25, 50, 75],
      encoding: {
        dtype: "uint16",
        bytesPerValue: 2,
        byteOrder: "little",
        unreachable: 65535,
      },
      scenarios: [],
    });
    vi.spyOn(hexLookup, "fetchHexIds").mockResolvedValue(["a", "b", "c"]);
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(0);
    vi.spyOn(geocode, "forwardGeocode").mockResolvedValue({
      ok: true,
      result: { lat: -43.5, lng: 172.6, label: "123 Test St" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves an address after the debounce window", async () => {
    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    const destinationInput = screen.getByLabelText("Destination 1");
    fireEvent.change(destinationInput, { target: { value: "123 Test St" } });

    // @testing-library/dom's waitFor only detects Jest's fake timers, not
    // vitest's, so it never polls while vi.useFakeTimers() is active here.
    // Advance the debounce timer inside act() and assert directly instead —
    // advanceTimersByTimeAsync already drains the microtask queue after the
    // timer fires, which is enough for the chained geocode/manifest/hex
    // lookups (all mocked as already-resolved promises) to settle.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText(/matched to the model grid/)).toBeInTheDocument();
  });
});
