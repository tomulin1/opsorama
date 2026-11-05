import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, cylinder, gridWires, part, wires } from './parts';
import { kitPalette, variantOf } from './kit';

export type KitchenStationVariant = 'cooking' | 'prep';

function caster(group: THREE.Object3D, x: number, z: number, radius: number, color: string, fork: string) {
  const wheel = cylinder(group, radius, radius * .7, 0, color, 'caster', { segments: 12, roughness: .8 }); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, radius, z);
  block(group, [radius * 1.1, radius * .8, radius * .9], [x, radius * 2.1, z], fork, 'caster-fork');
}

/**
 * Adjustable hospital bed, head toward −z, with a raised backrest, side rails and an IV pole. The `patient` anchor sits on the
 * mattress and the `side` anchor beside it; occupancy and clinical data are host records. Color changes the blanket.
 */
export function createHospitalBed(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), blanket = node.materials?.accent ?? node.color ?? p.accent, metal = { metalness: .3, roughness: .4 };
  const bed = new THREE.Group(); bed.name = 'hospital-bed';
  for (const x of [-.42, .42]) for (const z of [-.92, .92]) caster(bed, x, z, .07, p.screen, p.structure);
  block(bed, [.9, .1, 2], [0, .26, 0], p.structure, 'bed-base', { bevel: .02 });
  for (const z of [-.6, .6]) block(bed, [.14, .28, .14], [0, .44, z], p.trim, 'bed-column', metal);
  block(bed, [.92, .06, 2], [0, .6, 0], p.trim, 'bed-frame', metal);
  block(bed, [.88, .16, 1.3], [0, .71, .32], p.surface, 'bed-mattress', { bevel: .05, roughness: .8 });
  const head = new THREE.Group(); head.name = 'bed-backrest'; head.position.set(0, .63, -.33); head.rotation.x = .45; bed.add(head);
  block(head, [.88, .16, .7], [0, .08, -.35], p.surface, 'bed-mattress', { bevel: .05, roughness: .8 });
  block(head, [.6, .1, .3], [0, .21, -.48], '#fbfcfe', 'bed-pillow', { bevel: .045, roughness: .85 });
  block(bed, [.92, .05, 1.12], [0, .81, .4], blanket, 'bed-blanket', { bevel: .02, roughness: .9 });
  block(bed, [.93, .055, .16], [0, .815, -.12], '#fbfcfe', 'bed-sheet-fold', { bevel: .02, roughness: .85 });
  block(bed, [.98, .6, .05], [0, .88, -1.02], p.trim, 'bed-headboard', { bevel: .02, roughness: .5 });
  block(bed, [.98, .42, .05], [0, .8, 1.02], p.trim, 'bed-footboard', { bevel: .02, roughness: .5 });
  for (const x of [-.49, .49]) { block(bed, [.03, .16, .78], [x, .93, -.25], p.trim, 'bed-side-rail', { bevel: .01, ...metal }); for (const z of [-.55, .05]) block(bed, [.025, .22, .025], [x, .76, z], p.trim, 'bed-side-rail', metal); }
  cylinder(bed, .015, 1.45, 1.33, p.trim, 'bed-iv-pole', { segments: 8, ...metal }).position.set(.5, 1.33, -1.06);
  block(bed, [.22, .015, .015], [.5, 2.04, -1.06], p.trim, 'bed-iv-pole', metal);
  block(bed, [.12, .18, .04], [.58, 1.92, -1.06], p.glass, 'bed-iv-bag', { opacity: .6, roughness: .2 });
  anchor(bed, 'patient', [0, .79, .1]); anchor(bed, 'side', [.75, 0, 0]);
  return bed;
}

/** Four-drawer service cart with a railed top tray, push handle at −z and casters. Contents and assignments are host data. Color changes the drawer fronts. */
export function createServiceCart(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), drawers = node.materials?.accent ?? node.color ?? p.accent;
  const cart = new THREE.Group(); cart.name = 'service-cart';
  for (const x of [-.25, .25]) for (const z of [-.17, .17]) caster(cart, x, z, .05, p.screen, p.structure);
  block(cart, [.6, .78, .45], [0, .54, 0], p.surface, 'cart-body', { bevel: .02, roughness: .5 });
  for (let i = 0; i < 4; i++) {
    const y = .25 + i * .18;
    block(cart, [.54, .155, .02], [0, y, .232], drawers, 'cart-drawer', { bevel: .006, roughness: .45 });
    block(cart, [.18, .02, .02], [0, y + .03, .25], p.trim, 'cart-drawer-handle', { metalness: .3, roughness: .4 });
  }
  block(cart, [.66, .03, .5], [0, .945, 0], p.trim, 'cart-tray', { bevel: .01 });
  for (const z of [-.24, .24]) block(cart, [.66, .05, .02], [0, .985, z], p.trim, 'cart-tray-rim');
  for (const x of [-.32, .32]) block(cart, [.02, .05, .5], [x, .985, 0], p.trim, 'cart-tray-rim');
  const bar = cylinder(cart, .018, .5, 0, p.structure, 'cart-push-handle', { segments: 10 }); bar.rotation.z = Math.PI / 2; bar.position.set(0, .95, -.33);
  for (const x of [-.22, .22]) block(cart, [.025, .025, .1], [x, .95, -.28], p.structure, 'cart-push-handle');
  anchor(cart, 'handle', [0, .95, -.33]); anchor(cart, 'top', [0, .96, 0]);
  return cart;
}

