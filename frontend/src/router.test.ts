import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentScreen,
  currentSearch,
  navigate,
  onNavigate,
  replaceScreen,
  useScreen,
} from "./router";

describe("router", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("resolves the landing screen at /", () => {
    window.history.replaceState(null, "", "/");
    expect(currentScreen()).toBe("landing");
  });

  it("resolves each known path", () => {
    const cases: Array<[string, string]> = [
      ["/proposal", "proposal"],
      ["/location", "location"],
      ["/results", "results"],
    ];
    for (const [path, screen] of cases) {
      window.history.replaceState(null, "", path);
      expect(currentScreen()).toBe(screen);
    }
  });

  it("falls back to landing for an unknown path", () => {
    window.history.replaceState(null, "", "/nonsense");
    expect(currentScreen()).toBe("landing");
  });

  it("navigate pushes a new history entry with the given search string", () => {
    navigate("results", "?r=abc123");
    expect(window.location.pathname).toBe("/results");
    expect(window.location.search).toBe("?r=abc123");
  });

  it("navigate triggers onNavigate subscribers without a manual popstate dispatch", () => {
    const handler = vi.fn();
    const unsubscribe = onNavigate(handler);

    navigate("proposal");

    expect(handler).toHaveBeenCalledWith("proposal");
    unsubscribe();
  });

  it("onNavigate fires its handler on popstate, and unsubscribe stops it", () => {
    const handler = vi.fn();
    const unsubscribe = onNavigate(handler);

    window.history.pushState(null, "", "/location");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(handler).toHaveBeenCalledWith("location");

    unsubscribe();
    window.history.pushState(null, "", "/location");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replaceScreen replaces the current history entry with the given path and search", () => {
    navigate("proposal");
    replaceScreen("results", "?r=abc123");
    expect(window.location.pathname).toBe("/results");
    expect(window.location.search).toBe("?r=abc123");
  });

  it("currentSearch reflects the current query string", () => {
    window.history.replaceState(null, "", "/proposal?city=canterbury");
    const params = currentSearch();
    expect(params.get("city")).toBe("canterbury");
  });
});

describe("useScreen", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("reflects the current screen and updates on navigate", () => {
    const { result } = renderHook(() => useScreen());
    expect(result.current).toBe("landing");
    act(() => navigate("proposal"));
    expect(result.current).toBe("proposal");
  });
});
