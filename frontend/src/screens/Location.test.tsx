import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSummary } from "../data/analysisCatalogue";
import * as analysisCatalogue from "../data/analysisCatalogue";
import * as geocode from "../data/geocode";
import * as hexLookup from "../data/hexLookup";
import type { Manifest } from "../data/manifest";
import * as manifestData from "../data/manifest";
import { WizardStateProvider } from "../state/WizardStateContext";
import {
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "../state/wizardState";
import {
  canAddDestination,
  canContinue,
  emptyFieldRow,
  fieldStatusText,
  Location,
  resolveOriginRouting,
} from "./Location";

vi.mock("maplibre-gl", () => {
  class FakeMap {
    flyTo = vi.fn();
    remove = vi.fn();
    getCenter() {
      return { lat: -43.5, lng: 172.6 };
    }
  }
  return { MapLibreMap: FakeMap };
});

const baseManifest: Manifest = {
  city: { id: "canterbury", name: "Canterbury", center: null },
  analysis: {
    id: "remove-135",
    title: "Test proposal",
    description: "",
    consultation: null,
  },
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
};

function makeAnalysis(overrides: Partial<AnalysisSummary>): AnalysisSummary {
  return {
    cityId: "christchurch",
    cityName: "Christchurch",
    analysisId: "remove-135",
    ...overrides,
  };
}

describe("emptyFieldRow", () => {
  it("starts idle with no point", () => {
    expect(emptyFieldRow()).toMatchObject({
      address: "",
      status: "idle",
      point: null,
      searchIssue: "none",
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
  it("describes an outside-area row", () => {
    expect(
      fieldStatusText({ ...emptyFieldRow(), status: "outside-area" }),
    ).toMatch(/falls outside the modelled area/);
  });

  it("is null for idle and resolved rows", () => {
    expect(fieldStatusText(emptyFieldRow())).toBeNull();
    expect(
      fieldStatusText({ ...emptyFieldRow(), status: "resolved" }),
    ).toBeNull();
  });
});

describe("resolveOriginRouting", () => {
  const point = { lat: -43.5, lng: 172.6, label: "123 Test St" };

  afterEach(() => vi.restoreAllMocks());

  it("returns in-area when the point resolves within the current hex ids", async () => {
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(0);

    const result = await resolveOriginRouting(
      point,
      "christchurch",
      "remove-135",
      baseManifest,
      ["a", "b"],
    );

    expect(result).toEqual({ type: "in-area" });
  });

  it("reroutes with reason=multi-match, filtered to the city, when a sibling analysis in the city matches", async () => {
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(null);
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      makeAnalysis({ analysisId: "remove-135" }),
      makeAnalysis({ analysisId: "add-route-99" }),
    ]);
    vi.spyOn(hexLookup, "pointFallsInAnalysis").mockResolvedValue(true);

    const result = await resolveOriginRouting(
      point,
      "christchurch",
      "remove-135",
      baseManifest,
      ["a", "b"],
    );

    expect(result.type).toBe("reroute");
    const search = (result as { type: "reroute"; search: string }).search;
    expect(search).toContain("reason=multi-match");
    expect(search).toContain("city=christchurch");
  });

  it("reroutes with reason=outside-area, city filter cleared, when no analysis in the city matches", async () => {
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(null);
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      makeAnalysis({ analysisId: "remove-135" }),
      makeAnalysis({ analysisId: "add-route-99" }),
    ]);
    vi.spyOn(hexLookup, "pointFallsInAnalysis").mockResolvedValue(false);

    const result = await resolveOriginRouting(
      point,
      "christchurch",
      "remove-135",
      baseManifest,
      ["a", "b"],
    );

    expect(result.type).toBe("reroute");
    const search = (result as { type: "reroute"; search: string }).search;
    expect(search).toContain("reason=outside-area");
    expect(search).toBe("?city=&reason=outside-area");
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
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue(baseManifest);
    vi.spyOn(hexLookup, "fetchHexIds").mockResolvedValue(["a", "b", "c"]);
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hides the destinations section until the origin resolves", () => {
    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    expect(screen.getByLabelText("Home address")).toBeInTheDocument();
    expect(screen.queryByText("Destinations")).not.toBeInTheDocument();
  });

  it("shows the origin summary and destinations once origin resolves", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByText("123 Riccarton Road, Christchurch"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("Destinations")).toBeInTheDocument();
    expect(
      screen.getByText("123 Riccarton Road, Christchurch"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Destination 1")).toBeInTheDocument();
  });

  it("shows the no-study-area notice when the origin search returns no suggestions", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([]);

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "88 Selwyn Street" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(
      screen.getByText("No study area covers this address yet"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("View all proposals"));
    expect(window.location.pathname).toBe("/proposal");
  });

  it("shows an unavailable notice, not the no-study-area one, when resolving the origin fails to look up area data", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);
    vi.spyOn(manifestData, "fetchManifest").mockRejectedValue(
      new Error("network down"),
    );

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByText("123 Riccarton Road, Christchurch"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      screen.getByText(
        "Address lookup is unavailable right now — try again shortly.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No study area covers this address yet"),
    ).not.toBeInTheDocument();
  });

  it("ignores a slower resolve response for an origin address the user has since replaced", async () => {
    vi.spyOn(geocode, "fetchSuggestions")
      .mockResolvedValueOnce([
        { lat: -43.6, lng: 172.7, label: "Old Address, Rural Canterbury" },
      ])
      .mockResolvedValueOnce([
        { lat: -43.5, lng: 172.6, label: "New Address, Christchurch" },
      ]);

    // The old address resolves as outside the current analysis, which sends
    // it down the slower sibling-routing path (gated on fetchAnalyses); the
    // new address resolves in-area, finishing with no further awaits.
    let releaseSiblingCheck: () => void = () => {};
    const siblingCheckGate = new Promise<void>((resolve) => {
      releaseSiblingCheck = resolve;
    });
    vi.spyOn(hexLookup, "resolveHexRowIndex")
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(0);
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockImplementation(
      async () => {
        await siblingCheckGate;
        return [];
      },
    );

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "Old Address" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByText("Old Address, Rural Canterbury"));
    // Old Address's chain is now blocked on the gate above.

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "New Address" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByText("New Address, Christchurch"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("New Address, Christchurch")).toBeInTheDocument();

    // Let the stale Old Address chain finish. It must not clobber the row
    // or navigate away based on an address the user no longer has selected.
    await act(async () => {
      releaseSiblingCheck();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("New Address, Christchurch")).toBeInTheDocument();
    expect(
      screen.queryByText("Old Address, Rural Canterbury"),
    ).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/location");
  });

  it("clicking edit reverts a resolved destination to editing mode", async () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "15 Cashel St",
          lat: -43.53,
          lng: 172.63,
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    expect(screen.getByText("15 Cashel St")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Edit Destination 1"));

    expect(screen.getByLabelText("Destination 1")).toHaveValue("15 Cashel St");
  });

  it("keeps the persisted origin when the edit pencil is clicked but no new address is chosen", async () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "15 Cashel St",
          lat: -43.53,
          lng: 172.63,
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.click(screen.getByLabelText("Edit Home address"));
    // Destinations disappear while the origin is mid-edit — that's expected,
    // not the bug under test; what matters is what gets persisted below.
    expect(screen.queryByText("Destinations")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(loadWizardState()?.origin).toEqual({
      address: "123 Riccarton Rd",
      lat: -43.5,
      lng: 172.6,
    });
  });

  it("does not offer to delete the only destination", () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "15 Cashel St",
          lat: -43.53,
          lng: 172.63,
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    expect(
      screen.queryByLabelText("Delete Destination 1"),
    ).not.toBeInTheDocument();
  });

  it("drops a pending undo strip when another destination is added", () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "15 Cashel St",
          lat: -43.53,
          lng: 172.63,
        },
        {
          label: "Destination 2",
          address: "88 Riccarton Rd",
          lat: -43.54,
          lng: 172.6,
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.click(screen.getByLabelText("Delete Destination 1"));
    expect(screen.getByText("Destination removed")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Add another destination/ }),
    );

    expect(screen.queryByText("Destination removed")).not.toBeInTheDocument();
  });

  it("shows feedback when a resolved destination falls outside the modelled area", async () => {
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(null);
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.6, lng: 172.7, label: "Faraway Road, Rural Canterbury" },
    ]);
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.change(screen.getByLabelText("Destination 1"), {
      target: { value: "Faraway Road" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    fireEvent.click(screen.getByText("Faraway Road, Rural Canterbury"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(
      screen.getByText("That point falls outside the modelled area."),
    ).toBeInTheDocument();
  });

  it("deleting a destination shows an undo strip that restores it in place", () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "15 Cashel St",
          lat: -43.53,
          lng: 172.63,
        },
        {
          label: "Destination 2",
          address: "88 Riccarton Rd",
          lat: -43.54,
          lng: 172.6,
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    fireEvent.click(screen.getByLabelText("Delete Destination 1"));

    expect(screen.getByText("Destination removed")).toBeInTheDocument();
    expect(screen.queryByText("15 Cashel St")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 5 destinations")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Undo"));

    expect(screen.queryByText("Destination removed")).not.toBeInTheDocument();
    expect(screen.getByText("15 Cashel St")).toBeInTheDocument();
    expect(screen.getByText("2 of 5 destinations")).toBeInTheDocument();
  });

  it("keeps both pending removals when two destinations are deleted before undoing either", () => {
    saveWizardState({
      ...emptyWizardState(),
      cityId: "christchurch",
      analysisId: "remove-135",
      origin: { address: "123 Riccarton Rd", lat: -43.5, lng: 172.6 },
      destinations: [
        {
          label: "Destination 1",
          address: "15 Cashel St",
          lat: -43.53,
          lng: 172.63,
        },
        {
          label: "Destination 2",
          address: "88 Riccarton Rd",
          lat: -43.54,
          lng: 172.6,
        },
        {
          label: "Destination 3",
          address: "1 Colombo St",
          lat: -43.55,
          lng: 172.61,
        },
      ],
    });

    render(
      <WizardStateProvider>
        <Location />
      </WizardStateProvider>,
    );

    // Each click removes whatever is currently "Destination 1": first
    // 15 Cashel St, then 88 Riccarton Rd (shifted up into that slot).
    fireEvent.click(screen.getByLabelText("Delete Destination 1"));
    fireEvent.click(screen.getByLabelText("Delete Destination 1"));

    expect(screen.getAllByText("Destination removed")).toHaveLength(2);
    expect(screen.queryByText("15 Cashel St")).not.toBeInTheDocument();
    expect(screen.queryByText("88 Riccarton Rd")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Undo")[0]);

    expect(screen.getAllByText("Destination removed")).toHaveLength(1);
    expect(screen.getByText("15 Cashel St")).toBeInTheDocument();
    expect(screen.queryByText("88 Riccarton Rd")).not.toBeInTheDocument();
  });
});
