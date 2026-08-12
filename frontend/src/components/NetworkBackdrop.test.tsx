import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkBackdrop } from "./NetworkBackdrop";

describe("NetworkBackdrop", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders an svg with a path per route and no throw", () => {
    const { container } = render(<NetworkBackdrop />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("omits animateMotion elements when the user prefers reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    const { container } = render(<NetworkBackdrop />);
    expect(container.querySelectorAll("animateMotion").length).toBe(0);
  });
});
