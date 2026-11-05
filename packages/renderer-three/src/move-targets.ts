import * as THREE from 'three';
import { OVERLAY_COLORS, type HandlingSize, type MoveMode } from '@opsorama/core';
import type { SceneRenderer } from './index';

/** One marker in world space: the base centre of a target, its heading, its size and the index of its target. */
export interface MoveTargetMarker { index: number; position: THREE.Vector3; quaternion: THREE.Quaternion; size: HandlingSize; }

const REST_OPACITY = .22, HOVER_OPACITY = .5;

/**
 * Build pickable ghost boxes for move targets. They draw on top of the scene and own their
 * geometry and materials, so `disposeObject` releases them. Static: nothing here follows the clock.
 */
export function createMoveTargetObject(markers: readonly MoveTargetMarker[]): THREE.Group {
  const group = new THREE.Group(); group.name = 'move-targets'; group.renderOrder = 13;
  for (const marker of markers) {
    const [width, depth] = marker.size.footprint, geometry = new THREE.BoxGeometry(width, marker.size.height, depth);
    const box = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: OVERLAY_COLORS.free, transparent: true, opacity: REST_OPACITY, depthTest: false, depthWrite: false }));
    box.name = 'move-target'; box.renderOrder = 13; box.userData.moveTarget = marker.index;
    box.position.copy(marker.position).add(new THREE.Vector3(0, marker.size.height / 2, 0).applyQuaternion(marker.quaternion));
    box.quaternion.copy(marker.quaternion);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: OVERLAY_COLORS.free, depthTest: false, transparent: true }));
    edges.name = 'move-target-edges'; edges.renderOrder = 14; box.add(edges);
    group.add(box);
  }
  return group;
}

/** Show the marker under the pointer as hovered; `index` is null when the pointer is on none. */
export function highlightMoveTarget(group: THREE.Group, index: number | null): void {
  for (const box of group.children) ((box as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = box.userData.moveTarget === index ? HOVER_OPACITY : REST_OPACITY;
}

/**
 * Keep a renderer's move targets in step with move mode: markers follow the snapshot, and a click
 * on one becomes `mode.request`. Returns the function that stops it and clears the markers.
 */
export function bindMoveMode(renderer: Pick<SceneRenderer, 'setMoveTargets'>, mode: MoveMode): () => void {
  const show = () => { const { unit, targets } = mode.getSnapshot(); renderer.setMoveTargets(unit === null ? null : targets, mode.request); };
  show();
  const stop = mode.subscribe(show);
  return () => { stop(); renderer.setMoveTargets(null); };
}
