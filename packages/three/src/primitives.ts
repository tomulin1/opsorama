import * as THREE from 'three';
import type { GroundNode, PathNode, ZoneNode } from '@opsorama/core';

/** Builds the geometry of a ground, zone or path node. The returned group owns its geometries and materials; release them with `disposeObject`. */
export function buildPrimitive(node: GroundNode | ZoneNode | PathNode): THREE.Group {
  const group = new THREE.Group();
  if (node.kind === 'ground' || node.kind === 'zone') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(node.size[0], node.kind === 'ground' ? .18 : .08, node.size[1]), new THREE.MeshStandardMaterial({ color: node.color || (node.kind === 'ground' ? '#e7eef8' : '#dce9f6'), roughness: .92 })); mesh.position.y = node.kind === 'ground' ? -.13 : .055; mesh.receiveShadow = true; group.add(mesh);
    if (node.kind === 'zone') { const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: .9 })); edges.position.copy(mesh.position); group.add(edges); }
    return group;
  }
  for (let i = 0; i < node.points.length - 1; i++) {
    const a = new THREE.Vector3(...node.points[i]), b = new THREE.Vector3(...node.points[i + 1]); const length = a.distanceTo(b);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(.48, .12, length), new THREE.MeshStandardMaterial({ color: node.color || '#a9bcd4', roughness: .9 })); belt.position.copy(a).lerp(b, .5); belt.position.y += .12; belt.lookAt(b.x, belt.position.y, b.z); belt.receiveShadow = true; group.add(belt);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().add(new THREE.Vector3(0, .195, 0)), b.clone().add(new THREE.Vector3(0, .195, 0))]), new THREE.LineDashedMaterial({ color: '#f8fbff', dashSize: .15, gapSize: .15 })); line.computeLineDistances(); group.add(line);
  }
  return group;
}
