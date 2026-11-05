import type { Object3D } from 'three';
import { finalForkPose, forkPoseAt, type AssetNode, type ForkPose } from '@opsorama/core';
import { setAssetAnimator } from './animation';

/**
 * Apply `node.forks` to a lift truck. The model is built at the confirmed pose, so
 * motion-off and reduced motion show it; moves run on the visual clock. `parts` are
 * the groups `apply` changes. Without moves the model has no animator.
 */
export function driveForks(object: Object3D, node: AssetNode, parts: readonly Object3D[], apply: (pose: Required<ForkPose>) => void): void {
  const forks = node.forks;
  if (!forks) return;
  apply(finalForkPose(forks));
  if (!forks.moves?.length || node.localMotion === false) return;
  let clock = 0;
  setAssetAnimator(object, ({ delta }) => { clock += delta; apply(forkPoseAt(forks, clock)); }, parts);
}
