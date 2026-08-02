import { describe, expect, it, vi } from "vitest";
import { renderChip } from "./chip";

describe("renderChip", () => {
  it("renders unselected without the selected class", () => {
    const node = renderChip("All cities", false, vi.fn());
    expect(node.className).toBe("chip");
  });

  it("renders selected with the selected class", () => {
    const node = renderChip("All cities", true, vi.fn());
    expect(node.className).toBe("chip selected");
  });

  it("invokes onClick when clicked", () => {
    const onClick = vi.fn();
    const node = renderChip("Weekday", false, onClick);
    node.dispatchEvent(new MouseEvent("click"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a type=button element", () => {
    const node = renderChip("Weekday", false, vi.fn());
    expect(node.getAttribute("type")).toBe("button");
  });

  it("renders disabled when options.disabled is true", () => {
    const node = renderChip("AM peak", false, vi.fn(), { disabled: true });
    expect(node.hasAttribute("disabled")).toBe(true);
  });

  it("does not render disabled by default", () => {
    const node = renderChip("AM peak", false, vi.fn());
    expect(node.hasAttribute("disabled")).toBe(false);
  });

  it("renders a title attribute when provided", () => {
    const node = renderChip("AM peak", false, vi.fn(), {
      title: "Not available",
    });
    expect(node.getAttribute("title")).toBe("Not available");
  });

  it("renders an empty title attribute when not provided", () => {
    const node = renderChip("AM peak", false, vi.fn());
    expect(node.getAttribute("title")).toBe("");
  });
});
