import type { Attachment } from './attachment';
import type { Vec3, VisualState } from './index';

/*
 * JSDoc tags such as @minimum, @maximum, @minLength, @pattern and @asType on these types are copied into the scene JSON
 * Schema (pnpm schema:generate). They must state the same limits as the checks in validate-scene.ts.
 */

/** Fields every scene node kind shares. Internal to the package: each node interface extends it. */
export interface NodeBase {
  /**
   * Unique node ID within the scene. Used for updates, selection and references from `parentId` and `attachment.nodeId`.
   * @minLength 1
   * @pattern \S
   */
  id: string;
  /**
   * Containing asset or group: the node uses its local coordinates and shows only while that asset's `view` is not
   * `'closed'` (a group always shows its children). Any asset or group can be a parent; missing parents remain dormant.
   * Exclusive with `attachment`. See `validateParents`.
   * @minLength 1
   * @pattern \S
   */
  parentId?: string;
  /** Carries the node on another node, at its origin or a named anchor; the transform becomes local to it. Exclusive with `parentId`. */
  attachment?: Attachment;
  /** ID of the host record this node represents. A node with an `entityId` is selectable, and selections report it. */
  entityId?: string;
  /** Projected HTML label text, escaped safely. */
  label?: string;
  /** `always` (default) shows the label at all times; `active` only while the node is hovered or selected. */
  labelMode?: 'always' | 'active';
  /** Metres in world space, or in the container's local space with `parentId`. Default [0, 0, 0]. */
  position?: Vec3;
  /** Euler rotation in radians. Default [0, 0, 0]. */
  rotation?: Vec3;
  /** Per-axis scale factors. Default [1, 1, 1]. Never encode quantities with scale; use `count`. */
  scale?: Vec3;
  /** Host visual alert. Default `normal`. */
  state?: VisualState;
  /**
   * `true` makes the node selectable without an `entityId`; `false` keeps a node with an `entityId` out of selection by click or
   * label, for example a floor area whose records are shown elsewhere. The host can still select it with `store.select`.
   * Default: selectable when it has an `entityId`.
   */
  selectable?: boolean;
}
