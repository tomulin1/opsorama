import * as THREE from 'three';
import type { MaterialContext } from './laboratory';
import { resolveObjectColor } from './object-palette';
import type { AssetNode } from '@opsorama/core';
import { WORKER_SEAT_HEIGHT } from './worker';
import { anchor, block, cylinder, part } from './parts';

/** Indoor plant: nine tilted leaves above a tapered pot. Color changes foliage. */
export function createPottedPlant(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const plant = new THREE.Group(); plant.name = 'potted-plant';
  const foliage = resolveObjectColor(node, context, 'foliage', '#6fae8f');
  cylinder(plant, .26, .42, .21, '#d9cfc2', 'plant-pot', { bottomRadius: .2, segments: 20, roughness: .55 });
  const rim = part(plant, new THREE.TorusGeometry(.26, .022, 8, 24), '#e4dbcf', 'plant-pot-rim', { roughness: .55 }); rim.rotation.x = Math.PI / 2; rim.position.y = .41;
  cylinder(plant, .24, .02, .42, '#6b5545', 'plant-soil', { segments: 16, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const yaw = new THREE.Group(); yaw.position.y = .42; yaw.rotation.y = i * Math.PI * 2 / 9 + (i % 2) * .2; plant.add(yaw);
    const tilt = new THREE.Group(); tilt.rotation.x = [.3, .65, .95][i % 3]; yaw.add(tilt);
    const leaf = part(tilt, new THREE.SphereGeometry(.5, 8, 6), foliage, 'plant-leaf', { roughness: .8 }); leaf.scale.set(.26, 1, .08); leaf.position.y = .45;
  }
  // Short upright sprouts fill the centre of the crown.
  for (let i = 0; i < 4; i++) { const sprout = part(plant, new THREE.SphereGeometry(.5, 8, 6), foliage, 'plant-sprout', { roughness: .8 }); sprout.scale.set(.14, .5, .05); sprout.rotation.set(.15, i * Math.PI / 2, (i % 2 ? 1 : -1) * .15); sprout.position.set(0, .66, 0); }
  return plant;
}

/** Two-seat bench facing +z; the seat top matches the seated-worker height. Color changes the slats. */
export function createBench(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const bench = new THREE.Group(); bench.name = 'bench';
  const wood = resolveObjectColor(node, context, 'wood', '#c69d6d'), frame = '#3a4656', seat = WORKER_SEAT_HEIGHT;
  for (const z of [-.14, 0, .14]) block(bench, [1.6, .04, .12], [0, seat - .02, z], wood, 'bench-slat', { bevel: .012, roughness: .8 });
  for (const y of [seat + .16, seat + .32]) block(bench, [1.6, .1, .04], [0, y, -.23], wood, 'bench-slat', { bevel: .012, roughness: .8 }).rotation.x = -.12;
  for (const x of [-.68, .68]) {
    block(bench, [.05, seat - .04, .05], [x, (seat - .04) / 2, .16], frame, 'bench-frame');
    block(bench, [.05, seat + .4, .05], [x, (seat + .4) / 2, -.22], frame, 'bench-frame');
    block(bench, [.05, .05, .44], [x, seat - .065, -.03], frame, 'bench-frame');
    // Armrest on each end and foot plates on the legs.
    block(bench, [.06, .04, .4], [x * 1.04, seat + .2, -.02], frame, 'bench-armrest', { bevel: .012 }); block(bench, [.04, .2, .04], [x * 1.04, seat + .09, .14], frame, 'bench-frame');
    for (const z of [.16, -.22]) block(bench, [.1, .015, .1], [x, .0075, z], frame, 'bench-foot');
  }
  for (const [index, x] of [-.4, .4].entries()) anchor(bench, `seat-${index}`, [x, seat, 0]);
  return bench;
}

/** Street or campus lamp with a warm, emissive diffuser facing down toward +z. It adds no scene light. */
export function createLampPost(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const lamp = new THREE.Group(); lamp.name = 'lamp-post';
  const pole = resolveObjectColor(node, context, 'structure', '#3a4656');
  cylinder(lamp, .16, .3, .15, pole, 'lamp-pole', { bottomRadius: .2, segments: 16, metalness: .2, roughness: .5 });
  cylinder(lamp, .045, 3.25, 1.925, pole, 'lamp-pole', { bottomRadius: .07, segments: 12, metalness: .2, roughness: .5 });
  for (const y of [.32, 2.2]) cylinder(lamp, .085, .06, y, pole, 'lamp-collar', { segments: 12, metalness: .2, roughness: .5 });
  block(lamp, [.05, .05, .72], [0, 3.5, .33], pole, 'lamp-pole', { bevel: .015 });
  block(lamp, [.32, .12, .42], [0, 3.44, .62], pole, 'lamp-head', { bevel: .035, metalness: .2, roughness: .5 });
  block(lamp, [.26, .02, .34], [0, 3.37, .62], '#ffe9b0', 'lamp-diffuser', { emissive: '#ffe9b0' });
  anchor(lamp, 'light', [0, 3.36, .62]);
  return lamp;
}
