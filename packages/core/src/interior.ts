import type { SceneNode, Vec3 } from './index';

/**
 * A rectangle on the ground plane that a node declared indoor with `interior: true`.
 * Centre and half extents are world metres; `yaw` is the node's rotation around +y in radians.
 */
export interface InteriorArea { id: string; center: readonly [x: number, z: number]; halfSize: readonly [x: number, z: number]; yaw: number; }

/**
 * `interior` is allowed on ground and zone nodes (footprint = `size`) and on sized surface assets
 * with an explicit `footprint` (floor, terrain, sidewalk). Areas are top-level world rectangles,
 * because a node inside a building is already indoor.
 */
export function validateInterior(node: SceneNode): void {
  // Read untyped: scene data may come from JSON, and paths have no interior field at all.
  const interior = (node as { interior?: unknown }).interior;
  if (interior === undefined) return;
  if (typeof interior !== 'boolean') throw new Error(`interior on ${node.id} must be boolean.`);
  if (!interior) return;
  if (node.kind === 'path' || node.kind === 'marker') throw new Error(`${node.kind === 'path' ? 'Path' : 'Marker'} ${node.id} cannot be an interior area; mark a ground, zone or sized surface asset instead.`);
  if (node.kind === 'asset' && node.footprint === undefined) throw new Error(`Interior asset ${node.id} needs an explicit footprint; interior areas are only sized surfaces such as floor or terrain.`);
  if (node.parentId !== undefined) throw new Error(`Interior area ${node.id} must be a top-level node; nodes inside a building are already indoor.`);
}

/** The interior areas declared in a scene, in node order. Footprints include the node's x/z scale. */
export function interiorAreas(nodes: readonly SceneNode[]): InteriorArea[] {
  const areas: InteriorArea[] = [];
  for (const node of nodes) {
    if (node.kind === 'path' || node.kind === 'marker' || node.interior !== true) continue;
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
