import * as THREE from 'three';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { setAssetAnimator } from '@opsorama/three';
import { anchor, block, cylinder, ITEM_TONES, part } from './parts';
import { resolveObjectColor, resolveObjectStateColor } from './object-palette';
import type { MaterialContext } from '@opsorama/three';

/** Open stacking tote. `count` fills 0–9 decorative item slots, three per row from back to front. */
export function createTote(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const tote = new THREE.Group(); tote.name = 'tote';
  const body = resolveObjectColor(node, context, 'accent', '#4f86d9');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions.tote);
  block(tote, [1.2, .06, .8], [0, .03, 0], body, 'tote-floor');
  for (const z of [-.37, .37]) {
    block(tote, [1.2, .55, .06], [0, .275, z], body, 'tote-wall');
    // Moulded vertical ribs stiffen the long walls.
    for (const x of [-.42, -.14, .14, .42]) block(tote, [.04, .44, .02], [x, .3, z + Math.sign(z) * .035], body, 'tote-wall-rib');
  }
  for (const x of [-.57, .57]) {
    block(tote, [.06, .55, .68], [x, .275, 0], body, 'tote-wall');
    block(tote, [.02, .08, .26], [x + Math.sign(x) * .031, .44, 0], '#2f3e52', 'tote-handle', { bevel: .01 });
  }
  block(tote, [.3, .12, .012], [-.3, .42, .406], '#eaf0f8', 'tote-label-holder');
  for (const z of [-.39, .39]) block(tote, [1.26, .04, .05], [0, .57, z], '#eaf0f8', 'tote-rim');
  for (const x of [-.6, .6]) block(tote, [.05, .04, .83], [x, .57, 0], '#eaf0f8', 'tote-rim');
  for (let i = 0; i < count; i++) {
    const item = block(tote, [.3, .48, .17], [(i % 3 - 1) * .34, .3, (Math.floor(i / 3) - 1) * .21], ITEM_TONES[i % 3], `count-part-${i}`, { bevel: .015 });
    item.rotation.y = (i % 2 ? 1 : -1) * .06;
  }
  anchor(tote, 'top', [0, .59, 0]);
  return tote;
}

export type ConveyorVariant = 'straight' | 'curve';
const BELT_TOP = .83, CURVE_CENTER = -.75, MARKERS = 5;
function chevron(group: THREE.Object3D, index: number): THREE.Group {
  const marker = new THREE.Group(); marker.name = `conveyor-marker-${index}`; group.add(marker);
  for (const side of [-1, 1]) block(marker, [.045, .015, .3], [side * .1, .008, 0], '#f3f6fb', 'conveyor-chevron').rotation.y = -side * Math.PI / 4;
  return marker;
}

/**
 * Straight segment runs 4 m from the entry anchor (-z) to the exit anchor (+z).
 * The curve turns 90° left inside a 1.5 m square: it enters along +z and exits along -x.
 * Markers show the flow direction when static; optional motion slides them and spins rollers. Inactive stops the belt.
 */
export function createConveyor(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = (node.variant ?? 'straight') as ConveyorVariant;
  if (variant !== 'straight' && variant !== 'curve') throw new Error(`Unknown conveyor variant: ${node.variant}.`);
  const conveyor = new THREE.Group(); conveyor.name = `conveyor-${variant}`;
  const frame = resolveObjectStateColor(node, context, resolveObjectColor(node, context, 'structure', '#6a7f9c')), markers = Array.from({ length: MARKERS }, (_, i) => chevron(conveyor, i));
  const legs = (x: number, z: number) => { block(conveyor, [.12, .02, .12], [x, .01, z], '#3a4656', 'conveyor-foot'); return block(conveyor, [.07, BELT_TOP - .09, .07], [x, (BELT_TOP - .09) / 2, z], '#4b5a6e', 'conveyor-leg'); };
  const rollers: THREE.Mesh[] = [];
  let place: (marker: THREE.Object3D, progress: number) => void;
  if (variant === 'straight') {
    block(conveyor, [1, .06, 4], [0, BELT_TOP - .03, 0], '#3a4656', 'conveyor-belt', { roughness: .9 });
    for (const x of [-.55, .55]) {
      block(conveyor, [.08, .18, 4], [x, BELT_TOP - .02, 0], frame, 'conveyor-frame');
      block(conveyor, [.03, .03, 3.9], [x, BELT_TOP + .14, 0], '#c3cedc', 'conveyor-guide', { metalness: .3, roughness: .4 });
      for (const z of [-1.6, 0, 1.6]) block(conveyor, [.025, .1, .025], [x, BELT_TOP + .08, z], '#7f8ea3', 'conveyor-guide-post');
    }
    const motor = cylinder(conveyor, .1, .26, 0, '#4b5a6e', 'conveyor-motor', { segments: 14 }); motor.rotation.z = Math.PI / 2; motor.position.set(.72, BELT_TOP - .1, -1.85);
    block(conveyor, [.12, .14, .14], [.62, BELT_TOP - .1, -1.85], '#3a4656', 'conveyor-gearbox');
    for (const z of [-1.5, 1.5]) { for (const x of [-.5, .5]) legs(x, z); block(conveyor, [1, .06, .06], [0, .3, z], '#4b5a6e', 'conveyor-brace'); }
    for (const z of [-1.96, 1.96]) {
      const roller = part(conveyor, new THREE.CylinderGeometry(.065, .065, 1.02, 12), '#c3cedc', 'conveyor-roller');
      roller.rotation.z = Math.PI / 2; roller.position.set(0, BELT_TOP - .04, z); rollers.push(roller);
    }
    anchor(conveyor, 'entry', [0, BELT_TOP, -2]); anchor(conveyor, 'exit', [0, BELT_TOP, 2]);
    place = (marker, progress) => marker.position.set(0, BELT_TOP, -1.7 + progress * 3.4);
  } else {
    const shape = new THREE.Shape(); shape.absarc(0, 0, 1.5, 0, Math.PI / 2, false); shape.absarc(0, 0, .5, Math.PI / 2, 0, true);
    const belt = part(conveyor, new THREE.ExtrudeGeometry(shape, { depth: .06, bevelEnabled: false, curveSegments: 20 }), '#3a4656', 'conveyor-belt');
    belt.rotation.x = Math.PI / 2; belt.position.set(CURVE_CENTER, BELT_TOP, CURVE_CENTER);
    const at = (radius: number, angle: number) => [CURVE_CENTER + radius * Math.cos(angle), CURVE_CENTER + radius * Math.sin(angle)] as const;
    for (const radius of [.46, 1.54]) for (let i = 0; i < 10; i++) {
      const angle = (i + .5) * Math.PI / 20, [x, z] = at(radius, angle);
      block(conveyor, [.08, .18, radius * Math.PI / 20 + .02], [x, BELT_TOP - .02, z], frame, 'conveyor-frame').rotation.y = -angle;
    }
    for (const angle of [Math.PI / 12, Math.PI / 4, 5 * Math.PI / 12]) for (const radius of [.55, 1.45]) legs(...at(radius, angle));
    const entry = at(1, 0), exit = at(1, Math.PI / 2);
    anchor(conveyor, 'entry', [entry[0], BELT_TOP, entry[1]]); anchor(conveyor, 'exit', [exit[0], BELT_TOP, exit[1]]);
    place = (marker, progress) => { const angle = (.08 + progress * .84) * Math.PI / 2, [x, z] = at(1, angle); marker.position.set(x, BELT_TOP, z); marker.rotation.y = -angle; };
  }
  markers.forEach((marker, i) => place(marker, i / MARKERS));
  if (node.state !== 'inactive') setAssetAnimator(conveyor, ({ time }) => {
    markers.forEach((marker, i) => place(marker, ((i / MARKERS + time * .12) % 1 + 1) % 1));
    rollers.forEach(roller => { roller.rotation.x = time * 3; });
  }, [...markers, ...rollers]);
  return conveyor;
}

