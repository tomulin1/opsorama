import type { NodeTransfer } from './attachment';
import type { NodeController } from './controller';
import type { AssetNode, SceneNode, Vec3 } from './index';
import type { NodeBase } from './node-base';
import type { NodeRoute } from './route';

/*
 * Primitive and group nodes: shapes and lines drawn by the renderer without an asset registry, and groups that hold other
 * nodes. JSDoc tags such as @minimum and @maximum are copied into the scene JSON Schema (pnpm schema:generate) and must
 * state the same limits as the checks in validate-scene.ts.
 */

/**
 * Metres, greater than 0.
 * @exclusiveMinimum 0
 */
type PositiveMetres = number;
/**
 * Metres, 0 or more.
 * @minimum 0
 */
type Metres = number;

/**
 * Motion of the node's root transform, shared by asset, shape and group nodes. `route` and `controller` exclude each
 * other; an attached node owns neither (it moves with its carrier).
 */
export interface MotionFields {
  /** Visual route that owns the root transform while present. */
  route?: NodeRoute;
  /** Per-frame controller that owns the root position and heading; exclusive with `route`. */
  controller?: NodeController;
  /** Animate a change of `attachment` or `parentId` from the previous world pose, e.g. an item handed over; see `NodeTransfer`. */
  transfer?: NodeTransfer;
}
/** Node kinds that accept `MotionFields`. */
export const MOTION_NODE_KINDS = Object.freeze(['asset', 'shape', 'group'] as const);
/** A node that may own a route, a controller or a transfer. */
export type MotionNode = AssetNode | ShapeNode | GroupNode;
/** Whether `node` is an asset, shape or group node, the kinds that accept `MotionFields`. */
export function isMotionNode(node: SceneNode): node is MotionNode {
  return node.kind === 'asset' || node.kind === 'shape' || node.kind === 'group';
}
/** Node kinds a `parentId` may name: assets (whose `view` shows or hides children) and groups (always open). */
export const CONTAINER_NODE_KINDS = Object.freeze(['asset', 'group'] as const);

/**
 * A container without geometry: its children (nodes whose `parentId` names it) use its local coordinates, so moving,
 * turning or scaling the group moves them together. A group is always open: its children show while the group shows.
 * Selection bubbles through groups: a click on a node that is not selectable selects its nearest selectable group
 * ancestor. A group does not make its children indoor (shadows); only asset containers do. Its label sits at its origin.
 */
export interface GroupNode extends NodeBase, MotionFields {
  kind: 'group';
}

/** A box standing on the node origin: `size` is width (x), height (y) and depth (z) in metres. */
export interface BoxShape {
  type: 'box';
  /** Width (x), height (y) and depth (z) in metres, each greater than 0. */
  size: readonly [width: PositiveMetres, height: PositiveMetres, depth: PositiveMetres];
}
/** A sphere resting on the node origin: its centre is `radius` above it. */
export interface SphereShape {
  type: 'sphere';
  /** Radius in metres, greater than 0. */
  radius: PositiveMetres;
}
/** A cylinder, cone or frustum standing on the node origin along +y. One radius may be 0 (a cone), not both. */
export interface CylinderShape {
  type: 'cylinder';
  /** Radius of the top face in metres, 0 or more. */
  radiusTop: Metres;
  /** Radius of the bottom face in metres, 0 or more. */
  radiusBottom: Metres;
  /** Height in metres, greater than 0. */
  height: PositiveMetres;
}
/** Geometry of a shape node; `type` selects its fields. */
export type ShapeGeometry = BoxShape | SphereShape | CylinderShape;
/** The geometry types of a shape node. */
export const SHAPE_TYPES = Object.freeze(['box', 'sphere', 'cylinder'] as const);

/**
 * A box, sphere or cylinder with a plain material, for charts, markers of your own and simple models. The shape stands
 * on its origin (its bottom centre is `position`), so a bar of height h at y = 0 rises from the ground. Equal geometry
 * types and proportions share one unit geometry scaled per node, so many shapes draw as one instanced batch. Without
 * `color` the shape shows the scene palette: its `state` color for `busy`, `warning`, `critical` and `inactive`, the
 * `accent` role otherwise. `opacity` below 1 makes it transparent: it casts no shadow and is never instanced.
 */
export interface ShapeNode extends NodeBase, MotionFields {
  kind: 'shape';
  /** The geometry: `{ type: 'box', size }`, `{ type: 'sphere', radius }` or `{ type: 'cylinder', radiusTop, radiusBottom, height }`. */
  shape: ShapeGeometry;
  /** Surface color, a CSS color. Default: the palette color described on `ShapeNode`. */
  color?: string;
  /**
   * Opacity from 0 (invisible, still pickable) to 1 (opaque, default).
   * @minimum 0
   * @maximum 1
   */
  opacity?: number;
}

/** Widest `LineNode.width`, in metres. Wider strokes are shapes. */
export const MAX_LINE_WIDTH = 5;
/**
 * A polyline through `points` in the node's local coordinates (`position`, `rotation` and `scale` apply; with `parentId`,
 * the container's). With `width` greater than 0 it is a solid tube of that diameter, lit like a shape, and pointer
 * events and selection hit it; with `width` 0 (default) it is a 1-pixel line that the pointer passes through. Without
 * `color` it uses the palette's `structure` role. Its label sits 0.3 m above its origin.
 */
export interface LineNode extends NodeBase {
  kind: 'line';
  /**
   * Points in metres in the node's local coordinates, at least two.
   * @minItems 2
   */
  points: readonly Vec3[];
  /** Line color, a CSS color. Default: the palette `structure` role. */
  color?: string;
  /**
   * Tube diameter in metres from 0 to 5; 0 (default) draws a 1-pixel line.
   * @minimum 0
   * @maximum 5
   */
  width?: number;
  /** Draw dashes instead of a continuous line. Default false. */
  dashed?: boolean;
}
