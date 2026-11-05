import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { anchor, block, cylinder, merged, part, voltageSign } from './parts';
import { resolveLabPalette, type MaterialContext } from './laboratory';

export type AisleContainmentVariant = 'portal' | 'roof';
function palette(node: AssetNode, context?: MaterialContext) { return resolveLabPalette({ ...node, color: undefined }, context); }
function finish(group: THREE.Group) {
  group.updateMatrixWorld(true); group.userData.facilityBounds = new THREE.Box3().setFromObject(group);
  return group;
}
/** Generic enclosed standby set: no capacity, emissions, fuel or running simulation. */
export function createGeneratorSet(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), group = new THREE.Group(); group.name = 'generator-set';
  const body = node.materials?.surface ?? node.color ?? p.surface;
  block(group, [6, .25, 2.5], [0, .125, 0], p.structure, 'generator-skid');
  block(group, [5.8, 2.45, 2.3], [0, 1.475, 0], body, 'generator-enclosure', { bevel: .04, roughness: .55 });
  // Radiator grille on the cooling end and lifting eyes on the roof.
  block(group, [.03, 1.6, 1.7], [2.91, 1.45, 0], p.screen, 'generator-radiator');
  for (let i = 0; i < 9; i++) block(group, [.04, .03, 1.66], [2.93, .8 + i * .16, 0], p.trim, 'generator-radiator-louver');
  for (const x of [-2.6, 2.6]) for (const z of [-.95, .95]) { const eye = part(group, new THREE.TorusGeometry(.07, .02, 6, 12), p.structure, 'generator-lifting-eye'); eye.position.set(x, 2.77, z); }
  for (const x of [-2, 0, 2]) {
    block(group, [1.55, 1.9, .025], [x, 1.45, 1.164], p.structure, 'generator-service-panel');
    block(group, [.08, .32, .04], [x + .5, 1.45, 1.19], p.trim, 'generator-handle', { metalness: .3, roughness: .4 });
    for (const y of [.75, 2.15]) block(group, [.05, .12, .04], [x - .76, y, 1.185], p.structure, 'generator-hinge');
    for (let i = 0; i < 6; i++) block(group, [.85, .045, .03], [x - .1, .85 + i * .18, 1.185], p.trim, 'generator-louver');
  }
  block(group, [.45, .3, .035], [-2.25, 2.25, 1.19], p.screen, 'generator-control');
  voltageSign(group, [1.6, 2.12, 1.177], .32, { sign: p.warning, bolt: p.screen }, 'generator');
  const stack = cylinder(group, .13, .7, 2.95, p.structure, 'generator-exhaust', { metalness: .3, roughness: .45 }); stack.position.x = 1.8;
  const silencer = cylinder(group, .22, 1.3, 2.9, p.trim, 'generator-silencer', { metalness: .3, roughness: .45 }); silencer.rotation.z = Math.PI / 2; silencer.position.set(.9, 2.95, 0);
  block(group, [.5, .12, .5], [1.8, 3.32, 0], p.trim, 'generator-rain-cap');
  anchor(group, 'power-out', [-2.9, .45, -.7]); anchor(group, 'service', [0, 0, 1.3]); anchor(group, 'exhaust', [1.8, 3.4, 0]);
  return finish(group);
}
/** Generic outdoor chiller with six decorative roof fans, always static. */
export function createAirCooledChiller(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), group = new THREE.Group(); group.name = 'air-cooled-chiller';
  const body = node.materials?.surface ?? node.color ?? p.surface;
  for (const x of [-3.4, 0, 3.4]) block(group, [.2, .3, 2.6], [x, .15, 0], p.structure, 'chiller-foot');
  block(group, [8, .2, 2.8], [0, .4, 0], p.structure, 'chiller-frame');
  block(group, [7.8, 1.8, 2.6], [0, 1.4, 0], body, 'chiller-housing', { roughness: .55 });
  for (const x of [-3.88, 3.88]) for (const z of [-1.28, 1.28]) block(group, [.1, 1.86, .1], [x, 1.4, z], p.structure, 'chiller-post');
  for (const z of [-1.32, 1.32]) {
    block(group, [7.5, 1.45, .025], [0, 1.4, z], p.screen, 'chiller-coil');
    for (let x = -3.4; x <= 3.4; x += .85) block(group, [.035, 1.45, .03], [x, 1.4, z * 1.01], p.trim, 'chiller-coil-rib');
  }
  for (const x of [-2.6, 0, 2.6]) for (const z of [-.67, .67]) {
    const fan = cylinder(group, .54, .055, 2.34, p.screen, 'chiller-fan', { segments: 24 }); fan.position.set(x, 2.34, z);
    // Static rotor blades under the guard, merged into one mesh per fan.
    const blades = [0, 1, 2, 3].map(i => new THREE.BoxGeometry(.16, .015, .42).translate(0, 0, .23).rotateX(.25).rotateY(i * Math.PI / 2 + .3).translate(x, 2.375, z));
    merged(group, [...blades, new THREE.CylinderGeometry(.09, .09, .04, 12).translate(x, 2.375, z)], p.trim, 'chiller-fan-blade');
    const rim = part(group, new THREE.TorusGeometry(.53, .035, 6, 20), p.trim, 'chiller-fan-rim'); rim.rotation.x = Math.PI / 2; rim.position.set(x, 2.38, z);
    for (const angle of [0, Math.PI / 3, -Math.PI / 3]) block(group, [.9, .025, .055], [x, 2.39, z], p.trim, 'chiller-fan-guard').rotation.y = angle;
  }
  anchor(group, 'supply', [-4.1, .7, -.55]); anchor(group, 'return', [-4.1, .7, .55]); anchor(group, 'service', [0, 0, 1.5]);
  return finish(group);
}
/** Three fixed switchgear bays. Decorative doors are not a circuit/module count. */
export function createElectricalSwitchgear(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), group = new THREE.Group(); group.name = 'electrical-switchgear';
  const body = node.materials?.surface ?? node.color ?? p.surface;
  block(group, [3.6, .15, 1], [0, .075, 0], p.structure, 'switchgear-plinth');
  block(group, [3.6, 2.2, 1], [0, 1.25, 0], body, 'switchgear-housing', { bevel: .02, roughness: .5 });
  for (const x of [-1.2, 0, 1.2]) {
    block(group, [1.08, 2.04, .025], [x, 1.25, .515], p.trim, 'switchgear-door');
    block(group, [.25, .2, .025], [x, 1.85, .54], p.screen, 'switchgear-meter');
    block(group, [.08, .3, .04], [x + .38, 1.2, .55], p.structure, 'switchgear-handle');
    voltageSign(group, [x, .72, .528], .28, { sign: p.warning, bolt: p.screen }, 'switchgear');
    for (let i = 0; i < 4; i++) block(group, [.6, .025, .02], [x, .3 + i * .07, .535], p.structure, 'switchgear-vent');
    for (const y of [.5, 2]) block(group, [.04, .1, .04], [x - .52, y, .54], p.structure, 'switchgear-hinge');
  }
  anchor(group, 'power-in', [-1.8, .3, -.5]); anchor(group, 'power-out', [1.8, .3, -.5]); anchor(group, 'service', [0, 0, .7]);
  return finish(group);
}
/** Enclosed battery-string cabinet; six decorative panels are not runtime or charge. */
export function createBatteryBank(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = palette(node, context), group = new THREE.Group(); group.name = 'battery-bank';
  const body = node.materials?.surface ?? node.color ?? p.surface;
  block(group, [1.2, .12, .9], [0, .06, 0], p.structure, 'battery-plinth');
  block(group, [1.2, 1.9, .9], [0, 1.07, 0], body, 'battery-housing', { bevel: .02, roughness: .5 });
  for (let i = 0; i < 5; i++) block(group, [.8, .02, .02], [0, 1.82 + i * .025 - .05, .462], p.structure, 'battery-vent');
  for (let i = 0; i < 6; i++) {
    block(group, [1.08, .24, .02], [0, .3 + i * .27, .46], p.trim, 'battery-panel');
    block(group, [.34, .035, .03], [0, .3 + i * .27, .485], p.structure, 'battery-handle');
  }
  voltageSign(group, [.47, 1.95, .451], .16, { sign: p.warning, bolt: p.screen }, 'battery');
  anchor(group, 'dc-out', [0, .25, -.46]); anchor(group, 'service', [0, 0, .6]);
  return finish(group);
}
/** Fixed 1.8 m clear portal or 2.4 m roof module; no door mechanism or airflow solver. */
export function createAisleContainment(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = node.variant ?? 'portal';
  if (variant !== 'portal' && variant !== 'roof') throw new Error(`Unknown aisle containment variant: ${variant}.`);
  const p = palette(node, context), group = new THREE.Group(); group.name = `aisle-containment-${variant}`;
  const frame = node.materials?.trim ?? node.color ?? p.trim;
  if (variant === 'roof') {
    for (const z of [-.95, .95]) block(group, [2.4, .1, .08], [0, .05, z], frame, 'containment-frame');
    for (const x of [-1.16, 1.16]) block(group, [.08, .1, 1.9], [x, .05, 0], frame, 'containment-frame');
    block(group, [2.24, .025, 1.82], [0, .06, 0], p.glass, 'containment-roof', { opacity: .18 });
    anchor(group, 'start', [-1.2, 0, 0]); anchor(group, 'end', [1.2, 0, 0]);
  } else {
    for (const x of [-.945, .945]) block(group, [.09, 2.55, .16], [x, 1.275, 0], frame, 'containment-frame');
    block(group, [1.98, .12, .16], [0, 2.61, 0], frame, 'containment-header');
    for (const x of [-.445, .445]) {
      block(group, [.88, 2.45, .035], [x, 1.275, 0], p.glass, 'containment-door', { opacity: .16, roughness: .1 });
      block(group, [.88, .14, .045], [x, .12, 0], frame, 'containment-kick-plate');
      for (const edge of [-.43, .43]) block(group, [.025, 2.45, .045], [x + edge, 1.275, 0], frame, 'containment-door-edge');
    }
    block(group, [1.8, .05, .06], [0, 2.52, .06], p.structure, 'containment-track');
    for (const x of [-.07, .07]) block(group, [.025, .28, .04], [x, 1.1, .045], p.structure, 'containment-handle');
    anchor(group, 'entry', [0, 0, .3]); anchor(group, 'roof', [0, 2.67, 0]);
  }
  return finish(group);
}