export type GateVariant = 'closed' | 'open';
const BOOM_LENGTH = 3.2, OPEN_ANGLE = 1.35;
/**
 * Boom barrier across a 3 m passage centered on the origin; traffic passes from the entry anchor (−z) to exit (+z).
 * The host switches the variant; the lamp shows closed (red) or open (green) unless a warning/critical/inactive state overrides it.
 */
export function createGate(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = (node.variant ?? 'closed') as GateVariant;
  if (variant !== 'closed' && variant !== 'open') throw new Error(`Unknown gate variant: ${node.variant}.`);
  const gate = new THREE.Group(); gate.name = `gate-${variant}`;
  const housing = resolveObjectColor(node, context, 'structure', '#5a6b82'), lamp = resolveObjectStateColor(node, context, variant === 'open' ? '#3fb38c' : '#e35d5d');
  block(gate, [.5, .08, .5], [-1.75, .04, 0], '#9aa8ba', 'gate-footing');
  block(gate, [.4, 1, .4], [-1.75, .58, 0], housing, 'gate-housing', { bevel: .02 });
  block(gate, [.46, .06, .46], [-1.75, 1.11, 0], '#eaf0f8', 'gate-cap', { bevel: .015 });
  for (const z of [-.202, .202]) { block(gate, [.28, .7, .004], [-1.75, .55, z], '#3c4b60', 'gate-service-door'); block(gate, [.03, .06, .01], [-1.65, .6, z * 1.03], '#c3cedc', 'gate-lock'); }
  for (const x of [-1.95, -1.55]) for (const z of [-.2, .2]) cylinder(gate, .02, .02, .09, '#7f8ea3', 'gate-bolt', { segments: 8 }).position.set(x, .09, z);
  const light = part(gate, new THREE.SphereGeometry(.09, 12, 8), lamp, 'gate-lamp', { emissive: lamp, roughness: .35 }); light.position.set(-1.75, 1.2, 0);
  const boom = new THREE.Group(); boom.name = 'gate-boom'; boom.position.set(-1.55, .92, 0); boom.rotation.z = variant === 'open' ? OPEN_ANGLE : 0; gate.add(boom);
  block(boom, [BOOM_LENGTH, .09, .09], [BOOM_LENGTH / 2, 0, 0], '#f6f8fb', 'gate-arm', { bevel: .02 });
  block(boom, [.06, .1, .1], [BOOM_LENGTH - .03, 0, 0], '#e35d5d', 'gate-tip', { emissive: '#e35d5d' });
  for (let i = 0; i < 4; i++) block(boom, [.32, .095, .095], [.45 + i * .75, 0, 0], '#dc5b5b', 'gate-stripe');
  block(gate, [.12, .82, .12], [1.75, .41, 0], housing, 'gate-rest');
  block(gate, [.24, .03, .24], [1.75, .015, 0], '#9aa8ba', 'gate-rest-foot');
  for (const z of [-.08, .08]) block(gate, [.12, .12, .03], [1.75, .88, z], housing, 'gate-rest-fork');
  anchor(gate, 'entry', [0, 0, -1]); anchor(gate, 'exit', [0, 0, 1]);
  return gate;
}
