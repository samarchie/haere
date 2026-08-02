import { type Screen, currentScreen, onNavigate } from "./router";
import { renderLanding } from "./screens/landing";
import { renderLocation } from "./screens/location";
import { renderPicker } from "./screens/picker";
import { renderResults } from "./screens/results";
import { renderScenario } from "./screens/scenario";

export type ScreenRenderer = (root: HTMLElement) => void;

export const DEFAULT_RENDERERS: Record<Screen, ScreenRenderer> = {
  landing: renderLanding,
  picker: renderPicker,
  location: renderLocation,
  scenario: renderScenario,
  results: renderResults,
};

export function startApp(
  root: HTMLElement,
  renderers: Record<Screen, ScreenRenderer> = DEFAULT_RENDERERS,
): () => void {
  const render = () => {
    renderers[currentScreen()](root);
  };
  const unsubscribe = onNavigate(render);
  render();
  return unsubscribe;
}
