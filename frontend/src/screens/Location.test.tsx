import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSummary } from "../data/analysisCatalogue";
import * as analysisCatalogue from "../data/analysisCatalogue";
import * as geocode from "../data/geocode";
import * as hexLookup from "../data/hexLookup";
import type { Manifest } from "../data/manifest";
import * as manifestData from "../data/manifest";
import { WizardStateProvider } from "../state/WizardStateContext";
import { emptyWizardState, saveWizardState } from "../state/wizardState";
import {
  Location,
  canAddDestination,
  canContinue,
  emptyFieldRow,
  fieldStatusText,
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
    title: "Test proposal",
    description: "",
    consultationUrl: null,
    consultationStatus: null,
    ...overrides,
  };
}

describe("emptyFieldRow", () => {
  it("starts idle with no point", () => {
    expect(emptyFieldRow()).toMatchObject({
      address: "",
      status: "idle",
      point: null,
      noResults: false,
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

  it("reroutes with reason=multi-match when a sibling analysis in the city matches", async () => {
    vi.spyOn(hexLookup, "resolveHexRowIndex")
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(0);
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      makeAnalysis({ analysisId: "remove-135" }),
      makeAnalysis({ analysisId: "add-route-99" }),
    ]);
    vi.spyOn(hexLookup, "fetchHexIds").mockResolvedValue(["c"]);
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue(baseManifest);

    const result = await resolveOriginRouting(
      point,
      "christchurch",
      "remove-135",
      baseManifest,
      ["a", "b"],
    );

    expect(result.type).toBe("reroute");
    expect((result as { type: "reroute"; search: string }).search).toContain(
      "reason=multi-match",
    );
  });

  it("reroutes with reason=outside-area when no analysis in the city matches", async () => {
    vi.spyOn(hexLookup, "resolveHexRowIndex").mockReturnValue(null);
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([
      makeAnalysis({ analysisId: "remove-135" }),
      makeAnalysis({ analysisId: "add-route-99" }),
    ]);
    vi.spyOn(hexLookup, "fetchHexIds").mockResolvedValue(["c"]);
    vi.spyOn(manifestData, "fetchManifest").mockResolvedValue(baseManifest);

    const result = await resolveOriginRouting(
      point,
      "christchurch",
      "remove-135",
      baseManifest,
      ["a", "b"],
    );

    expect(result.type).toBe("reroute");
    expect((result as { type: "reroute"; search: string }).search).toContain(
      "reason=outside-area",
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

    fireEvent.click(screen.getByText("View all proposals →"));
    expect(window.location.pathname).toBe("/proposal");
  });

  it("shows the no-study-area notice when resolving the origin fails to look up area data", async () => {
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
      screen.getByText("No study area covers this address yet"),
    ).toBeInTheDocument();
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
});
