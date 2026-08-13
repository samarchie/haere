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
    on = vi.fn();
    once = vi.fn();
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
        value=""
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
        value="123 Riccar"
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

    expect(onSearchSettled).toHaveBeenCalledWith("found");
    fireEvent.click(screen.getByText("123 Riccarton Road, Christchurch"));
    expect(onResolve).toHaveBeenCalledWith({
      lat: -43.53,
      lng: 172.62,
      label: "123 Riccarton Road, Christchurch",
    });
  });

  it("reports settled('empty') when no suggestions come back", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([]);
    const onSearchSettled = vi.fn();

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="88 Selwyn"
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

    expect(onSearchSettled).toHaveBeenCalledWith("empty");
  });

  it("reports settled('unavailable') when the search itself fails", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockRejectedValue(
      new Error("network down"),
    );
    const onSearchSettled = vi.fn();

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="88 Selwyn"
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

    expect(onSearchSettled).toHaveBeenCalledWith("unavailable");
  });

  it("cancels a pending search when a suggestion is picked, so it can't reopen the dropdown afterward", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);
    const onResolve = vi.fn();

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="123 Riccar"
        point={null}
        onChange={() => {}}
        onResolve={onResolve}
        onSearchSettled={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(geocode.fetchSuggestions).toHaveBeenCalledTimes(1);

    // One more keystroke schedules a fresh debounced search...
    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton R" },
    });
    // ...but the user picks a suggestion before that timer fires.
    fireEvent.click(screen.getByText("123 Riccarton Road, Christchurch"));
    expect(onResolve).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(geocode.fetchSuggestions).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("123 Riccarton Road, Christchurch"),
    ).not.toBeInTheDocument();
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

  it("closes the dropdown when clicking outside", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);

    render(
      <div>
        <AddressAutocomplete
          id="field-1"
          label="Home address"
          value="123 Riccar"
          point={null}
          onChange={() => {}}
          onResolve={() => {}}
          onSearchSettled={() => {}}
        />
        <button type="button">Elsewhere</button>
      </div>,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(
      screen.getByText("123 Riccarton Road, Christchurch"),
    ).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText("Elsewhere"));

    expect(
      screen.queryByText("123 Riccarton Road, Christchurch"),
    ).not.toBeInTheDocument();
  });

  it("closes the dropdown on Escape", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="123 Riccar"
        point={null}
        onChange={() => {}}
        onResolve={() => {}}
        onSearchSettled={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(
      screen.getByText("123 Riccarton Road, Christchurch"),
    ).toBeInTheDocument();

    fireEvent.keyDown(screen.getByLabelText("Home address"), {
      key: "Escape",
    });

    expect(
      screen.queryByText("123 Riccarton Road, Christchurch"),
    ).not.toBeInTheDocument();
  });

  it("Escape cancels the pending search so it can't reopen the dropdown once it resolves", async () => {
    vi.spyOn(geocode, "fetchSuggestions").mockResolvedValue([
      { lat: -43.53, lng: 172.62, label: "123 Riccarton Road, Christchurch" },
    ]);

    render(
      <AddressAutocomplete
        id="field-1"
        label="Home address"
        value="123 Riccar"
        point={null}
        onChange={() => {}}
        onResolve={() => {}}
        onSearchSettled={() => {}}
      />,
    );

    // Type, then dismiss with Escape before the 400ms debounce fires.
    fireEvent.change(screen.getByLabelText("Home address"), {
      target: { value: "123 Riccarton" },
    });
    fireEvent.keyDown(screen.getByLabelText("Home address"), {
      key: "Escape",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(geocode.fetchSuggestions).not.toHaveBeenCalled();
    expect(
      screen.queryByText("123 Riccarton Road, Christchurch"),
    ).not.toBeInTheDocument();
  });
});
