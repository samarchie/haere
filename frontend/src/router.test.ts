import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentScreen, currentSearch, navigate, onNavigate } from "./router";

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
      ["/picker", "picker"],
      ["/location", "location"],
      ["/scenario", "scenario"],
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

  it("onNavigate fires its handler on popstate, and unsubscribe stops it", () => {
    const handler = vi.fn();
    const unsubscribe = onNavigate(handler);

    window.history.pushState(null, "", "/location");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(handler).toHaveBeenCalledWith("location");

    unsubscribe();
    window.history.pushState(null, "", "/scenario");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("currentSearch reflects the current query string", () => {
    window.history.replaceState(null, "", "/picker?city=canterbury");
    const params = currentSearch();
    expect(params.get("city")).toBe("canterbury");
  });
});
