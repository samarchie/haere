import { beforeEach, describe, expect, it, vi } from "vitest";
import { startApp } from "./app";

describe("startApp", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders the screen matching the current path on start", () => {
    const root = document.createElement("div");
    const renderers = {
      landing: vi.fn(),
      picker: vi.fn(),
      location: vi.fn(),
      scenario: vi.fn(),
      results: vi.fn(),
    };

    startApp(root, renderers);

    expect(renderers.landing).toHaveBeenCalledWith(root);
    expect(renderers.picker).not.toHaveBeenCalled();
  });

  it("re-renders the matching screen on navigation", () => {
    const root = document.createElement("div");
    const renderers = {
      landing: vi.fn(),
      picker: vi.fn(),
      location: vi.fn(),
      scenario: vi.fn(),
      results: vi.fn(),
    };

    startApp(root, renderers);
    window.history.pushState(null, "", "/picker");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(renderers.picker).toHaveBeenCalledWith(root);
  });

  it("stops re-rendering after the returned unsubscribe is called", () => {
    const root = document.createElement("div");
    const renderers = {
      landing: vi.fn(),
      picker: vi.fn(),
      location: vi.fn(),
      scenario: vi.fn(),
      results: vi.fn(),
    };

    const stop = startApp(root, renderers);
    stop();
    window.history.pushState(null, "", "/scenario");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(renderers.scenario).not.toHaveBeenCalled();
  });
});
