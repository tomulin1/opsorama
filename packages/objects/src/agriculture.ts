import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, cylinder, merged, part, wheel } from './parts';
import { kitPalette } from './kit';

/**
 * Farm tractor facing +z with large rear and small front wheels, glazed cab, engine hood and rear hitch.
 * Movement uses host routes only; field work and telemetry are host data. Color changes the hood, fenders and cab roof.
 */
export function createTractor(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), body = node.materials?.normal ?? node.color ?? p.normal;
  const tractor = new THREE.Group(); tractor.name = 'tractor';
  for (const side of [-1, 1]) {
    wheel(tractor, [side * .82, .75, -.55], .75, .42);
    wheel(tractor, [side * .72, .45, 1.35], .45, .26);
    // Open half-shell fender over each rear wheel.
    const fender = part(tractor, new THREE.CylinderGeometry(.86, .86, .48, 20, 1, true, 0, Math.PI), body, 'tractor-fender', { roughness: .45 });
    fender.rotation.z = Math.PI / 2; fender.position.set(side * .82, .75, -.55); (fender.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    block(tractor, [.18, .06, .3], [side * .42, .55, -.05], p.structure, 'tractor-step');
  }
  block(tractor, [.6, .35, 2.5], [0, .72, .35], p.structure, 'tractor-chassis', { bevel: .03 });
  block(tractor, [.72, .75, 1.5], [0, 1.2, .95], body, 'tractor-hood', { bevel: .09, roughness: .4 });
  block(tractor, [.6, .52, .03], [0, 1.15, 1.71], p.screen, 'tractor-grille');
  for (let i = 0; i < 5; i++) block(tractor, [.56, .02, .035], [0, .95 + i * .1, 1.72], p.trim, 'tractor-grille-slat');
  for (const x of [-.26, .26]) block(tractor, [.12, .08, .03], [x, 1.47, 1.715], '#fff2cc', 'tractor-headlight', { emissive: '#fff2cc' });
  cylinder(tractor, .05, .95, 2.05, p.structure, 'tractor-exhaust', { segments: 10, metalness: .3, roughness: .45 }).position.set(.25, 2.05, 1.45);
  // Cab: four posts, glass on all sides, roof, seat and steering wheel.
  block(tractor, [1.1, .08, 1.05], [0, 1.12, -.58], p.structure, 'tractor-cab-floor');
  for (const x of [-.55, .55]) for (const z of [-1.08, -.08]) block(tractor, [.05, 1.36, .05], [x, 1.84, z], p.structure, 'tractor-cab-post');
  for (const x of [-.55, .55]) block(tractor, [.02, 1.2, .96], [x, 1.84, -.58], p.glass, 'tractor-cab-glass', { opacity: .4, roughness: .1 });
  for (const z of [-1.08, -.08]) block(tractor, [1.06, 1.2, .02], [0, 1.84, z], p.glass, 'tractor-cab-glass', { opacity: .4, roughness: .1 });
  block(tractor, [1.3, .09, 1.28], [0, 2.56, -.58], body, 'tractor-cab-roof', { bevel: .04, roughness: .45 });
  block(tractor, [.45, .1, .4], [0, 1.4, -.75], p.screen, 'tractor-seat', { bevel: .03 }); block(tractor, [.45, .45, .1], [0, 1.62, -.95], p.screen, 'tractor-seat', { bevel: .03 });
  const steering = part(tractor, new THREE.TorusGeometry(.15, .02, 6, 16), p.screen, 'tractor-steering'); steering.rotation.x = Math.PI / 2 - .7; steering.position.set(0, 1.72, -.28);
  block(tractor, [.3, .2, .25], [0, .55, -1.32], p.structure, 'tractor-hitch'); block(tractor, [.06, .06, .3], [0, .45, -1.55], p.trim, 'tractor-hitch');
  anchor(tractor, 'hitch', [0, .45, -1.7]); anchor(tractor, 'cab', [0, 1.4, -.6]);
  return tractor;
}

/**
 * Corrugated grain silo, 4.4 m diameter and about 8 m tall, with roof vent, ladder and safety hoops on the +x side and an
 * outlet spout at +z. It does not encode a fill level or crop stock. Color changes the shell and roof.
 */
export function createGrainSilo(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), shell = node.materials?.surface ?? node.color ?? p.surface, metal = { metalness: .3, roughness: .4 };
  const silo = new THREE.Group(); silo.name = 'grain-silo';
  cylinder(silo, 2.5, .3, .15, p.trim, 'silo-base', { segments: 40 });
  // Alternate radii on 96 segments give the corrugated shell; flat shading keeps the ridges crisp.
  const corrugated = new THREE.CylinderGeometry(2.2, 2.2, 6, 96, 1, true), position = corrugated.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i), step = Math.round(Math.atan2(z, x) / (Math.PI * 2 / 96)), scale = step % 2 ? 1.012 : 1;
    position.setXYZ(i, x * scale, position.getY(i), z * scale);
  }
  corrugated.computeVertexNormals();
  part(silo, corrugated, shell, 'silo-shell', { ...metal, flat: true }).position.y = 3.3;
  for (const y of [1.8, 3.3, 4.8]) { const ring = part(silo, new THREE.TorusGeometry(2.24, .035, 6, 64), p.trim, 'silo-stiffener', metal); ring.rotation.x = Math.PI / 2; ring.position.y = y; }
  part(silo, new THREE.ConeGeometry(2.38, 1.3, 48), shell, 'silo-roof', metal).position.y = 6.95;
  cylinder(silo, .3, .3, 7.7, p.trim, 'silo-vent', { segments: 16, ...metal });
  part(silo, new THREE.ConeGeometry(.42, .25, 16), p.trim, 'silo-vent-cap', metal).position.y = 7.97;
  for (const z of [-.2, .2]) block(silo, [.04, 6.9, .04], [2.3, 3.75, z], p.structure, 'silo-ladder');
  merged(silo, Array.from({ length: 22 }, (_, i) => new THREE.BoxGeometry(.03, .03, .4).translate(2.3, .6 + i * .3, 0)), p.structure, 'silo-ladder-rung');
  for (let i = 0; i < 6; i++) { const hoop = part(silo, new THREE.TorusGeometry(.36, .02, 6, 14, Math.PI), p.structure, 'silo-ladder-hoop'); hoop.rotation.set(Math.PI / 2, 0, -Math.PI / 2); hoop.position.set(2.3, 2.6 + i * .85, 0); }
  block(silo, [.9, .9, .06], [0, .85, 2.21], p.structure, 'silo-hatch', { bevel: .02 });
  const spout = cylinder(silo, .15, .7, 0, p.trim, 'silo-spout', { segments: 14, ...metal }); spout.rotation.x = Math.PI / 2 + .5; spout.position.set(.8, 1.1, 2.45);
  anchor(silo, 'inlet', [0, 7.95, 0]); anchor(silo, 'outlet', [.8, .95, 2.75]);
  return silo;
}
