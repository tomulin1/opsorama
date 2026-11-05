import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { resolveLabPalette, type MaterialContext } from './laboratory';
import { anchor, block, cylinder, part } from './parts';
import { createVehicleOperator, WORKER_SEAT_HEIGHT } from './worker';
import { driveForks } from './forks';

export type LoadingDockVariant = 'closed' | 'open';
/** `empty` (default) shows the vacant seat; `operated` seats a static driver in a high-visibility vest (scene warning role). */
export type ForkliftVariant = 'empty' | 'operated';
/** Top of the forklift seat cushion, where the driver's hips rest. */
const FORKLIFT_SEAT_TOP = 1.135;

/** Local bounds and connection points describe geometry, never reservations or automatic attachments. */
function finish(group: THREE.Group): THREE.Group {
  anchor(group, 'base', [0, 0, 0]);
  const bounds = new THREE.Box3().setFromObject(group);
  group.userData.logisticsBounds = { min: bounds.min.toArray(), max: bounds.max.toArray() };
  anchor(group, 'label', [0, bounds.max.y + .25, 0]);
  return group;
}

/** Forklift extracted from the warehouse silhouette, with an optional seated driver. `forks` raises the fork carriage; the `load` and `front` anchors move with it. */
export function createForklift(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant: string = node.variant ?? 'empty';
  if (variant !== 'empty' && variant !== 'operated') throw new Error(`Unknown forklift variant: ${variant}. Use empty or operated.`);
  const p = resolveLabPalette(node, context), group = new THREE.Group(); group.name = 'forklift';
  block(group, [1.05, .65, 1.6], [0, .57, 0], p.accent, 'forklift-body', { bevel: .06, roughness: .45 });
  // Rounded counterweight at the rear, steering wheel on a column, rear lamps.
  block(group, [1.09, .58, .24], [0, .56, -.7], p.structure, 'forklift-counterweight', { bevel: .1 });
  const column = cylinder(group, .025, .4, 1.12, p.structure, 'forklift-steering', { segments: 8 }); column.position.z = .32; column.rotation.x = -.5;
  const steering = part(group, new THREE.TorusGeometry(.13, .018, 6, 18), p.structure, 'forklift-steering'); steering.rotation.x = Math.PI / 2 - .5; steering.position.set(0, 1.3, .24);
  for (const x of [-.4, .4]) block(group, [.12, .07, .03], [x, .78, -.825], p.critical, 'forklift-rear-lamp');
  block(group, [1, .24, .9], [0, .34, .55], p.surface, 'forklift-chassis');
  block(group, [.48, .35, .42], [0, .96, 0], p.structure, 'forklift-seat', { bevel: .05 });
  block(group, [.46, .6, .15], [0, 1.24, -.26], p.structure, 'forklift-seat-back', { bevel: .05 });
  // The driver's shoes rest in the footwell below the seat, hidden by the body.
  if (variant === 'operated') { const driver = createVehicleOperator(node.id, 'seated', { theme: context?.theme ?? 'light', palette: { ...context?.palette, ...node.materials } }); driver.position.set(0, FORKLIFT_SEAT_TOP - WORKER_SEAT_HEIGHT, .02); group.add(driver); }
  for (const x of [-.48, .48]) for (const z of [-.55, .55]) block(group, [.07, 1.65, .07], [x, 1.44, z], p.structure, 'forklift-cage');
  block(group, [1.17, .12, 1.45], [0, 2.25, 0], p.structure, 'forklift-roof');
  for (const x of [-.3, 0, .3]) block(group, [.05, .08, 1.3], [x, 2.33, 0], p.trim, 'forklift-roof-rib');
  const carriage = new THREE.Group(); carriage.name = 'forklift-fork-carriage'; group.add(carriage);
  for (const x of [-.36, .36]) {
    block(group, [.12, 1.75, .12], [x, 1.1, .91], p.structure, 'forklift-mast');
    block(carriage, [.15, .08, 1.2], [x, .23, 1.5], p.trim, 'forklift-fork', { metalness: .3, roughness: .45 });
    block(carriage, [.15, .55, .06], [x, .48, .96], p.trim, 'forklift-fork-shank', { metalness: .3, roughness: .45 });
  }
  // Mast cross-ties and a load backrest on the fork carriage.
  for (const y of [.62, 1.35, 1.92]) block(group, [.84, .07, .08], [0, y, .91], p.structure, 'forklift-mast-tie');
  for (const y of [.36, .9]) block(carriage, [.9, .06, .05], [0, y, 1.0], p.trim, 'forklift-backrest');
  for (const x of [-.3, 0, .3]) block(carriage, [.04, .6, .04], [x, .63, 1.0], p.trim, 'forklift-backrest');
  for (const x of [-.56, .56]) for (const z of [-.55, .53]) {
    const tire = part(group, new THREE.CylinderGeometry(.274, .274, .173, 16), p.structure, 'forklift-tire');
    tire.rotation.z = Math.PI / 2; tire.position.set(x, .274, z);
    const hub = part(group, new THREE.CylinderGeometry(.15, .15, .184, 16), p.trim, 'forklift-hub', { metalness: .3, roughness: .4 });
    hub.rotation.z = Math.PI / 2; hub.position.copy(tire.position);
  }
  anchor(carriage, 'load', [0, .27, 1.5]); anchor(carriage, 'front', [0, .27, 2.1]);
  driveForks(group, node, [carriage], ({ height }) => { carriage.position.y = height; });
  return finish(group);
}

