import type { AssetNode, Vec3 } from './index';

/**
 * Where a carried item is. Items are visual nodes the host owns (a parcel, a
 * tote, a pallet); the behavior runner only tracks who holds them or what they
 * rest on, and never decides what an item means.
 */
export type ItemPlacement =
  /** Held by an agent at the named anchor of its model; `offset` stacks several items. `yaw` is a local heading in radians, default 0. */
  | { holder: string; anchor: string; offset: Vec3; yaw?: number }
  /** Resting on an object: at its named anchor, or at its origin, plus a local `offset`. `yaw` is a local heading in radians, default 0. */
  | { node: string; anchor?: string; offset: Vec3; yaw?: number }
  /** Resting in the world. */
  | { position: Vec3; yaw: number };

/** A resting place the host or a step supplies; offsets default to zero. */
export type ItemRest = { node: string; anchor?: string; offset?: Vec3 } | { position: Vec3; yaw?: number };

/** How an agent carries items. */
export interface CarryRule {
  /** Named anchor on the agent's model where items attach, e.g. `carry` on a worker or `load` on a pallet jack. */
  anchor: string;
  /** Items carried at once. Default 1. With handling state, the receptacle's capacity applies as well. */
  capacity?: number;
  /** Vertical spacing of stacked items in metres, for carried items and items put on the same spot. Default 0.4. Unused with handling state, where real unit heights apply. */
  stackHeight?: number;
  /** Pose while travelling with at least one item, e.g. `holding` for a worker. Default: the agent's travel pose. */
  travelPose?: string;
  /** Pose while standing with at least one item. Default: the agent's idle pose. */
  idlePose?: string;
  /**
   * Seconds (0–5) before an interaction ends at which items change hands, at
   * most the whole interaction. Give item nodes a `transfer` of the same length
   * so the hand-over animation finishes as the agent leaves. Default 0: items
   * change hands when the interaction ends.
   */
  handOverSeconds?: number;
  /**
   * Horizontal metres within which a pick-up by item ID may take an item resting
   * in the world, measured from the slot position. Items resting on another
   * object are out of reach; the object being used is always within reach.
   * Pick-ups by count only take items on that object. Default: no distance check.
   */
  reach?: number;
  /**
   * Quarter turn in degrees of a unit held at the anchor, with handling state.
   * Use 90 for a pallet whose fork pockets open on its short side, so its long
   * side lies along the forks. Default: as declared, or 90 when only that fits.
   * Ignored without handling state.
   */
  turn?: 0 | 90;
}

export const DEFAULT_STACK_HEIGHT = .4;
export const MAX_HAND_OVER_SECONDS = 5;
export const MAX_CARRY_CAPACITY = 64;

const finite = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const name = (value: unknown) => typeof value === 'string' && value.trim().length > 0;

export function validateCarryRule(rule: CarryRule, label = 'Carry rule'): void {
  if (!rule || typeof rule !== 'object') throw new Error(`${label} must be an object.`);
  if (!name(rule.anchor)) throw new Error(`${label} requires an anchor name.`);
  if (rule.capacity !== undefined && !(Number.isSafeInteger(rule.capacity) && rule.capacity >= 1 && rule.capacity <= MAX_CARRY_CAPACITY)) throw new Error(`${label} capacity must be an integer from 1 to ${MAX_CARRY_CAPACITY}.`);
  if (rule.stackHeight !== undefined && !(Number.isFinite(rule.stackHeight) && rule.stackHeight >= 0)) throw new Error(`${label} stack height must be finite and not negative.`);
  for (const pose of [rule.travelPose, rule.idlePose]) if (pose !== undefined && !name(pose)) throw new Error(`${label} poses must not be empty.`);
  if (rule.handOverSeconds !== undefined && !(Number.isFinite(rule.handOverSeconds) && rule.handOverSeconds >= 0 && rule.handOverSeconds <= MAX_HAND_OVER_SECONDS)) throw new Error(`${label} hand-over seconds must be from 0 to ${MAX_HAND_OVER_SECONDS}.`);
  if (rule.reach !== undefined && !(Number.isFinite(rule.reach) && rule.reach > 0)) throw new Error(`${label} reach must be a positive number of metres.`);
  if (rule.turn !== undefined && rule.turn !== 0 && rule.turn !== 90) throw new Error(`${label} turn must be 0 or 90 degrees.`);
}

export function validateItemRest(rest: ItemRest, label = 'Item placement'): void {
  if (!rest || typeof rest !== 'object') throw new Error(`${label} must be an object.`);
  if ('node' in rest) {
    if (!name(rest.node)) throw new Error(`${label} requires a node ID.`);
    if (rest.anchor !== undefined && !name(rest.anchor)) throw new Error(`${label} anchor must not be empty.`);
    if (rest.offset !== undefined && !finite(rest.offset)) throw new Error(`${label} offset must be a finite [x, y, z] value.`);
  } else {
    if (!finite(rest.position)) throw new Error(`${label} requires a finite position.`);
    if (rest.yaw !== undefined && !Number.isFinite(rest.yaw)) throw new Error(`${label} heading must be finite.`);
  }
}

/**
 * Map an item placement onto an asset node: an attachment to the holder's or
 * object's anchor with a local offset, or a world position. `base` carries the
 * item's model (e.g. `{ asset: 'parcel', scale: [.4, .4, .4] }`).
 */
export function itemNode(id: string, placement: ItemPlacement, base: Omit<AssetNode, 'kind' | 'id' | 'position' | 'rotation' | 'attachment' | 'route'>): AssetNode {
  const turned = (yaw: number | undefined) => yaw ? { rotation: [0, yaw, 0] as Vec3 } : {};
  if ('holder' in placement) return { ...base, id, kind: 'asset', attachment: { nodeId: placement.holder, anchor: placement.anchor }, position: placement.offset, ...turned(placement.yaw) };
  if ('node' in placement) return { ...base, id, kind: 'asset', attachment: { nodeId: placement.node, ...(placement.anchor ? { anchor: placement.anchor } : {}) }, position: placement.offset, ...turned(placement.yaw) };
  return { ...base, id, kind: 'asset', position: placement.position, rotation: [0, placement.yaw, 0] };
}
