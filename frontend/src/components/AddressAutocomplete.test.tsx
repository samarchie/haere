import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as geocode from "../data/geocode";
import { AddressAutocomplete } from "./AddressAutocomplete";

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

describe("AddressAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not search below 3 characters", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([]);
    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="ri"
        point={null}
        onChange={() => {}}
        onResolve={() => {}}
        onSearchSettled={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "ri" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(geocode.fetchSuggestions).not.toHaveBeenCalled();
  });

  it("shows suggestions after the debounce and resolves the clicked one", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);
    const onResolve = vi.fn();
    const onSearchSettled = vi.fn();

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="123 Riccarton"
        point={null}
        onChange={() => {}}
        onResolve={onResolve}
        onSearchSettled={onSearchSettled}
      />,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onSearchSettled).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText("123 Riccarton Road, Christchurch"));
    expect(onResolve).toHaveBeenCalledWith({
      lat: -43.53,
      lng: 172.62,
      label: "123 Riccarton Road, Christchurch",
    });
  });

  it("reports settled(false) when no suggestions come back", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([]);
    const onSearchSettled = vi.fn();

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="88 Selwyn Street"
        point={null}
        onChange={() => {}}
        onResolve={() => {}}
        onSearchSettled={onSearchSettled}
      />,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "88 Selwyn Street" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onSearchSettled).toHaveBeenCalledWith(false);
  });

  it("opens the pin-drop map from its button", async () => {
    vi.useRealTimers();
    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value=""
        point={null}
        onChange={() => {}}
        onResolve={() => {}}
        onSearchSettled={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Drop pin on map"));

    await waitFor(() =>
      expect(screen.getByLabelText("Pin address")).toBeInTheDocument(),
    );
  });
});
