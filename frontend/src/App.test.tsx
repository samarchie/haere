import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  it("renders the Landing screen at the root path", () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: /check your address/i }),
    ).toBeInTheDocument();
  });
});
