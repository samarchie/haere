import { el, mount } from "../dom";

export function renderLanding(root: HTMLElement): void {
  mount(root, el("p", {}, "Landing screen"));
}
