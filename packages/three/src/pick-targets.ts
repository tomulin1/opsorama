import * as THREE from 'three';
import { OVERLAY_COLORS, type AssetNode, type Vec3 } from '@opsorama/core';

/** A model a pick target shows as its ghost when no scene node has the right look: an asset and its look, built at the target. */
export type GhostModel = Pick<AssetNode, 'asset'> & Partial<Pick<AssetNode, 'variant' | 'count' | 'countLayout' | 'options' | 'color' | 'materials' | 'scale'>>;

/**
 * A pickable place the renderer draws over the scene (`SceneRenderer.setPickTargets`), e.g. a free place a unit can move to:
 * a box, or with `ghost` a translucent copy of the thing that would stand there. It is positioned once, from the node's
 * current anchor pose, when the targets are set.
 */
export interface PickTarget {
  /** Scene node the target sits on. Give `node` or `position`. */
  node?: string;
  /** Named anchor of that node (`anchor-<name>` in the model). Default: the node's origin. A missing anchor skips the target. */
  anchor?: string;
  /** Centre of the box base, local to the anchor (or node origin) in its axes, in model metres. Default [0, 0, 0]. */
  offset?: Vec3;
  /** Centre of the box base in world metres, for a place on no node, such as a spot on the floor. Used without `node`. */
  position?: Vec3;
  /** Box size in world metres: [width along the anchor's x, height along y, depth along z]. With a ghost it is the area that takes the pointer. */
  size: Vec3;
  /**
   * Show a translucent copy instead of a box: the ID of a scene node whose current model, with the nodes inside it, is
   * copied (a target whose node is not built gets a box), or a model to build. Its origin stands on the box base.
   */
  ghost?: string | GhostModel;
  /** Turn of the ghost about the vertical axis of the anchor (or the world), in radians. The box does not turn. Default 0. */
  yaw?: number;
  /** Color of the box or ghost, a CSS color. Default the overlay color of free places. */
  color?: string;
}

/** The ghost of a marker: the object whose meshes are copied, and the scale the copy gets. */
export interface PickGhostSource {
  object: THREE.Object3D;
  scale: THREE.Vector3;
  /** Whether a mesh draws even when hidden, such as an instanced proxy. Default: only visible meshes. */
  isDrawn?: (mesh: THREE.Mesh) => boolean;
}

/** One target in world space: the base centre, heading and size of a pick target, the index of that target and its look. */
export interface PickTargetMarker { index: number; position: THREE.Vector3; quaternion: THREE.Quaternion; size: Vec3; ghost?: PickGhostSource; yaw?: number; color?: string; }

const REST_OPACITY = .22, HOVER_OPACITY = .5;
/** Ghost opacity where the ghost is in view, and where scene geometry covers it, at rest and under the pointer. */
const GHOST_OPACITY = { front: [.42, .72], through: [.12, .26] } as const;

/** Error for a target that names neither a node nor a position, or has an invalid size. */
export function validatePickTarget(target: PickTarget, index: number): void {
  const vec = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (target.node === undefined && target.position === undefined) throw new Error(`Pick target ${index} needs a node (with an optional anchor and offset) or a world position.`);
  if (target.position !== undefined && !vec(target.position)) throw new Error(`Pick target ${index} position must be three finite numbers in world metres.`);
  if (!vec(target.size) || target.size.some(value => value <= 0)) throw new Error(`Pick target ${index} size must be three numbers greater than 0, in metres.`);
  if (target.yaw !== undefined && !Number.isFinite(target.yaw)) throw new Error(`Pick target ${index} yaw must be a finite number of radians.`);
  if (typeof target.ghost === 'object' && (target.ghost === null || typeof target.ghost.asset !== 'string' || !target.ghost.asset.trim())) throw new Error(`Pick target ${index} ghost must be a scene node ID or a model with an asset name.`);
}

/** Opaque meshes under `object`, including those of the nodes inside it, that draw now. */
function ghostSources(object: THREE.Object3D, isDrawn: (mesh: THREE.Mesh) => boolean): THREE.Mesh[] {
  const sources: THREE.Mesh[] = [];
  const visit = (current: THREE.Object3D) => {
    if (current.name === 'selection-corners') return;
    if (current !== object && !current.visible && !(current as THREE.Mesh).isMesh) return;
    const mesh = current as THREE.Mesh;
    if (mesh.isMesh && (mesh.visible || isDrawn(mesh)) && !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(material => material.transparent)) sources.push(mesh);
    current.children.forEach(visit);
  };
  visit(object);
  return sources;
}

