import { el } from "../dom";

const SEEN_KEY = "haere:seenDragHint";

export function hasSeenDragHint(): boolean {
  return localStorage.getItem(SEEN_KEY) === "1";
}

export function markDragHintSeen(): void {
  localStorage.setItem(SEEN_KEY, "1");
}

export function createDragHintElement(onDismiss: () => void): HTMLElement {
  return el(
    "div",
    { class: "drag-hint" },
    el("span", { class: "drag-hint__icon", "aria-hidden": "true" }, "↔"),
    el("span", {}, "Drag to look around"),
    el(
      "button",
      {
        class: "drag-hint__dismiss btn-reset",
        "aria-label": "Dismiss hint",
        onclick: onDismiss,
      },
      "✕",
    ),
  );
}
