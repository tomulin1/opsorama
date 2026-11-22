import type { SceneNode, Vec3 } from './index';
import { collectProblems, throwOnErrors } from './scene-problems';
import { interiorChecks } from './validate-scene';

/**
 * A rectangle on the ground plane that a node declared indoor with `interior: true`.
 * Centre and half extents are world metres; `yaw` is the node's rotation around +y in radians.
 */
export interface InteriorArea { id: string; center: readonly [x: number, z: number]; halfSize: readonly [x: number, z: number]; yaw: number; }

/**
 * `interior` is allowed on ground and zone nodes (footprint = `size`) and on sized surface assets
 * with an explicit `footprint` (floor, terrain, sidewalk). Areas are top-level world rectangles,
 * because a node inside a container (`parentId`) is already indoor. Throws `SceneValidationError` otherwise.
 */
export function validateInterior(node: SceneNode): void {
  throwOnErrors(collectProblems(add => interiorChecks(node as unknown as Record<string, unknown>, '', add)));
}

/** The interior areas declared in a scene, in node order. Footprints include the node's x/z scale. */
export function interiorAreas(nodes: readonly SceneNode[]): InteriorArea[] {
  const areas: InteriorArea[] = [];
  for (const node of nodes) {
    if ((node.kind !== 'ground' && node.kind !== 'zone' && node.kind !== 'asset') || node.interior !== true) continue;
    const [width, depth] = node.kind === 'asset' ? node.footprint! : node.size, [x, , z] = node.position ?? [0, 0, 0];
    areas.push({ id: node.id, center: [x, z], halfSize: [width * (node.scale?.[0] ?? 1) / 2, depth * (node.scale?.[2] ?? 1) / 2], yaw: node.rotation?.[1] ?? 0 });
  }
  return areas;
}

/**
 * Whether a world point lies inside any interior area, edges included. Height is ignored, so the
 * rule covers objects at any level above the area. The renderer tests each node's pivot.
 */
export function isWithinInteriorArea(point: Vec3, areas: readonly InteriorArea[]): boolean {
  for (const area of areas) {
    const dx = point[0] - area.center[0], dz = point[2] - area.center[1], cos = Math.cos(area.yaw), sin = Math.sin(area.yaw);
    // Rotate into the area's local frame (inverse of a +y rotation by yaw).
    const localX = dx * cos - dz * sin, localZ = dx * sin + dz * cos;
    if (Math.abs(localX) <= area.halfSize[0] && Math.abs(localZ) <= area.halfSize[1]) return true;
  }
  return false;
}
