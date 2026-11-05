import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { objectPalette } from './object-palette';
import type { MaterialContext } from '@opsorama/three';
import { anchor } from './parts';

const shade = (color: string, h: number, s: number, l: number) => `#${new THREE.Color(color).offsetHSL(h, s, l).getHexString()}`;

function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, color: string, name: string, flat = false) {
  const part = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .9, side: THREE.DoubleSide, flatShading: flat }));
  part.name = name; part.castShadow = true; part.receiveShadow = true; group.add(part); return part;
}

/** Static, base-centered conifer. Trunk and tiers use the wood and foliage roles; AssetNode.color overrides foliage. */
export function createPineTree(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'foliage', { wood: '#a18465', foliage: '#73a58e' }), tree = new THREE.Group(); tree.name = 'pine-tree';
  mesh(tree, new THREE.CylinderGeometry(.08, .16, .9, 8), p.wood, 'trunk').position.y = .45;
  mesh(tree, new THREE.ConeGeometry(.24, .14, 8), shade(p.wood, -.0034, .0198, -.0583), 'trunk-flare').position.y = .07;
  const foliage = p.foliage;
  const tiers = [{ radius: .85, height: 1.2, y: 1.05 }, { radius: .65, height: 1.1, y: 1.65 }, { radius: .43, height: .9, y: 2.2 }];
  // Faceted tiers with a slightly irregular rim read as layered branches.
  tiers.forEach((tier, index) => {
    const geometry = new THREE.ConeGeometry(tier.radius, tier.height, 9, 2), position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i), step = Math.round(Math.atan2(z, x) / (Math.PI * 2 / 9));
      if (position.getY(i) < -tier.height / 2 + 1e-4 && Math.hypot(x, z) > 1e-4 && step % 2) position.setY(i, position.getY(i) - .08);
    }
    geometry.computeVertexNormals();
    const crown = mesh(tree, geometry, foliage, `foliage-${index}`, true); crown.position.y = tier.y; crown.rotation.y = index * Math.PI / 8;
  });
  anchor(tree, 'top', [0, 2.65, 0]);
  return tree;
}

function palmLeaf(angle: number): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [], segments = 8;
  const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), sideways = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, width = .21 * Math.sin(Math.PI * t);
    const center = direction.clone().multiplyScalar(t * 1.4); center.y = .4 * Math.sin(Math.PI * t) - .45 * t * t;
    for (const side of [-1, 1]) { const point = center.clone().addScaledVector(sideways, width * side); positions.push(point.x, point.y, point.z); }
    if (i < segments) { const start = i * 2; indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/** The canopy sits this far +x of the trunk base; the palm is shifted so its bounds centre on the pivot. */
const PALM_LEAN = .23;

/** Static palm with a gently leaning trunk and seven curved fronds. Bark and fronds use the wood and foliage roles. */
export function createPalmTree(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'foliage', { wood: '#bc9975', foliage: '#83b6a0' }), tree = new THREE.Group(); tree.name = 'palm-tree';
  const body = new THREE.Group(); body.position.x = -PALM_LEAN; tree.add(body);
  for (let i = 0; i < 6; i++) {
    const a = new THREE.Vector3(.16 * (i / 6) ** 2, i * .35, 0), b = new THREE.Vector3(.16 * ((i + 1) / 6) ** 2, (i + 1) * .35, 0);
    const trunk = mesh(body, new THREE.CylinderGeometry(.085 + (5 - i) * .006, .095 + (5 - i) * .006, a.distanceTo(b), 8), i % 2 ? p.wood : shade(p.wood, .0092, -.0529, .0605), `trunk-${i}`);
    trunk.position.copy(a).lerp(b, .5); trunk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  }
  const foliage = p.foliage;
  mesh(body, new THREE.SphereGeometry(.16, 8, 6), foliage, 'crown').position.set(.16, 2.1, 0);
  for (let i = 0; i < 3; i++) mesh(body, new THREE.SphereGeometry(.07, 8, 6), shade(p.wood, -.0085, .1457, -.2205), 'palm-coconut').position.set(.16 + Math.cos(i * 2.1) * .11, 2.02, Math.sin(i * 2.1) * .11);
  for (let i = 0; i < 7; i++) mesh(body, palmLeaf(i * Math.PI * 2 / 7), foliage, `foliage-${i}`).position.set(.16, 2.15, 0);
  anchor(tree, 'top', [.16 - PALM_LEAN, 2.3, 0]);
  return tree;
}
