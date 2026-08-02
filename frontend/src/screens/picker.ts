import { el, mount } from "../dom";

export function renderPicker(root: HTMLElement): void {
  mount(root, el("p", {}, "Analysis picker screen"));
}
