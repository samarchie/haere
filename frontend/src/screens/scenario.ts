import { el, mount } from "../dom";

export function renderScenario(root: HTMLElement): void {
  mount(root, el("p", {}, "Scenario picker screen"));
}