/** A standalone dock with a static shutter and an approach anchor; cargo is a separate node. */
export function createLoadingDock(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant: string = node.variant ?? 'closed';
  if (variant !== 'closed' && variant !== 'open') throw new Error(`Unknown loading dock variant: ${variant}.`);
  const p = resolveLabPalette(node, context), group = new THREE.Group(); group.name = 'loading-dock';
  block(group, [3.6, .08, 1.2], [0, .04, 0], p.surface, 'dock-base');
  // Steel leveler plate with a hinged lip in front of the door.
  block(group, [2.4, .02, .9], [0, .09, .1], p.trim, 'dock-leveler', { metalness: .3, roughness: .5 });
  block(group, [2.4, .03, .14], [0, .085, .6], p.trim, 'dock-leveler', { metalness: .3, roughness: .5 }).rotation.x = .3;
  for (const x of [-1.6, 1.6]) block(group, [.35, 3.2, .3], [x, 1.68, -.4], p.accent, 'dock-frame');
  block(group, [3.55, .25, .3], [0, 3.15, -.4], p.accent, 'dock-header');
  // Black compression seal pads around the opening.
  for (const x of [-1.39, 1.39]) block(group, [.12, 2.9, .14], [x, 1.5, -.2], p.screen, 'dock-seal', { roughness: .95, bevel: .03 });
  block(group, [2.9, .16, .14], [0, 2.95, -.2], p.screen, 'dock-seal', { roughness: .95, bevel: .03 });
  const height = variant === 'open' ? .5 : 2.65, y = variant === 'open' ? 2.775 : 1.45;
  block(group, [2.7, height, .21], [0, y, -.28], p.structure, 'dock-shutter');
  const ribs = variant === 'open' ? 2 : 12;
  for (let i = 0; i < ribs; i++) block(group, [2.65, .025, .03], [0, y - height / 2 + .1 + i * .205, -.16], p.trim, 'dock-shutter-rib');
  for (const x of [-1.5, 1.5]) {
    block(group, [.19, .65, .25], [x, .405, .06], p.structure, 'dock-bumper');
    block(group, [.25, .12, .32], [x, .74, .06], p.trim, 'dock-bumper-cap');
  }
  block(group, [.7, .24, .04], [0, 3.15, -.22], p.screen, 'dock-sign');
  block(group, [.45, .035, .01], [0, 3.15, -.195], p.text, 'dock-sign-mark');
  anchor(group, 'entrance', [0, .08, 0]); anchor(group, 'approach', [0, 0, 3.2]);
  return finish(group);
}

/** 20 ft ISO container in metres: outer `length`, `width` and `height`, and the `floor` interior above `floorTop`. */
export const SHIPPING_CONTAINER = Object.freeze({ length: 6.058, width: 2.438, height: 2.591, floorTop: .16, floor: Object.freeze({ length: 5.9, width: 2.35, clearHeight: 2.39 }) });

/** Ribbed 20 ft ISO container with its doors toward +z, with branding and contents supplied by the host separately. The corner castings define the outer size. */
export function createShippingContainer(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = resolveLabPalette(node, context), group = new THREE.Group(); group.name = 'shipping-container';
  const { length, width, height, floorTop } = SHIPPING_CONTAINER, end = length / 2, side = width / 2, corner = .09;
  block(group, [2.34, 2.45, length - .208], [0, 1.275, 0], p.accent, 'container-body', { roughness: .55 });
  // ISO corner castings and bottom side rails.
  for (const x of [-side + corner, side - corner]) for (const y of [corner, height - corner]) for (const z of [-end + corner, end - corner]) block(group, [.18, .18, .18], [x, y, z], p.structure, 'container-corner');
  for (const x of [-1.189, 1.189]) block(group, [.06, .14, 5.7], [x, .07, 0], p.structure, 'container-rail');
  for (const x of [-1.195, 1.195]) for (let i = 0; i < 29; i++) block(group, [.04, 2.3, .05], [x, 1.25, -2.8 + i * .2], p.trim, 'container-rib');
  block(group, [2.4, .08, 5.7], [0, height - .04, 0], p.structure, 'container-roof');
  for (const x of [-.58, .58]) {
    block(group, [1.14, 2.36, .025], [x, 1.27, 2.94], p.surface, 'container-door');
    // Two locking rods per door with cam handles, plus door hinges on the outer edge.
    for (const dx of [-.25, .25]) {
      block(group, [.04, 2.05, .04], [x + dx, 1.2, 2.97], p.trim, 'container-lock', { metalness: .3, roughness: .4 });
      block(group, [.04, .3, .03], [x + dx + .04, 1, 2.995], p.trim, 'container-lock-handle').rotation.z = .6;
    }
    for (const y of [.45, 1.2, 1.95]) block(group, [.06, .12, .05], [x * 1.97, y, 2.965], p.structure, 'container-hinge');
  }
  anchor(group, 'entrance', [0, 0, end]); anchor(group, 'load', [0, floorTop, 0]);
  return finish(group);
}
