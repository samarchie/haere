import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as geocode from "../data/geocode";
import { PinDropMap } from "./PinDropMap";

vi.mock("maplibre-gl", () => {
  class FakeMap {
    private center: { lat: number; lng: number };
    flyTo = vi.fn((opts: { center: [number, number] }) => {
      this.center = { lng: opts.center[0], lat: opts.center[1] };
    });
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    constructor(options: { center: [number, number] }) {
      this.center = { lng: options.center[0], lat: options.center[1] };
    }
    getCenter() {
      return this.center;
    }
  }
  return { MapLibreMap: FakeMap };
});

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
});
