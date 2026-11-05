import * as THREE from 'three';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import type { MaterialContext } from './laboratory';
import { anchor, block, cylinder, merged, part, wheel } from './parts';
import { kitPalette } from './kit';

/** Planform in the x/chord plane (chord positive toward the nose), extruded downward by `thickness`. */
function planform(points: readonly (readonly [number, number])[], thickness: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), { depth: thickness, bevelEnabled: false }).rotateX(Math.PI / 2);
}

/**
 * Narrow-body airliner at a disclosed half scale (about 19 m long, 17 m span), nose toward +z. Static: no gear,
 * door or engine motion. `door` marks the front left passenger door and `cargo` the right aft hold; color changes the livery.
 */
export function createAircraft(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), livery = node.materials?.accent ?? node.color ?? p.accent, body = p.surface, y = 2.3;
  const plane = new THREE.Group(); plane.name = 'aircraft';
  const fuselage = cylinder(plane, 1, 13, 0, body, 'aircraft-fuselage', { segments: 28, roughness: .35 }); fuselage.rotation.x = Math.PI / 2; fuselage.position.set(0, y, .5);
  const nose = part(plane, new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), body, 'aircraft-fuselage', { roughness: .35 }); nose.rotation.x = Math.PI / 2; nose.scale.y = 1.7; nose.position.set(0, y, 7);
  const tail = cylinder(plane, .25, 4, 0, body, 'aircraft-fuselage', { bottomRadius: 1, segments: 28, roughness: .35 }); tail.rotation.x = -Math.PI / 2; tail.position.set(0, y + .15, -8);
  block(plane, [1, .22, .45], [0, y + .5, 7.75], p.screen, 'aircraft-cockpit', { roughness: .15 }).rotation.x = -.7;
  // Curved skin patches follow the fuselage: angle 0 is the underside, π/2 the right (+x) side, 3π/2 the left.
  const skin = (center: number, half: number, z: number, length: number, color: string, name: string) => {
    const mesh = part(plane, new THREE.CylinderGeometry(1.012, 1.012, length, 6, 1, true, center - half, half * 2), color, name, { roughness: .35 }); mesh.rotation.x = Math.PI / 2; mesh.position.set(0, y, z); return mesh;
  };
  for (const side of [-1, 1]) {
    skin(side > 0 ? Math.acos(.05) : Math.PI * 2 - Math.acos(.05), .07, .3, 12.5, livery, 'aircraft-stripe');
    merged(plane, Array.from({ length: 24 }, (_, i) => new THREE.BoxGeometry(.03, .16, .13).translate(side * .965, y + .3, -4.8 + i * .44)), p.screen, 'aircraft-windows', { roughness: .2 });
  }
  skin(Math.PI * 2 - Math.acos(.25), .45, 5.6, .46, p.trim, 'aircraft-door');
  skin(Math.acos(.55), .3, -2.4, .75, p.trim, 'aircraft-cargo-door');
  // Swept low wings, engines on pylons, tailplane and fin.
  const wing = [[.9, 1.5], [8.5, -1.6], [8.5, -2.8], [.9, -2]] as const, stabilizer = [[.3, .6], [3.4, -.9], [3.4, -1.6], [.3, -1.3]] as const;
  for (const side of [-1, 1]) {
    const main = part(plane, planform(wing, .2), body, 'aircraft-wing', { roughness: .4 }); main.scale.x = side; main.position.set(0, y - .55, 1);
    const tailplane = part(plane, planform(stabilizer, .12), body, 'aircraft-tailplane', { roughness: .4 }); tailplane.scale.x = side; tailplane.position.set(0, y + .45, -7.6);
    const engine = cylinder(plane, .55, 2.2, 0, p.trim, 'aircraft-engine', { segments: 22, metalness: .3, roughness: .35 }); engine.rotation.x = Math.PI / 2; engine.position.set(side * 3.2, 1.15, 2.3);
    const inlet = cylinder(plane, .45, .02, 0, p.screen, 'aircraft-engine-inlet', { segments: 22 }); inlet.rotation.x = Math.PI / 2; inlet.position.set(side * 3.2, 1.15, 3.41);
    block(plane, [.18, .5, 1.4], [side * 3.2, 1.55, 1.8], body, 'aircraft-pylon');
    cylinder(plane, .08, 1.2, 1, p.structure, 'aircraft-gear', { segments: 10 }).position.set(side * 1.4, 1, 0);
    for (const dz of [-.22, .22]) wheel(plane, [side * 1.4, .38, dz], .38, .2);
  }
  const fin = part(plane, new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.6, 0), new THREE.Vector2(2.9, 3), new THREE.Vector2(1.8, 3)]), { depth: .16, bevelEnabled: false }).translate(0, 0, -.08).rotateY(Math.PI / 2), livery, 'aircraft-fin', { roughness: .4 });
  fin.position.set(0, y + .75, -6.3);
  cylinder(plane, .06, 1, .8, p.structure, 'aircraft-gear', { segments: 10 }).position.set(0, .8, 5.6);
  for (const x of [-.15, .15]) wheel(plane, [x, .28, 5.6], .28, .14);
  for (const lightY of [y + 1.02, y - 1.02]) part(plane, new THREE.SphereGeometry(.07, 10, 8), p.critical, 'aircraft-beacon', { emissive: p.critical }).position.set(0, lightY, 1);
  anchor(plane, 'door', [-1.05, y - .25, 5.6]); anchor(plane, 'cargo', [1.05, y - .85, -2.4]); anchor(plane, 'nose', [0, 0, 8.8]);
  return plane;
}

