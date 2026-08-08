import { afterEach, describe, expect, it, vi } from "vitest";
import { hasWebGL2, prefersReducedMotion, supportsScene } from "./webglSupport";

describe("hasWebGL2", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is false when getContext returns null", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(hasWebGL2()).toBe(false);
  });

  it("is true when getContext returns a context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGL2RenderingContext,
    );
    expect(hasWebGL2()).toBe(true);
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when the media query matches", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when the media query does not match", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("supportsScene", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is false without WebGL2 even when motion is fine", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    expect(supportsScene()).toBe(false);
  });

  it("is false when reduced motion is preferred even with WebGL2", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGL2RenderingContext,
    );
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(supportsScene()).toBe(false);
  });

  it("is true with WebGL2 and no reduced-motion preference", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as WebGL2RenderingContext,
    );
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    expect(supportsScene()).toBe(true);
  });
});
