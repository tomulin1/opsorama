import * as THREE from 'three';
import { OVERLAY_COLORS, type Vec3 } from '@opsorama/core';

/**
 * A pickable box the renderer draws on top of the scene (`SceneRenderer.setPickTargets`), e.g. a free place a unit can
 * move to. It is positioned once, from the node's current anchor pose, when the targets are set.
 */
export interface PickTarget {
  /** Scene node the box sits on. */
  node: string;
  /** Named anchor of that node (`anchor-<name>` in the model). Default: the node's origin. A missing anchor skips the box. */
  anchor?: string;
  /** Centre of the box base, local to the anchor (or node origin) in its axes, in model metres. Default [0, 0, 0]. */
  offset?: Vec3;
  /** Box size in world metres: [width along the anchor's x, height along y, depth along z]. */
  size: Vec3;
}

/** One box in world space: the base centre, heading and size of a pick target, and the index of that target. */
export interface PickTargetMarker { index: number; position: THREE.Vector3; quaternion: THREE.Quaternion; size: Vec3; }

const REST_OPACITY = .22, HOVER_OPACITY = .5;

/**
 * Build pickable ghost boxes for pick targets. They draw on top of the scene and own their geometry and materials, so
 * `disposeObject` releases them. Static: nothing here follows the clock.
 */
export function createPickTargetObject(markers: readonly PickTargetMarker[]): THREE.Group {
  const group = new THREE.Group(); group.name = 'pick-targets'; group.renderOrder = 13;
  for (const marker of markers) {
    const [width, height, depth] = marker.size, geometry = new THREE.BoxGeometry(width, height, depth);
    const box = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: OVERLAY_COLORS.free, transparent: true, opacity: REST_OPACITY, depthTest: false, depthWrite: false }));
    box.name = 'pick-target'; box.renderOrder = 13; box.userData.pickTarget = marker.index;
    box.position.copy(marker.position).add(new THREE.Vector3(0, height / 2, 0).applyQuaternion(marker.quaternion));
    box.quaternion.copy(marker.quaternion);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: OVERLAY_COLORS.free, depthTest: false, transparent: true }));
    edges.name = 'pick-target-edges'; edges.renderOrder = 14; box.add(edges);
    group.add(box);
  }
  return group;
}

/** Show the box under the pointer as hovered; `index` is null when the pointer is on none. */
export function highlightPickTarget(group: THREE.Group, index: number | null): void {
  for (const box of group.children) ((box as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = box.userData.pickTarget === index ? HOVER_OPACITY : REST_OPACITY;
}
