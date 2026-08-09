import { type Screen, currentScreen, onNavigate } from "./router";
import {
  createDragHintElement,
  hasSeenDragHint,
  markDragHintSeen,
} from "./scene/dragHint";
import { SceneManager } from "./scene/sceneManager";
import { supportsScene } from "./scene/webglSupport";
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

function createScene(root: HTMLElement): SceneManager | null {
  if (!supportsScene()) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";
  document.body.insertBefore(canvas, root);
  document.body.classList.add("scene-active");

  const scene = new SceneManager(canvas);

  scene.onOverlayInvalidate((rect) => {
    root.style.left = `${rect.x}px`;
    root.style.top = `${rect.y}px`;
    root.style.width = `${rect.width}px`;
    root.style.height = `${rect.height}px`;
  });

  if (!hasSeenDragHint()) {
    const dismiss = () => {
      markDragHintSeen();
      hint.remove();
    };
    const hint = createDragHintElement(dismiss);
    document.body.append(hint);
    scene.onFirstDrag(dismiss);
  }

  return scene;
}

export function startApp(
  root: HTMLElement,
  renderers: Record<Screen, ScreenRenderer> = DEFAULT_RENDERERS,
): () => void {
  const scene = createScene(root);

  const render = () => {
    const screen = currentScreen();
    renderers[screen](root);
    scene?.goToAnchor(screen).catch((error: unknown) => {
      console.warn("scene: failed to navigate to anchor", error);
    });
  };

  const unsubscribe = onNavigate(render);
  render();

  return () => {
    unsubscribe();
    scene?.dispose();
  };
}
