import type { AssetNode, Vec3 } from './index';
import type { NavPoint } from './navigation';

/**
 * A place where one agent interacts with an object, in the object's local
 * coordinates (metres, base-center pivot, Y-up, front +z). Routes end at the
 * approach point; the short approach → position leg belongs to the slot itself.
 * One slot holds one agent; several slots in a group model capacity.
 */
export interface InteractionSlot {
  /** Unique within the object, e.g. `seat-0` or `pick-1`. */
  name: string;
  /** Slots that serve the same purpose, e.g. `seat` or `pick`; behaviors can request any free slot of a group. */
  group?: string;
  /** Matching named anchor (`anchor-<name>` in the renderer), when the model has one. */
  anchor?: string;
  /** Floor point where routes arrive and leave; connect it to the movement graph. */
  approach: Vec3;
  /** Floor position of the agent's root while interacting (seat, pick face, desk front). */
  position: Vec3;
  /** Agent heading while interacting, in radians about Y; 0 faces +z. */
  yaw: number;
  /** Pose hint for the agent while interacting; for workers this is a worker variant such as `working` or `seated`. */
  pose: string;
  /** Agent kinds that may use the slot. Default: `person`. */
  agents?: readonly string[];
}

/** Slots for a node; may depend on the node's count or variant. Must not change while the node keeps the same inputs. */
export type InteractionSlotSource = (node: AssetNode) => readonly InteractionSlot[];

export interface ResolvedSlot {
  /** `${nodeId}:${slot name}`; also the movement-graph point ID of its approach. */
  id: string;
  nodeId: string;
  name: string;
  group?: string;
  pose: string;
  agents: readonly string[];
  approach: Vec3;
  position: Vec3;
  yaw: number;
}

const finite = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export function validateInteractionSlots(slots: readonly InteractionSlot[]): void {
  const names = new Set<string>();
  for (const slot of slots) {
    if (typeof slot.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slot.name)) throw new Error(`Invalid interaction slot name: ${String(slot.name)}.`);
    if (names.has(slot.name)) throw new Error(`Duplicate interaction slot: ${slot.name}.`);
    names.add(slot.name);
    if (slot.group !== undefined && (typeof slot.group !== 'string' || !slot.group.trim())) throw new Error(`Interaction slot ${slot.name} has an empty group.`);
    if (!finite(slot.approach) || !finite(slot.position)) throw new Error(`Interaction slot ${slot.name} requires finite approach and position points.`);
    if (!Number.isFinite(slot.yaw)) throw new Error(`Interaction slot ${slot.name} requires a finite heading.`);
    if (typeof slot.pose !== 'string' || !slot.pose.trim()) throw new Error(`Interaction slot ${slot.name} requires a pose.`);
    if (slot.agents !== undefined && (!Array.isArray(slot.agents) || !slot.agents.length || !slot.agents.every(agent => typeof agent === 'string' && agent.trim()))) throw new Error(`Interaction slot ${slot.name} has an invalid agent list.`);
  }
}

/** Apply a node's scale, Euler XYZ rotation (the Three.js default order) and position to a local point. */
export function nodeToWorld(node: Pick<AssetNode, 'position' | 'rotation' | 'scale'>, local: Vec3, applyScale = true): Vec3 {
  const [sx, sy, sz] = applyScale ? node.scale ?? [1, 1, 1] : [1, 1, 1], [rx, ry, rz] = node.rotation ?? [0, 0, 0], [px, py, pz] = node.position ?? [0, 0, 0];
  let x = local[0] * sx, y = local[1] * sy, z = local[2] * sz;
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  return [x + px, y + py, z + pz];
}

/** Heading in world space for a local heading on a rotated node. */
export function nodeYawToWorld(node: Pick<AssetNode, 'rotation'>, yaw: number): number {
  const forward = nodeToWorld({ rotation: node.rotation }, [Math.sin(yaw), 0, Math.cos(yaw)], false);
  return Math.atan2(forward[0], forward[2]);
}

export interface SlotResolveOptions { /** Raise approach and position points, e.g. to stand on zone tiles. Default 0. */ lift?: number; }

/** Resolve an object's slots into world space; returns an empty list for objects without slots. */
export function resolveInteractionSlots(node: AssetNode, source: InteractionSlotSource | undefined, options: SlotResolveOptions = {}): ResolvedSlot[] {
  if (!source) return [];
  const slots = source(node); validateInteractionSlots(slots);
  const lift = options.lift ?? 0;
  if (!Number.isFinite(lift)) throw new Error('Slot lift must be finite.');
  const world = (local: Vec3) => { const point = nodeToWorld(node, local); return Object.freeze([point[0], point[1] + lift, point[2]]) as Vec3; };
  return slots.map(slot => Object.freeze({
    id: `${node.id}:${slot.name}`, nodeId: node.id, name: slot.name, ...(slot.group ? { group: slot.group } : {}), pose: slot.pose,
    agents: Object.freeze([...slot.agents ?? ['person']]),
    approach: world(slot.approach), position: world(slot.position), yaw: nodeYawToWorld(node, slot.yaw),
  }));
}

/** Resolve slots for every asset node that has a slot source. */
export function resolveSceneSlots(nodes: readonly { kind: string }[], sources: Readonly<Record<string, InteractionSlotSource>>, options: SlotResolveOptions = {}): ResolvedSlot[] {
  return nodes.flatMap(node => node.kind === 'asset' ? resolveInteractionSlots(node as AssetNode, sources[(node as AssetNode).asset], options) : []);
}

/** Movement-graph points for slot approaches, so routes can be planned to them. */
export function slotNavPoints(slots: readonly ResolvedSlot[]): NavPoint[] {
  return slots.map(slot => ({ id: slot.id, position: slot.approach, label: `${slot.nodeId} ${slot.name}` }));
}
