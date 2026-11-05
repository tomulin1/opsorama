import type { Object3D } from 'three';
/**
 * `locomotion` is present only while a route follower or a motion controller owns
 * the instance's root transform; local animators then animate pose in place and
 * never move the root.
 */
export interface AssetFrame { time: number; delta: number; locomotion?: { moving: boolean }; }
export type AssetAnimator = (frame: AssetFrame) => void;
const animators = new WeakMap<Object3D, { animator: AssetAnimator; parts: readonly Object3D[] }>();
/**
 * Register an instance-owned animation; the renderer supplies its visual clock.
 * `animatedParts` lists every descendant the animator changes: each object whose position, rotation,
 * scale or visibility it sets, and each mesh whose material or instance colors it changes. The
 * renderer merges the remaining static meshes (`mergeStaticParts`), so a part missing from this list
 * stops animating in a scene. Listed parts keep their own transform, material and visibility; static
 * meshes below a listed part may still merge within that part. Pass `[]` only when the animator
 * changes nothing in the object itself. Listing the root object keeps nothing more than its own transform.
 */
export function setAssetAnimator(object: Object3D, animator: AssetAnimator, animatedParts: readonly Object3D[]): void {
  for (const part of animatedParts) {
    let current: Object3D | null = part;
    while (current && current !== object) current = current.parent;
    if (!current) throw new Error(`Animated part ${part.name || part.type} is not a descendant of the animated object; add it to the object before calling setAssetAnimator.`);
  }
  animators.set(object, { animator, parts: [...animatedParts] });
}
export function animateAsset(object: Object3D, frame: AssetFrame): void { animators.get(object)?.animator(frame); }
export function clearAssetAnimator(object: Object3D): void { animators.delete(object); }
/** Whether an instance registered a local animator, e.g. to verify a descriptor's animation class. */
export function hasAssetAnimator(object: Object3D): boolean { return animators.has(object); }
/** The parts an instance's animator declared with `setAssetAnimator`; empty without an animator. */
export function assetAnimatedParts(object: Object3D): readonly Object3D[] { return animators.get(object)?.parts ?? []; }
