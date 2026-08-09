import {
  Box3,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Screen } from "../router";
import { anchorFor } from "./anchors";
import { type ScreenRect, projectToScreen } from "./projectToScreen";

const GLB_URL = "/bus_stop_new.glb";
const TWEEN_MS = 900;
const LOOK_AROUND_RADIANS = 0.35;

export class SceneManager {
  private renderer: WebGLRenderer;
  private camera: PerspectiveCamera;
  private scene = new Scene();
  private controls: OrbitControls;
  private nodes = new Map<string, Object3D>();
  private currentScreen: Screen | null = null;
  private overlayListeners = new Set<(rect: ScreenRect) => void>();
  private firstDragListeners = new Set<() => void>();
  private raf = 0;
  private loaded: Promise<void>;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.addEventListener("start", this.handleFirstDrag);

    this.loaded = this.load();
    window.addEventListener("resize", this.handleResize);
    this.raf = requestAnimationFrame(this.tick);
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(GLB_URL);
    this.scene.add(gltf.scene);
    gltf.scene.traverse((node) => this.nodes.set(node.name, node));
  }

  private handleFirstDrag = (): void => {
    for (const listener of this.firstDragListeners) listener();
  };

  private handleResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.notifyOverlayForCurrentScreen();
  };

  private tick = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };

  async goToAnchor(screen: Screen): Promise<void> {
    await this.loaded;
    if (this.currentScreen === screen) {
      return;
    }
    this.currentScreen = screen;

    const config = anchorFor(screen);
    const camNode = this.nodes.get(config.camNode);
    const anchorNode = this.nodes.get(config.anchorNode);
    if (!camNode || !anchorNode) {
      console.warn(`scene: missing node for screen "${screen}"`);
      return;
    }

    await this.tweenCameraTo(
      camNode.position.clone(),
      anchorNode.position.clone(),
    );

    const resting = camNode.position.clone().sub(anchorNode.position);
    const restingAzimuth = Math.atan2(resting.x, resting.z);
    const restingPolar = Math.acos(resting.y / resting.length());
    this.controls.minAzimuthAngle = restingAzimuth - LOOK_AROUND_RADIANS;
    this.controls.maxAzimuthAngle = restingAzimuth + LOOK_AROUND_RADIANS;
    this.controls.minPolarAngle = restingPolar - LOOK_AROUND_RADIANS;
    this.controls.maxPolarAngle = restingPolar + LOOK_AROUND_RADIANS;

    this.notifyOverlayForCurrentScreen();
  }

  private notifyOverlayForCurrentScreen(): void {
    if (!this.currentScreen) {
      return;
    }
    const config = anchorFor(this.currentScreen);
    const target = this.nodes.get(config.targetMesh);
    if (!target) {
      return;
    }
    const bounds = new Box3().setFromObject(target);

    // Guard against projecting a target that sits fully or partially behind
    // the camera: Vector3.project(camera) divides by clip-space w, which goes
    // negative behind the camera plane and yields a plausible-looking but
    // meaningless rect instead of an error. The camera always looks at the
    // anchor target in this design, so it's sufficient to check the bounding
    // box's center: in three.js view space, "in front of the camera" is
    // negative Z (right-handed camera space looking down -Z).
    this.camera.updateMatrixWorld();
    const viewSpaceCenter = bounds
      .getCenter(new Vector3())
      .applyMatrix4(this.camera.matrixWorldInverse);
    if (viewSpaceCenter.z >= 0) {
      console.warn(
        `scene: target mesh for screen "${this.currentScreen}" is behind the camera; skipping overlay update`,
      );
      return;
    }

    const rect = projectToScreen(
      bounds,
      this.camera,
      window.innerWidth,
      window.innerHeight,
    );
    for (const listener of this.overlayListeners) listener(rect);
  }

  private tweenCameraTo(
    position: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
  ): Promise<void> {
    return new Promise((resolve) => {
      const startPos = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const startTime = performance.now();

      const step = (): void => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / TWEEN_MS);
        const eased = 1 - (1 - t) ** 3;

        this.camera.position.set(
          startPos.x + (position.x - startPos.x) * eased,
          startPos.y + (position.y - startPos.y) * eased,
          startPos.z + (position.z - startPos.z) * eased,
        );
        this.controls.target.set(
          startTarget.x + (target.x - startTarget.x) * eased,
          startTarget.y + (target.y - startTarget.y) * eased,
          startTarget.z + (target.z - startTarget.z) * eased,
        );
        this.camera.lookAt(this.controls.target);

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };

      step();
    });
  }

  onOverlayInvalidate(cb: (rect: ScreenRect) => void): () => void {
    this.overlayListeners.add(cb);
    return () => this.overlayListeners.delete(cb);
  }

  onFirstDrag(cb: () => void): () => void {
    this.firstDragListeners.add(cb);
    return () => this.firstDragListeners.delete(cb);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.handleResize);
    this.controls.removeEventListener("start", this.handleFirstDrag);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