/** Translucent copies of the meshes of `ghost.object`, sharing their geometry, placed relative to its origin. */
function ghostCopy(ghost: PickGhostSource, front: THREE.Material, through: THREE.Material): THREE.Group {
  const copy = new THREE.Group(); copy.name = 'pick-target-ghost';
  ghost.object.updateWorldMatrix(true, true);
  const inverse = ghost.object.matrixWorld.clone().invert();
  for (const source of ghostSources(ghost.object, ghost.isDrawn ?? (() => false))) {
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, source.matrixWorld);
    for (const [material, order] of [[through, 12], [front, 13]] as const) {
      const instanced = source as THREE.InstancedMesh;
      const mesh = instanced.isInstancedMesh ? new THREE.InstancedMesh(source.geometry, material, instanced.count) : new THREE.Mesh(source.geometry, material);
      if (mesh instanceof THREE.InstancedMesh) { mesh.instanceMatrix.copy(instanced.instanceMatrix); mesh.count = instanced.count; }
      mesh.matrixAutoUpdate = false; mesh.matrix.copy(matrix); mesh.renderOrder = order; mesh.frustumCulled = false; mesh.raycast = () => {};
      mesh.userData.borrowedGeometry = true; copy.add(mesh);
    }
  }
  return copy;
}

/**
 * Build pickable targets: boxes, or ghosts that copy a model's meshes. Each target has a box that takes the pointer; with
 * a ghost the box is not drawn. Release them with `disposePickTargets`, which leaves borrowed geometry alone. Static:
 * nothing here follows the clock.
 */
export function createPickTargetObject(markers: readonly PickTargetMarker[]): THREE.Group {
  const group = new THREE.Group(); group.name = 'pick-targets'; group.renderOrder = 13;
  for (const marker of markers) {
    const [width, height, depth] = marker.size, geometry = new THREE.BoxGeometry(width, height, depth), color = marker.color ?? OVERLAY_COLORS.free;
    const box = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: REST_OPACITY, depthTest: false, depthWrite: false }));
    box.name = 'pick-target'; box.renderOrder = 13; box.userData.pickTarget = marker.index;
    box.position.copy(marker.position).add(new THREE.Vector3(0, height / 2, 0).applyQuaternion(marker.quaternion));
    box.quaternion.copy(marker.quaternion);
    if (marker.ghost) {
      // The box only takes the pointer: three.js casts rays against meshes that are not drawn.
      box.visible = false;
      const front = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: 1, metalness: 0, transparent: true, opacity: GHOST_OPACITY.front[0], depthWrite: false });
      const through = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: GHOST_OPACITY.through[0], depthTest: false, depthWrite: false });
      const copy = ghostCopy(marker.ghost, front, through);
      copy.position.copy(marker.position); copy.quaternion.copy(marker.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), marker.yaw ?? 0)); copy.scale.copy(marker.ghost.scale);
      copy.userData.pickTarget = marker.index; copy.userData.ghostMaterials = { front, through };
      group.add(copy);
    } else {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      edges.name = 'pick-target-edges'; edges.renderOrder = 14; box.add(edges);
    }
    group.add(box);
  }
  return group;
}

/** Show the target under the pointer as hovered; `index` is null when the pointer is on none. */
export function highlightPickTarget(group: THREE.Group, index: number | null): void {
  for (const child of group.children) {
    const hovered = child.userData.pickTarget === index ? 1 : 0, ghost = child.userData.ghostMaterials as { front: THREE.Material; through: THREE.Material } | undefined;
    if (ghost) { ghost.front.opacity = GHOST_OPACITY.front[hovered]; ghost.through.opacity = GHOST_OPACITY.through[hovered]; }
    else if (child.name === 'pick-target') ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = hovered ? HOVER_OPACITY : REST_OPACITY;
  }
}

/** Boxes of the targets, for picking: the meshes that carry `userData.pickTarget`. */
export function pickTargetBoxes(group: THREE.Group): THREE.Object3D[] { return group.children.filter(child => child.name === 'pick-target'); }

/** Release what `createPickTargetObject` made, leaving the geometry its ghosts borrowed from scene models. */
export function disposePickTargets(group: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(child => {
    if (child instanceof THREE.InstancedMesh) child.dispose();
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      if (!child.userData.borrowedGeometry) geometries.add(child.geometry);
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}
