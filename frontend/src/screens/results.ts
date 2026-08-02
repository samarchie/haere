import { el, mount } from "../dom";

export function renderResults(root: HTMLElement): void {
  mount(root, el("p", {}, "Results screen"));
}
