import type { Box3, Camera } from "three";
import { Vector3 } from "three";

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function projectToScreen(
  box: Box3,
  camera: Camera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenRect {
  const corners = [
    new Vector3(box.min.x, box.min.y, box.min.z),
    new Vector3(box.max.x, box.min.y, box.min.z),
    new Vector3(box.min.x, box.max.y, box.min.z),
    new Vector3(box.max.x, box.max.y, box.min.z),
    new Vector3(box.min.x, box.min.y, box.max.z),
    new Vector3(box.max.x, box.min.y, box.max.z),
    new Vector3(box.min.x, box.max.y, box.max.z),
    new Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const corner of corners) {
    corner.project(camera);
    const screenX = ((corner.x + 1) / 2) * viewportWidth;
    const screenY = ((1 - corner.y) / 2) * viewportHeight;
    minX = Math.min(minX, screenX);
    maxX = Math.max(maxX, screenX);
    minY = Math.min(minY, screenY);
    maxY = Math.max(maxY, screenY);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
