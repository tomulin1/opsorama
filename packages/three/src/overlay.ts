import * as THREE from 'three';
import { validateOverlay, type SceneOverlay } from '@opsorama/core';

/** Height above the floor, clear of zone tiles (top ≈ .095 m). */
const LIFT = .14;
const ARROW_LENGTH = .32;

/**
 * Build a non-interactive debug group for an overlay. Everything draws on top
 * of the scene (no depth test) and owns its geometry/materials, so
 * `disposeObject` releases it.
 */
export function createOverlayObject(overlay: SceneOverlay): THREE.Group {
  validateOverlay(overlay);
  const group = new THREE.Group(); group.name = 'scene-overlay'; group.renderOrder = 10;
  const byStyle = new Map<string, number[]>();
  for (const line of overlay.lines) {
    const key = `${line.color}|${line.dashed ? 'dashed' : 'solid'}`;
    byStyle.set(key, [...byStyle.get(key) ?? [], line.from[0], line.from[1] + LIFT, line.from[2], line.to[0], line.to[1] + LIFT, line.to[2]]);
    if (line.arrow) {
      const from = new THREE.Vector3(...line.from), to = new THREE.Vector3(...line.to), direction = to.clone().sub(from);
      if (direction.lengthSq() === 0) continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(.1, ARROW_LENGTH, 10), new THREE.MeshBasicMaterial({ color: line.color, depthTest: false, transparent: true }));
      cone.name = 'overlay-arrow'; cone.renderOrder = 11;
      // Place the head just before the end point so it does not cover the point marker.
      cone.position.copy(to.clone().sub(direction.clone().normalize().multiplyScalar(ARROW_LENGTH * 1.2))).setY(to.y + LIFT);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      group.add(cone);
    }
  }
  for (const [key, positions] of byStyle) {
    const [color, style] = key.split('|');
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = style === 'dashed' ? new THREE.LineDashedMaterial({ color, dashSize: .18, gapSize: .12, depthTest: false, transparent: true }) : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    const lines = new THREE.LineSegments(geometry, material); lines.name = `overlay-lines-${style}`; lines.renderOrder = 10;
    if (style === 'dashed') lines.computeLineDistances();
    group.add(lines);
  }
  for (const point of overlay.points) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(point.radius ?? .12, 20), new THREE.MeshBasicMaterial({ color: point.color, depthTest: false, transparent: true, opacity: .9 }));
    disc.name = 'overlay-point'; disc.rotation.x = -Math.PI / 2; disc.position.set(point.position[0], point.position[1] + LIFT, point.position[2]); disc.renderOrder = 12;
    group.add(disc);
  }
  return group;
}