const BAG_TONES = ['#3a4656', '#d65b5b', '#3f6fd8', '#e3c27a', '#56657a', '#6a8f4e', '#9b6bc2', '#c9d4e2'] as const;
/**
 * Covered baggage dolly towed toward +z; `count` places 0–8 suitcases in fixed slots (two columns, four rows).
 * Bags are decorative and are not passenger or flight records. Color changes the canopy and panels.
 */
export function createBaggageCart(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), canopy = node.materials?.accent ?? node.color ?? p.accent, { count } = resolveCountRepresentation(node, assetCountDefinitions['baggage-cart']);
  const cart = new THREE.Group(); cart.name = 'baggage-cart';
  block(cart, [1.3, .12, 2.3], [0, .38, 0], p.structure, 'cart-chassis');
  block(cart, [1.32, .04, 2.32], [0, .46, 0], p.trim, 'cart-deck', { metalness: .3, roughness: .45 });
  for (const x of [-.6, .6]) for (const z of [-.85, .85]) wheel(cart, [x, .2, z], .2, .14);
  block(cart, [.06, .06, .8], [0, .3, 1.5], p.structure, 'cart-tow-bar').rotation.x = .15;
  const ring = part(cart, new THREE.TorusGeometry(.08, .02, 6, 14), p.structure, 'cart-tow-eye'); ring.rotation.x = Math.PI / 2; ring.position.set(0, .24, 1.92);
  for (const x of [-.64, .64]) for (const z of [-1.12, 1.12]) block(cart, [.05, 1.27, .05], [x, 1.115, z], p.structure, 'cart-post');
  block(cart, [1.46, .06, 2.46], [0, 1.78, 0], canopy, 'cart-canopy', { bevel: .02 });
  block(cart, [1.26, 1.1, .03], [0, 1.03, -1.13], canopy, 'cart-back-panel');
  for (const x of [-.66, .66]) block(cart, [.03, .32, 2.2], [x, 1.58, 0], canopy, 'cart-curtain');
  for (let i = 0; i < count; i++) {
    const bag = new THREE.Group(); bag.name = `count-part-${i}`; bag.position.set((i % 2 - .5) * .62, .48, -.81 + Math.floor(i / 2) * .54); cart.add(bag);
    block(bag, [.52, .26, .4], [0, .13, 0], BAG_TONES[i], 'cart-suitcase', { bevel: .04, roughness: .5 });
    block(bag, [.16, .03, .03], [0, .275, 0], p.screen, 'cart-suitcase-handle');
  }
  anchor(cart, 'tow', [0, .24, 1.95]); anchor(cart, 'load', [0, .48, 0]);
  return cart;
}
