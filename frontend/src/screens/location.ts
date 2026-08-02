import { el, mount } from "../dom";

export function renderLocation(root: HTMLElement): void {
  mount(root, el("p", {}, "Location entry screen"));
}