/**
 * Commercial kitchen line, 2.4 m along x, with the cook at +z. Cooking adds burners, pots and an extraction hood;
 * prep adds a cutting board, bowls and a shelf of jars. Orders and timing stay host data. Color changes the tiled backsplash.
 */
export function createKitchenStation(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['cooking', 'prep'] as const, 'kitchen station'), p = kitPalette(node, context), tiles = node.materials?.surface ?? node.color ?? p.surface;
  const steel = { metalness: .4, roughness: .35 }, station = new THREE.Group(); station.name = `kitchen-station-${variant}`;
  block(station, [2.36, .1, .7], [0, .05, .02], p.screen, 'kitchen-plinth');
  block(station, [2.4, .75, .75], [0, .475, 0], p.trim, 'kitchen-cabinet', { bevel: .01, ...steel });
  for (const x of [-.6, 0, .6]) block(station, [.006, .66, .006], [x, .48, .377], p.structure, 'kitchen-door-seam');
  for (const x of [-.9, -.3, .3, .9]) block(station, [.3, .02, .03], [x, .78, .39], p.structure, 'kitchen-handle', steel);
  block(station, [2.44, .05, .8], [0, .875, 0], p.trim, 'kitchen-worktop', steel);
  block(station, [2.44, .9, .04], [0, 1.35, -.4], tiles, 'kitchen-backsplash', { roughness: .3 });
  const grout: number[] = []; gridWires(grout, [0, 1.35, -.377], [2.44, .9], .15, 'z'); wires(station, grout, '#b9c3cf', 'kitchen-grout');
  if (variant === 'cooking') {
    for (const x of [-.9, -.45]) for (const z of [-.17, .17]) {
      const ring = part(station, new THREE.TorusGeometry(.09, .018, 6, 18), p.screen, 'kitchen-burner'); ring.rotation.x = Math.PI / 2; ring.position.set(x, .91, z);
      block(station, [.24, .012, .02], [x, .925, z], p.screen, 'kitchen-grate'); block(station, [.02, .012, .24], [x, .925, z], p.screen, 'kitchen-grate');
    }
    for (const [x, z, radius, height] of [[-.9, .17, .15, .18], [-.45, -.17, .12, .1]] as const) {
      cylinder(station, radius, height, .93 + height / 2, p.trim, 'kitchen-pot', { segments: 20, ...steel }).position.set(x, .93 + height / 2, z);
      block(station, [.16, .02, .03], [x + radius + .07, .93 + height - .03, z], p.structure, 'kitchen-pot-handle');
    }
    for (let i = 0; i < 4; i++) cylinder(station, .022, .03, .66, p.screen, 'kitchen-knob', { segments: 10 }).position.set(-1.05 + i * .2, .66, .39);
    // Extraction hood over the burners: a four-sided frustum turned 45°, with a duct to the ceiling line.
    const hood = part(station, new THREE.CylinderGeometry(.42, .85, .45, 4, 1), p.trim, 'kitchen-hood', { ...steel, flat: true }); hood.rotation.y = Math.PI / 4; hood.scale.z = .8; hood.position.set(-.67, 2.1, -.05);
    block(station, [.3, .5, .3], [-.67, 2.57, -.15], p.trim, 'kitchen-duct', steel);
    block(station, [.9, .02, .5], [.6, .91, .05], '#e3c9a2', 'kitchen-cutting-board', { bevel: .006, roughness: .8 });
  } else {
    block(station, [.6, .03, .4], [-.4, .915, .05], '#e3c9a2', 'kitchen-cutting-board', { bevel: .008, roughness: .8 });
    for (const [x, tone] of [[.35, '#9fcdb8'], [.75, '#f3b3a6']] as const) {
      part(station, new THREE.SphereGeometry(.14, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), p.surface, 'kitchen-bowl', { roughness: .3 }).position.set(x, 1.04, 0);
      cylinder(station, .12, .03, 1.02, tone, 'kitchen-bowl-contents', { segments: 16, roughness: .8 }).position.set(x, 1.02, 0);
    }
    block(station, [2.2, .03, .25], [0, 1.6, -.26], p.trim, 'kitchen-shelf', steel);
    for (let i = 0; i < 7; i++) cylinder(station, .05, .14, 1.685, ['#e3c27a', '#d65b5b', '#9fcdb8', '#c9d4e2'][i % 4], 'kitchen-jar', { segments: 12, roughness: .3 }).position.set(-.9 + i * .3, 1.685, -.27);
  }
  anchor(station, 'cook', [0, 0, .75]);
  return station;
}
