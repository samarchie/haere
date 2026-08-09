import { Box3, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { projectToScreen } from "./projectToScreen";

describe("projectToScreen", () => {
  it("centers a box that sits directly on the camera's view axis", () => {
    const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const box = new Box3(
      new Vector3(-0.5, -0.5, -0.5),
      new Vector3(0.5, 0.5, 0.5),
    );

    const rect = projectToScreen(box, camera, 1000, 800);

    expect(rect.x + rect.width / 2).toBeCloseTo(500, 0);
    expect(rect.y + rect.height / 2).toBeCloseTo(400, 0);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it("moves off-center when the box is off-axis", () => {
    const camera = new PerspectiveCamera(50, 1000 / 800, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const box = new Box3(
      new Vector3(0.5, -0.1, -0.5),
      new Vector3(1.5, 0.1, 0.5),
    );

    const rect = projectToScreen(box, camera, 1000, 800);

    expect(rect.x + rect.width / 2).toBeGreaterThan(500);
  });
});
