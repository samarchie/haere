import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as analysisCatalogue from "./data/analysisCatalogue";

describe("App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.spyOn(analysisCatalogue, "fetchAnalyses").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the Landing screen at the root path", async () => {
    render(<App />);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByLabelText(/home address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check/i })).toBeInTheDocument();
  });
});
