import type { SceneNode, Vec3 } from './index';

/** Where `placeSceneNodes` puts a finished scene inside a larger one. */
export interface ScenePlacement {
  /** Prepended to every node ID and every reference to one, so scenes with equal IDs can share a store. Must not be empty. */
  idPrefix: string;
  /** World translation in metres. Every value must be finite. */
  offset: Vec3;
}

const moved = (point: Vec3, offset: Vec3): Vec3 => [point[0] + offset[0], point[1] + offset[1], point[2] + offset[2]];

/**
 * Translates a finished scene into a larger one without changing the code that builds it, e.g. to
 * compose several sites on one ground. Returns new nodes in the same order and leaves the input untouched.
 *
 * - Node IDs, `parentId` and `attachment.nodeId` get `idPrefix`, so references stay intact.
 * - Top-level nodes move by `offset`: `position` and route `points`. Path `points` are relative to
 *   `position`, so they stay. A node with a `parentId` or an `attachment` keeps its local transform
 *   and moves with its parent.
 * - `entityId` stays: it names a host record, not a scene node.
 *
 * Limits: translation only, because rotating a scene would also have to rotate its cutaways and
 * facing rules. `controller.options` are opaque to core, so a controller that keeps world
 * coordinates there must get placed values from the host. Node IDs in host records, navigation
 * graphs and selections are not rewritten; hosts apply the prefix themselves where they keep them.
 */
export function placeSceneNodes(nodes: readonly SceneNode[], { idPrefix, offset }: ScenePlacement): SceneNode[] {
  if (!idPrefix) throw new Error('placeSceneNodes needs a non-empty idPrefix, or the placed IDs can collide with the host scene.');
  if (offset.length !== 3 || offset.some(value => !Number.isFinite(value))) throw new Error('placeSceneNodes needs an offset of three finite metres: [x, y, z].');
  return nodes.map(node => {
    const placed = { ...node, id: `${idPrefix}${node.id}`, ...(node.parentId === undefined ? {} : { parentId: `${idPrefix}${node.parentId}` }), ...(node.attachment ? { attachment: { ...node.attachment, nodeId: `${idPrefix}${node.attachment.nodeId}` } } : {}) };
    if (node.parentId !== undefined || node.attachment) return placed;
    const position = moved(placed.position ?? [0, 0, 0], offset);
    if (placed.kind !== 'asset' || !placed.route) return { ...placed, position };
    return { ...placed, position, route: { ...placed.route, points: placed.route.points.map(point => moved(point, offset)) } };
  });
}
