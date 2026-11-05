import * as THREE from 'three';
import { isPersonAsset, PERSON_ASSETS, validatePersonOptions, type AssetNode } from '@opsorama/core';
import { anchor } from './parts';
import { objectPalette } from './object-palette';
import type { MaterialContext } from './laboratory';
import { setAssetAnimator } from './animation';
import { createHairCap, createLongHair, fabric as box, FEMININE_NARROWING, FEMININE_SCALE, personLooks } from './people';
/** Poses shared by every person asset (`PERSON_ASSETS`). */
export const WORKER_VARIANTS = ['working', 'carrying', 'holding', 'walking', 'idle', 'seated', 'pushing', 'picking', 'placing'] as const;
/** `holding` has the carrying arms without the built-in box, for items attached at the `carry` anchor. */
export type WorkerVariant = typeof WORKER_VARIANTS[number];
/** Seated hips rest at this height, matching the seat anchors of desk pods and meeting tables. */
export const WORKER_SEAT_HEIGHT = .52;
/** Pose of an operator built into a vehicle model: seated on a forklift seat or standing at a reach-truck console. */
export type VehicleOperatorPose = 'seated' | 'standing';
/**
 * A static operator figure for the `operated` variant of a vehicle model. It inherits the scene palette like a
 * standalone worker, except that the shirt uses the `warning` role as a high-visibility vest so the operator stands out
 * from the vehicle body. It has no animator (the vehicle stays a static model) and loses the worker anchors, so the vehicle
 * keeps only its own named anchors. The figure faces +z with its feet (or, seated, its shoes) at the group origin.
 */
export function createVehicleOperator(vehicleId: string, pose: VehicleOperatorPose, context?: MaterialContext): THREE.Group {
  const group = new THREE.Group(); group.name = 'vehicle-operator';
  const id = `${vehicleId}:operator`, vest = objectPalette({ id, kind: 'asset', asset: 'worker' }, context).warning;
  group.add(createPerson({ id, kind: 'asset', asset: 'worker', variant: pose === 'seated' ? 'seated' : 'working', materials: { accent: vest }, localMotion: false }, context));
  const anchors: THREE.Object3D[] = []; group.traverse(child => { if (child.name.startsWith('anchor-')) anchors.push(child); });
  anchors.forEach(child => child.removeFromParent());
  return group;
}
/**
 * Builds any person asset (`PERSON_ASSETS`): one rig with the shared poses, anchors and animator, dressed by the
 * character's look in `people.ts`. The palette resolves with the look's definition defaults and `color` role.
 */
