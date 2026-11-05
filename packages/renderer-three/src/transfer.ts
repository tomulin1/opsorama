import * as THREE from 'three';
import { DEFAULT_TRANSFER_ARC, type NodeTransfer } from '@opsorama/core';

/** A running `NodeTransfer`: the world pose the node left, and progress on the visual clock. */
export interface TransferState { position: THREE.Vector3; quaternion: THREE.Quaternion; elapsed: number; seconds: number; arc: number }

/** Start a transfer from the pose `object` had when it was last rendered (its parent may already be gone). */
export function startTransfer(object: THREE.Object3D, transfer: NodeTransfer): TransferState {
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  object.matrixWorld.decompose(position, quaternion, new THREE.Vector3());
  return { position, quaternion, elapsed: 0, seconds: transfer.seconds, arc: transfer.arc ?? DEFAULT_TRANSFER_ARC };
}

/**
 * Move `object` `delta` visual seconds further from the pose it left toward its
 * parent-local `target` pose, lifting it along an arc. Returns false once the
 * transfer has finished (the object then sits exactly at the target); pass
 * Infinity to finish at once, e.g. with motion off.
 */
export function advanceTransfer(object: THREE.Object3D, state: TransferState, target: THREE.Vector3, rotation: readonly [number, number, number], delta: number): boolean {
  state.elapsed += delta;
  const t = Math.min(1, state.elapsed / state.seconds), parent = object.parent;
  if (t >= 1 || !parent) { object.position.copy(target); object.rotation.set(...rotation); return false; }
  parent.updateWorldMatrix(true, false);
  const ease = t * t * (3 - 2 * t), parentRotation = parent.getWorldQuaternion(new THREE.Quaternion());
  const goal = target.clone().applyMatrix4(parent.matrixWorld), goalRotation = parentRotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)));
  const position = state.position.clone().lerp(goal, ease); position.y += state.arc * 4 * t * (1 - t);
  object.position.copy(parent.worldToLocal(position));
  object.quaternion.copy(parentRotation.invert().multiply(state.quaternion.clone().slerp(goalRotation, ease)));
  return true;
}
