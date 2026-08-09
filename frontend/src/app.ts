import { type Screen, currentScreen, onNavigate } from "./router";
import {
  createDragHintElement,
  hasSeenDragHint,
  markDragHintSeen,
} from "./scene/dragHint";
// Type-only: erased at compile time, so this doesn't pull the ~600KB three.js
// bundle into every build. The runtime class is loaded lazily in createScene.
import type { SceneManager } from "./scene/sceneManager";
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

async function createScene(
  root: HTMLElement,
): Promise<{ scene: SceneManager; canvas: HTMLCanvasElement } | null> {
  if (!supportsScene()) {
    return null;
  }

  // Lazy dynamic import: three.js only ships to visitors whose browser can
  // actually run the scene. supportsScene() above has no three.js dependency,
  // so it stays a static import.
  const { SceneManager: SceneManagerImpl } = await import(
    "./scene/sceneManager"
  );

  const canvas = document.createElement("canvas");
  canvas.className = "scene-canvas";

  const scene = new SceneManagerImpl(canvas);

  // Don't insert the canvas or flip #app to fixed positioning until the
  // scene has actually produced a usable overlay rect. If the glb fails to
  // load (or the initial screen's anchor/target nodes are missing), this
  // callback never fires and #app stays in normal document flow exactly as
  // it does when supportsScene() is false - no black screen, no unpositioned
  // fixed overlay.
  let activated = false;
  scene.onOverlayInvalidate((rect) => {
    if (!activated) {
      activated = true;
      document.body.insertBefore(canvas, root);
      document.body.classList.add("scene-active");
    }
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

  return { scene, canvas };
}

export function startApp(
  root: HTMLElement,
  renderers: Record<Screen, ScreenRenderer> = DEFAULT_RENDERERS,
): () => void {
  let scene: SceneManager | null = null;
  let canvas: HTMLCanvasElement | null = null;

  const render = () => {
    const screen = currentScreen();
    renderers[screen](root);
    scene?.goToAnchor(screen).catch((error: unknown) => {
      console.warn("scene: failed to navigate to anchor", error);
    });
  };

  const unsubscribe = onNavigate(render);
  render();

  // Fire-and-forget: createScene must not be awaited here, since the
  // dynamic import means it can't resolve before this synchronous first
  // render() call above (which must still call renderers[screen](root)
  // synchronously, before the scene exists).
  createScene(root).then((created) => {
    if (!created) {
      return;
    }
    scene = created.scene;
    canvas = created.canvas;
    // Catch up to whatever screen is current by the time the scene is ready.
    scene.goToAnchor(currentScreen()).catch((error: unknown) => {
      console.warn("scene: failed to navigate to anchor", error);
    });
  });

  return () => {
    unsubscribe();
    scene?.dispose();
    canvas?.remove();
    document.body.classList.remove("scene-active");
    root.style.removeProperty("left");
    root.style.removeProperty("top");
    root.style.removeProperty("width");
    root.style.removeProperty("height");
  };
}