export function createPerson(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  if (!isPersonAsset(node.asset)) throw new Error(`Unknown person asset: ${node.asset}. Use one of ${PERSON_ASSETS.join(', ')}.`);
  const variant = (node.variant || 'working') as WorkerVariant;
  if (!(WORKER_VARIANTS as readonly string[]).includes(variant)) throw new Error(`Unknown ${node.asset} variant: ${node.variant}. Use one of ${WORKER_VARIANTS.join(', ')}.`);
  if (node.person !== undefined) validatePersonOptions(node.person);
  const look = personLooks[node.asset], feminine = node.person?.figure === 'feminine', narrow = feminine ? FEMININE_NARROWING : 0;
  const object = new THREE.Group(), rig = new THREE.Group(); rig.name = 'worker-rig'; object.add(rig);
  const seated = variant === 'seated'; if (seated) rig.position.y = WORKER_SEAT_HEIGHT - .77;
  const p = objectPalette(node, context, look.colorRole, look.defaults), skin = p.skin, clothes = look.clothes(p, feminine ? 'feminine' : 'masculine'), { shoes } = clothes;
  // Below a skirt the legs show skin.
  const trousers = clothes.skirt ? skin : clothes.trousers;
  box(rig, [.47 - narrow, .52, .31], [0, 1.01, 0], clothes.shirt, .06);
  box(rig, [.45 - narrow, .055, .29], [0, .77, 0], clothes.belt, .015);
  box(rig, [.22, .05, .2], [0, 1.27, 0], clothes.collar ?? clothes.shirt, .02);
  box(rig, [.15, .13, .14], [0, 1.33, 0], skin, .04);
  const head = new THREE.Group(); head.name = 'worker-head'; head.position.y = 1.5; rig.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.205, 12, 8), new THREE.MeshStandardMaterial({ color: skin, roughness: .85 })); face.scale.set(.88, 1.1, .9); face.castShadow = true; head.add(face);
  head.add(feminine ? createLongHair(p.hair) : createHairCap(p.hair));
  for (const x of [-.065, .065]) box(head, [.026, .027, .018], [x, .015, .177], p.hair);
  // Long hair covers the ears, so the feminine figure has none.
  if (!feminine) for (const x of [-.18, .18]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), new THREE.MeshStandardMaterial({ color: skin, roughness: .85 })); ear.scale.set(.5, 1, .8); ear.position.set(x, -.005, 0); head.add(ear); }
  box(head, [.035, .045, .03], [0, -.025, .19], skin, .01);
  box(head, [.06, .017, .015], [0, -.075, .176], p.skin);
  const legs: THREE.Group[] = [], arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    // The narrower feminine hips bring the legs in like the shoulders, so the belt and a skirt cover them at the sides.
    const leg = new THREE.Group(); leg.name = side < 0 ? 'worker-left-leg' : 'worker-right-leg'; leg.position.set(side * (.13 - narrow / 2), .77, 0); rig.add(leg); legs.push(leg);
    // Seated legs bend at the knee so the shoes still reach the floor below the seat.
    if (seated) { box(leg, [.17, .18, .46], [0, -.02, .2], trousers, .04); box(leg, [.16, .42, .17], [0, -.29, .4], trousers, .04); box(leg, [.19, .11, .3], [0, -.465, .46], shoes, .035); }
    // Standing soles rest on the floor at the pivot, like the seated ones.
    else { box(leg, [.17, .665, .18], [0, -.3375, 0], trousers, .04); box(leg, [.19, .11, .3], [0, -.715, .055], shoes, .035); }
    const arm = new THREE.Group(); arm.name = side < 0 ? 'worker-left-arm' : 'worker-right-arm'; arm.position.set(side * (.295 - narrow / 2), 1.23, 0); rig.add(arm); arms.push(arm);
    box(arm, [.145, .31, .17], [0, -.16, 0], clothes.sleeve, .04);
    const forearm = new THREE.Group(); forearm.position.y = -.3; forearm.rotation.x = variant === 'carrying' || variant === 'holding' || variant === 'pushing' ? -.7 : variant === 'working' || seated ? -.45 : -.15; arm.add(forearm);
    box(forearm, [.115, .25, .13], [0, -.125, 0], clothes.forearm, .035); box(forearm, [.13, .11, .14], [0, -.29, .015], skin, .04);
    if (side === 1) anchor(forearm, 'hand', [0, -.29, .1]);
    arm.rotation.x = variant === 'carrying' || variant === 'holding' || variant === 'pushing' ? -.9 : ['working', 'picking', 'placing'].includes(variant) ? -.7 : seated ? -.55 : -.1;
  }
  // A knee-length skirt as wide as the shirt hangs over the thighs, or wraps the seated thighs up to the knees; either
  // way it covers the legs at the sides.
  if (clothes.skirt) { if (seated) box(rig, [.47 - narrow, .21, .45], [0, .77, .19], clothes.skirt, .03); else box(rig, [.47 - narrow, .34, .33], [0, .62, 0], clothes.skirt, .03); }
  look.dress?.({ rig, head, seated, narrow }, p);
  // The built-in carton uses the parcel's roles, so a scene palette restyles it with the parcels around it.
  if (variant === 'carrying') { box(rig, [.48, .33, .41], [0, 1.02, .49], p.surface, .02); box(rig, [.065, .34, .42], [0, 1.02, .49], p.trim); }
  // Base of a load held in front of the chest; it follows the rig, so carried items bob with the gait.
  anchor(rig, 'carry', [0, .84, .49]);
  // The feminine build scales the whole rig about the floor point; anchors inside the rig follow it.
  if (feminine) rig.scale.set(FEMININE_SCALE[0], seated ? 1 : FEMININE_SCALE[1], FEMININE_SCALE[2]);
  anchor(object, 'cart', [0, .055, 1.02]);
  let actionTime = 0;
  const phase = [...node.id].reduce((value, character) => value + character.charCodeAt(0), 0) % 17 / 3;
  const stand = () => { rig.position.set(0, seated ? WORKER_SEAT_HEIGHT - .77 : 0, 0); legs.forEach(leg => { leg.rotation.x = 0; }); };
  if (node.localMotion !== false) setAssetAnimator(object, ({ time, delta, locomotion }) => {
    const t = time + phase;
    if (variant === 'picking' || variant === 'placing') { actionTime = Math.min(1, actionTime + delta / .8); const reach = Math.sin(actionTime * Math.PI); arms.forEach(arm => { arm.rotation.x = -.7 - reach * .6; }); return; }
    head.rotation.y = Math.sin(t * .55) * .09;
    // A route follower owns the root transform: walk in place while travelling and stand at stops.
    if (locomotion && !seated) {
      const gait = Math.sin(t * 6.4), carry = variant === 'carrying' || variant === 'holding' || variant === 'pushing', working = variant === 'working';
      rig.position.z = 0; rig.position.y = locomotion.moving ? Math.abs(gait) * .02 : 0;
      if (!locomotion.moving) { stand(); if (working) { arms[0].rotation.x = -.7 + Math.sin(t * 2.2) * .11; arms[1].rotation.x = -.7 + Math.sin(t * 2.2 + .8) * .11; } else if (!carry) { arms[0].rotation.x = -.1; arms[1].rotation.x = -.1; } return; }
      legs[0].rotation.x = gait * .3; legs[1].rotation.x = -gait * .3;
      if (!carry) { arms[0].rotation.x = -.12 - gait * .26; arms[1].rotation.x = -.12 + gait * .26; }
      return;
    }
    if (variant === 'walking') {
      const gait = Math.sin(t * 3.2); rig.position.z = Math.sin(t * .65) * .48; rig.position.y = Math.abs(gait) * .018;
      legs[0].rotation.x = gait * .23; legs[1].rotation.x = -gait * .23; arms[0].rotation.x = -.12 - gait * .24; arms[1].rotation.x = -.12 + gait * .24;
    } else if (seated) {
      arms[0].rotation.x = -.55 + Math.sin(t * 5) * .04; arms[1].rotation.x = -.55 + Math.sin(t * 5 + 1.4) * .04;
    } else if (variant === 'working') {
      arms[0].rotation.x = -.7 + Math.sin(t * 2.2) * .11; arms[1].rotation.x = -.7 + Math.sin(t * 2.2 + .8) * .11;
    } else if (variant === 'carrying') {
      rig.position.z = Math.sin(t * .55) * .23; legs[0].rotation.x = Math.sin(t * 2.7) * .09; legs[1].rotation.x = -Math.sin(t * 2.7) * .09;
    }
  }, [rig, head, ...legs, ...arms]);
  return object;
}
