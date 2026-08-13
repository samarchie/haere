import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as geocode from "../data/geocode";
import { PinDropMap } from "./PinDropMap";

const { mapInstances } = vi.hoisted(() => ({
  mapInstances: [] as Array<{ setStyle: (style: unknown) => void }>,
}));

vi.mock("maplibre-gl", () => {
  class FakeMap {
    private center: { lat: number; lng: number };
    flyTo = vi.fn((opts: { center: [number, number] }) => {
      this.center = { lng: opts.center[0], lat: opts.center[1] };
    });
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setStyle = vi.fn();
    constructor(options: { center: [number, number] }) {
      this.center = { lng: options.center[0], lat: options.center[1] };
      mapInstances.push(this);
    }
    getCenter() {
      return this.center;
    }
  }
  return { MapLibreMap: FakeMap };
});

function mostRecentMap() {
  return mapInstances[mapInstances.length - 1];
}

describe("PinDropMap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // biome-ignore lint/performance/noDelete: test cleanup of a property added only for this suite
    delete (navigator as unknown as { geolocation?: unknown }).geolocation;
  });

  it("renders nothing when closed", () => {
    render(
      <PinDropMap
        open={false}
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={null}
      />,
    );
    expect(screen.queryByLabelText("Pin address")).not.toBeInTheDocument();
  });

  it("resolves the map's current center via reverse geocoding on confirm", async () => {
    vi.spyOn(geocode, "reverseGeocode").mockResolvedValue("42 Test Street");
    const onResolve = vi.fn();

    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={onResolve}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "Start" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(geocode.reverseGeocode).toHaveBeenCalledWith(-43.5, 172.6);
    expect(onResolve).toHaveBeenCalledWith({
      lat: -43.5,
      lng: 172.6,
      label: "42 Test Street",
    });
  });

  it("does not let the user type into the address field", () => {
    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "Start" }}
      />,
    );

    const field = screen.getByLabelText("Pin address");
    expect(field).toHaveAttribute("readonly");
    // Out of tab order and its mousedown default (browser's click-to-focus)
    // is suppressed in the component, so a click can't drop a cursor in it
    // — jsdom doesn't emulate that default itself, so only the tabindex is
    // checked here.
    expect(field).toHaveAttribute("tabindex", "-1");
  });

  it("falls back to a coordinate label when reverse geocoding and the address field are both empty", async () => {
    vi.spyOn(geocode, "reverseGeocode").mockResolvedValue(null);
    const onResolve = vi.fn();

    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={onResolve}
        initialPoint={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(onResolve).toHaveBeenCalledWith({
      lat: -43.5321,
      lng: 172.6362,
      label: "-43.53210, 172.63620",
    });
  });

  it("re-centers the map when Locate me returns a position", async () => {
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: -43.6, longitude: 172.7 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    vi.spyOn(geocode, "reverseGeocode").mockResolvedValue("Located Street");
    const onResolve = vi.fn();

    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={onResolve}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "Start" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));

    await waitFor(() => expect(onResolve).toHaveBeenCalled());
    expect(geocode.reverseGeocode).toHaveBeenCalledWith(-43.6, 172.7);
  });

  it("shows a locating indicator while waiting for a position, and clears it on success", async () => {
    let resolvePosition: (position: {
      coords: GeolocationCoordinates;
    }) => void = () => {};
    const getCurrentPosition = vi.fn((success) => {
      resolvePosition = success;
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "Start" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /locate me/i }));
    expect(screen.getByText("Locating…")).toBeInTheDocument();

    await act(async () => {
      resolvePosition({
        coords: { latitude: -43.6, longitude: 172.7 } as GeolocationCoordinates,
      });
    });

    expect(screen.queryByText("Locating…")).not.toBeInTheDocument();
  });

  it("shows an error message when Locate me fails", async () => {
    const getCurrentPosition = vi.fn((_success, error) => {
      error({ code: 1, message: "denied" });
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /locate me/i }));

    expect(
      await screen.findByText(/couldn.t get your location/i),
    ).toBeInTheDocument();
  });

  it("resyncs the address field to the current point each time it reopens", () => {
    const { rerender } = render(
      <PinDropMap
        open={false}
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "First Street" }}
      />,
    );

    rerender(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "First Street" }}
      />,
    );
    expect(screen.getByLabelText("Pin address")).toHaveValue("First Street");

    rerender(
      <PinDropMap
        open={false}
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.6, lng: 172.7, label: "Second Street" }}
      />,
    );
    rerender(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.6, lng: 172.7, label: "Second Street" }}
      />,
    );

    expect(screen.getByLabelText("Pin address")).toHaveValue("Second Street");
  });

  it("switches the map style when a basemap button is clicked", () => {
    render(
      <PinDropMap
        open
        onClose={() => {}}
        onResolve={() => {}}
        initialPoint={{ lat: -43.5, lng: 172.6, label: "Start" }}
      />,
    );

    const satelliteButton = screen.getByRole("button", { name: "satellite" });
    fireEvent.click(satelliteButton);

    expect(mostRecentMap().setStyle).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.objectContaining({ esri: expect.anything() }),
      }),
    );
    expect(satelliteButton).toHaveClass("bg-kotare-blue");

    const brightButton = screen.getByRole("button", { name: "bright" });
    fireEvent.click(brightButton);

    expect(mostRecentMap().setStyle).toHaveBeenLastCalledWith(
      "https://tiles.openfreemap.org/styles/bright",
    );
    expect(brightButton).toHaveClass("bg-kotare-blue");
  });
});
