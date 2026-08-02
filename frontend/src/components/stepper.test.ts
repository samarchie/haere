import { describe, expect, it, vi } from "vitest";
import { renderStepper } from "./stepper";

describe("renderStepper", () => {
  it("renders a step before the current one as a clickable link", () => {
    const onNavigate = vi.fn();
    const node = renderStepper("scenario", onNavigate);

    const link = node.querySelector("[data-step='location']");
    expect(link).not.toBeNull();
    expect(link?.classList.contains("stepper__link")).toBe(true);
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onNavigate).toHaveBeenCalledWith("location");
  });

  it("renders every step before the current one as clickable", () => {
    const onNavigate = vi.fn();
    const node = renderStepper("results", onNavigate);

    for (const screen of ["picker", "location", "scenario"]) {
      const link = node.querySelector(`[data-step='${screen}']`);
      expect(link?.classList.contains("stepper__link")).toBe(true);
    }
  });

  it("renders the current step as plain, non-interactive text", () => {
    const onNavigate = vi.fn();
    const node = renderStepper("location", onNavigate);

    const current = node.querySelector("[data-step='location']");
    expect(current?.tagName).toBe("SPAN");
    expect(current?.classList.contains("stepper__link")).toBe(false);
    expect(current?.classList.contains("stepper__future")).toBe(false);
    current?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders steps after the current one as dimmed, non-interactive text", () => {
    const onNavigate = vi.fn();
    const node = renderStepper("picker", onNavigate);

    for (const screen of ["location", "scenario", "results"]) {
      const future = node.querySelector(`[data-step='${screen}']`);
      expect(future?.tagName).toBe("SPAN");
      expect(future?.classList.contains("stepper__future")).toBe(true);
      future?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders step labels with visible whitespace separation between them", () => {
    const node = renderStepper("results");

    expect(node.textContent).toContain("① City/Analysis");
    expect(node.textContent).toContain("② Location");
    expect(node.textContent).toContain("③ Scenario");
    expect(node.textContent).toContain("④ Results");
    expect(node.textContent).not.toContain("Analysis②");
    expect(node.textContent).not.toContain("Location③");
    expect(node.textContent).not.toContain("Scenario④");
  });

  it("gives the current step a distinct class for visual highlighting", () => {
    const node = renderStepper("location");

    const current = node.querySelector("[data-step='location']");
    expect(current?.classList.contains("stepper__current")).toBe(true);
  });

  it("defaults onNavigate to the router's navigate when not provided", () => {
    window.history.replaceState(null, "", "/scenario");
    const node = renderStepper("results");

    const link = node.querySelector("[data-step='scenario']");
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(window.location.pathname).toBe("/scenario");
  });
});
