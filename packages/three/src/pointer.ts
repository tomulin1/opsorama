import { Plane, Vector3, type Ray } from 'three';
import type { SceneNode, Vec3 } from '@opsorama/core';

/** Pointer event types reported to `RendererOptions.onPointer`, in the order a click produces them: `down`, `up`, `click`. */
export const SCENE_POINTER_EVENT_TYPES = ['down', 'up', 'click', 'enter', 'leave', 'move'] as const;
export type ScenePointerEventType = typeof SCENE_POINTER_EVENT_TYPES[number];
/** Input devices of a pointer event. Anything else the browser reports (for example a keyboard-activated label) counts as `mouse`. */
export type ScenePointerType = 'mouse' | 'touch' | 'pen';

/**
 * A pointer event on the scene, reported to `RendererOptions.onPointer`. It names the nearest node under the pointer,
 * whether it is selectable or not (grounds, zones and paths included), or null when the pointer is over empty space.
 */
export interface ScenePointerEvent {
  /**
   * `down` and `up`: a button pressed or released over the canvas or a label (also when the press starts a drag).
   * `click`: a press and release that moved less than 5 px, or a touch tap; the renderer then selects the node, or its
   * nearest selectable group ancestor (see `selectionTarget`), or clears the selection, and frames it, unless a handler calls `preventSelection()`. `enter` and `leave`: the nearest node under
   * the pointer changed (never for null), checked when the pointer moves or leaves the scene, not when a node moves under a
   * resting pointer. `move`: the pointer moved, at most once per animation frame.
   */
  type: ScenePointerEventType;
  /** ID of the nearest node under the pointer, or null over empty space. For `leave`, the node the pointer left. */
  nodeId: string | null;
  /** `entityId` of that node, when it has one. */
  entityId?: string;
  /** IDs of the node's containers along its `parentId` chain, nearest first; empty for a top-level node or null. */
  ancestors: readonly string[];
  /**
   * World point in metres: where the pointer ray hits the node, or on a miss where it meets the ground plane y = 0 (null
   * when the ray never reaches it, for example a perspective camera looking above the horizon). For a label event, the
   * labelled node's world position.
   */
  point: Vec3 | null;
  pointerType: ScenePointerType;
  /** DOM `PointerEvent.button`: 0 primary, 1 middle, 2 secondary; -1 for `move`, `enter` and `leave`. */
  button: number;
  shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean;
  /** `canvas` for the 3D view, `label` for a projected HTML label or marker. */
  source: 'canvas' | 'label';
  /** `click` only: skip the default selection and framing of this click. No effect for other types. */
  preventSelection(): void;
}

/** The DOM fields a scene pointer event copies; a `PointerEvent` or `MouseEvent` has them all. */
export interface PointerInput { pointerType?: string; button: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }

/** IDs along the `parentId` chain of `id`, nearest first. Stops at an unknown parent and at a cycle. */
export function nodeAncestors(id: string, getNode: (id: string) => SceneNode | undefined): string[] {
  const ancestors: string[] = [], seen = new Set([id]);
  let parentId = getNode(id)?.parentId;
  while (parentId && !seen.has(parentId)) {
    const parent = getNode(parentId); if (!parent) break;
    ancestors.push(parentId); seen.add(parentId); parentId = parent.parentId;
  }
  return ancestors;
}

/**
 * The node a click on `id` selects: `id` itself when it is selectable (`entityId` or `selectable`); otherwise the click
 * bubbles through group parents to the nearest selectable group. It stops at a parent that is not a group (an asset
 * container keeps its own selection), so a click on a node that is not selectable outside groups selects nothing
 * (undefined). Stops at unknown nodes and cycles.
 */
export function selectionTarget(id: string, getNode: (id: string) => SceneNode | undefined): string | undefined {
  const seen = new Set<string>();
  let current = getNode(id);
  while (current && !seen.has(current.id)) {
    if (current.entityId || current.selectable) return current.id;
    seen.add(current.id);
    const parent = current.parentId !== undefined ? getNode(current.parentId) : undefined;
    current = parent?.kind === 'group' ? parent : undefined;
  }
  return undefined;
}

/** The first intersection that belongs to a known node, as returned in nearest-first order by a raycaster. */
export function nearestNodeHit<T extends { object: { userData: Record<string, unknown> }; point: { x: number; y: number; z: number } }>(hits: readonly T[], isNode: (id: string) => boolean): { nodeId: string; point: Vec3 } | null {
  for (const hit of hits) {
    const id = hit.object.userData.nodeId;
    if (typeof id === 'string' && isNode(id)) return { nodeId: id, point: [hit.point.x, hit.point.y, hit.point.z] };
  }
  return null;
}

const GROUND = new Plane(new Vector3(0, 1, 0), 0);
/**
 * Node and world point of a pointer ray: the nearest hit of a known node (see `nearestNodeHit`), or on a miss no node and
 * the point where `ray` meets the ground plane y = 0 (null when it never does).
 */
export function resolvePointerTarget<T extends { object: { userData: Record<string, unknown> }; point: { x: number; y: number; z: number } }>(hits: readonly T[], ray: Ray, isNode: (id: string) => boolean): { nodeId: string | null; point: Vec3 | null } {
  const hit = nearestNodeHit(hits, isNode);
  if (hit) return hit;
  const point = ray.intersectPlane(GROUND, new Vector3());
  return { nodeId: null, point: point ? [point.x, point.y, point.z] : null };
}

/**
 * Selection origin of a click on a label button. A click activated from the keyboard (Enter or Space on a focused label)
 * has `detail` 0; a mouse, pen or touch click counts its clicks from 1.
 */
export function labelClickOrigin(event: Pick<MouseEvent, 'detail'>): 'pointer' | 'keyboard' {
  return event.detail === 0 ? 'keyboard' : 'pointer';
}

/** Events for a change of the node under the pointer: `leave` for the previous node, then `enter` for the next one. */
export function hoverTransitions(previous: string | null, next: string | null): { type: 'enter' | 'leave'; nodeId: string }[] {
  if (previous === next) return [];
  return [...(previous ? [{ type: 'leave' as const, nodeId: previous }] : []), ...(next ? [{ type: 'enter' as const, nodeId: next }] : [])];
}

/**
 * Builds a frozen scene pointer event. `selectionPrevented()` reports whether a handler called `preventSelection()` on a
 * `click`.
 */
export function createScenePointerEvent(type: ScenePointerEventType, target: { nodeId: string | null; point: Vec3 | null }, input: PointerInput, source: 'canvas' | 'label', getNode: (id: string) => SceneNode | undefined): { event: ScenePointerEvent; selectionPrevented(): boolean } {
  let prevented = false;
  const node = target.nodeId ? getNode(target.nodeId) : undefined, pointerType: ScenePointerType = input.pointerType === 'touch' || input.pointerType === 'pen' ? input.pointerType : 'mouse';
  const event: ScenePointerEvent = Object.freeze({
    type, nodeId: target.nodeId, ...(node?.entityId ? { entityId: node.entityId } : {}),
    ancestors: Object.freeze(target.nodeId ? nodeAncestors(target.nodeId, getNode) : []),
    point: target.point ? Object.freeze([...target.point]) as unknown as Vec3 : null,
    pointerType, button: type === 'move' || type === 'enter' || type === 'leave' ? -1 : input.button,
    shiftKey: input.shiftKey, ctrlKey: input.ctrlKey, altKey: input.altKey, metaKey: input.metaKey, source,
    preventSelection() { if (type === 'click') prevented = true; },
  });
  return { event, selectionPrevented: () => prevented };
}
