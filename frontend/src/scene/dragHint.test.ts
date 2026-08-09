import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDragHintElement,
  hasSeenDragHint,
  markDragHintSeen,
} from "./dragHint";

describe("hasSeenDragHint / markDragHintSeen", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("is false before it's been marked seen", () => {
    expect(hasSeenDragHint()).toBe(false);
  });

  it("is true after marking it seen", () => {
    markDragHintSeen();
    expect(hasSeenDragHint()).toBe(true);
  });
});

describe("createDragHintElement", () => {
  it("calls onDismiss when the dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    const hint = createDragHintElement(onDismiss);
    const button = hint.querySelector<HTMLButtonElement>(".drag-hint__dismiss");
    button?.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the hint copy", () => {
    const hint = createDragHintElement(() => {});
    expect(hint.textContent).toContain("Drag to look around");
  });
});
