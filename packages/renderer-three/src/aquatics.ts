import { validateOperatingProperties } from '@opsorama/core';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { setAssetAnimator } from './animation';
import type { MaterialContext } from './laboratory';
import { objectPalette } from './object-palette';
import { anchor, block, cylinder, merged, part, wires } from './parts';
import { variantOf } from './kit';

export type LapPoolVariant = 'open' | 'covered';
export type WadingPoolVariant = 'fountain' | 'still';
export type SwimmerVariant = 'freestyle' | 'floating';
export type SunLoungerVariant = 'reclined' | 'flat';

type Vec = readonly [number, number, number];
const metal = { metalness: .35, roughness: .3 } as const;
/** Natural tones that no palette role changes. */
const PLATE = '#fbfcfe', RESCUE = '#e8562f', ROPE_END = '#d6453d', RUBBER = '#2f3a46', LINE = '#e8eef2', DISPLAY = '#0f1c2b';
const lighter = (color: string, amount: number) => `#${new THREE.Color(color).lerp(new THREE.Color('#ffffff'), amount).getHexString()}`;
/** Cylinder between two points, for frames and rails; returns geometry for merging. */
function rod(a: Vec, b: Vec, radius: number, segments = 8): THREE.BufferGeometry {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), geometry = new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
  return geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
}
/** Deterministic sequence, so two instances of a model are identical. */
function seeded(seed: number): () => number { let value = seed; return () => (value = value * 16807 % 2147483647) / 2147483647; }

export const LAP_POOL = Object.freeze({ length: 25, width: 12.5, lanes: 6, lane: 2, side: .3, end: 1, coping: .14, water: .1, flags: 5 });
/** Centre z of a lane; lane 0 lies at +z, the right-hand lane seen from the −x start end. */
export const lapPoolLaneZ = (lane: number) => LAP_POOL.width / 2 - .25 - LAP_POOL.lane / 2 - lane * LAP_POOL.lane;
const LAP_TONES = { liquid: '#3aa3d6', surface: '#dff0f7', structure: '#e7e3da', accent: '#2f6fd6', trim: '#f5f7fa', screen: '#1f3a5f' } as const;
/**
 * 25 × 12.5 m lap pool with six 2 m lanes along x, built as a low-relief basin on the floor: coping at 0.14 m (1 m end
 * decks for starting blocks), a translucent water surface at 0.1 m over a tiled floor with lane markings, seven lane
 * ropes and backstroke flags 5 m from each end. `covered` lays a thermal cover instead of the ropes. Optional local
 * motion drifts light ripples on open water. Static otherwise; color changes the water.
 */
export function createLapPool(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['open', 'covered'] as const, 'lap pool'), p = objectPalette(node, context, 'liquid', LAP_TONES);
  const { length: L, width: W, lanes, lane, side, end, coping, water, flags } = LAP_POOL, pool = new THREE.Group(); pool.name = `lap-pool-${variant}`;
  block(pool, [L, .01, W], [0, .005, 0], p.surface, 'pool-floor', { roughness: .5 });
  merged(pool, [
    ...[-1, 1].map(s => new THREE.BoxGeometry(end, coping, W + 2 * side).translate(s * (L + end) / 2, coping / 2, 0)),
    ...[-1, 1].map(s => new THREE.BoxGeometry(L, coping, side).translate(0, coping / 2, s * (W + side) / 2)),
  ], p.structure, 'pool-coping', { roughness: .75 });
  // Dark waterline tiles on the inner walls and the lane lines with their T ends on the floor.
  merged(pool, [-1, 1].flatMap(s => [new THREE.BoxGeometry(L, .025, .01).translate(0, water + .012, s * (W / 2 - .005)), new THREE.BoxGeometry(.01, .025, W).translate(s * (L / 2 - .005), water + .012, 0)]), p.screen, 'pool-waterline');
  merged(pool, Array.from({ length: lanes }, (_, i) => lapPoolLaneZ(i)).flatMap(z => [new THREE.BoxGeometry(L - 4, .004, .25).translate(0, .012, z), ...[-1, 1].map(s => new THREE.BoxGeometry(.25, .004, 1).translate(s * (L / 2 - 2), .012, z))]), p.screen, 'pool-lane-marking', { roughness: .6 });
  block(pool, [L, .02, W], [0, water - .01, 0], p.liquid, 'pool-water', { opacity: .62, roughness: .08 });
  if (variant === 'open') {
    // Seven ropes of floats: accent and trim alternate, the last 5 m at each end are red.
    const floats: THREE.BufferGeometry[][] = [[], [], []];
    for (let r = 0; r <= lanes; r++) for (let k = 0; k < 100; k++) {
      const x = -L / 2 + .125 + k * .25;
      floats[Math.abs(x) > L / 2 - flags ? 2 : k % 2].push(new THREE.CylinderGeometry(.055, .055, .2, 8).rotateZ(Math.PI / 2).translate(x, water, W / 2 - .25 - r * lane));
    }
    [p.accent, p.trim, ROPE_END].forEach((tone, i) => merged(pool, floats[i], tone, 'pool-lane-rope', { roughness: .45 }));
    const random = seeded(7), ripples = merged(pool, Array.from({ length: 90 }, () => new THREE.BoxGeometry(.5 + random() * .9, .002, .035).translate((random() - .5) * (L - 2), water + .003, (random() - .5) * (W - 1))), '#ffffff', 'pool-ripple', { opacity: .3, roughness: .2 });
    setAssetAnimator(pool, ({ time }) => { ripples.position.set(Math.sin(time * .5) * .35, 0, Math.cos(time * .37) * .2); (ripples.material as THREE.MeshStandardMaterial).opacity = .24 + .1 * Math.sin(time * 1.3); }, [ripples]);
  } else {
    block(pool, [L, .02, W], [0, water + .012, 0], p.accent, 'pool-cover', { roughness: .6, opacity: .9 });
    merged(pool, Array.from({ length: 16 }, (_, i) => new THREE.BoxGeometry(.04, .004, W).translate(-L / 2 + (i + 1) * L / 17, water + .024, 0)), p.trim, 'pool-cover-seam');
  }
  // Backstroke flags: two posts per line just outside the side coping.
  const flagX = L / 2 - flags, postZ = W / 2 + side + .12, pennants: THREE.BufferGeometry[][] = [[], []], line: number[] = [];
  merged(pool, [-flagX, flagX].flatMap(x => [-postZ, postZ].flatMap(z => [new THREE.CylinderGeometry(.03, .03, 1.8, 10).translate(x, .9, z), new THREE.CylinderGeometry(.1, .12, .04, 14).translate(x, .02, z)])), p.structure, 'pool-flag-post', metal);
  for (const x of [-flagX, flagX]) {
    line.push(x, 1.76, -postZ, x, 1.76, postZ);
    for (let k = 0; k < 32; k++) pennants[k % 2].push(new THREE.ConeGeometry(.07, .2, 3).rotateX(Math.PI).translate(x, 1.66, -postZ + .25 + k * (2 * postZ - .5) / 31));
  }
  wires(pool, line, p.trim, 'pool-flag-line');
  merged(pool, pennants[0], p.accent, 'pool-pennant', { roughness: .7 }); merged(pool, pennants[1], p.trim, 'pool-pennant', { roughness: .7 });
  for (let i = 0; i < lanes; i++) {
    const z = lapPoolLaneZ(i);
    anchor(pool, `lane-${i}-start`, [-L / 2 - .3, coping, z]).rotation.y = Math.PI / 2;
    anchor(pool, `lane-${i}-end`, [L / 2 + .3, coping, z]).rotation.y = -Math.PI / 2;
  }
  ([[-1, 1], [1, 1], [-1, -1], [1, -1]] as const).forEach(([sx, sz], i) => { anchor(pool, `ladder-${i}`, [sx * (L / 2 - 1.5), 0, sz * (W + side) / 2]).rotation.y = sz > 0 ? Math.PI : 0; });
  anchor(pool, 'water', [0, water, 0]);
  return pool;
}

export const WADING_POOL = Object.freeze({ radius: 2.6, rim: .3, coping: .14, water: .09, mushroom: .95 });
const WADING_TONES = { liquid: '#47b4dc', surface: '#e6f4f8', structure: '#e7e3da', accent: '#f0a03c', trim: '#f5f7fa' } as const;
/**
 * Round wading pool, 5.2 m across inside a 0.3 m coping, with floor rings and a mushroom fountain at the centre.
 * `fountain` lets a water curtain fall from the cap; optional local motion ripples it and splashes droplets. `still`
 * keeps the mushroom dry. Color changes the water.
 */
export function createWadingPool(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['fountain', 'still'] as const, 'wading pool'), p = objectPalette(node, context, 'liquid', WADING_TONES);
  const { radius: R, rim, coping, water, mushroom: M } = WADING_POOL, pool = new THREE.Group(); pool.name = `wading-pool-${variant}`;
  const ring = new THREE.Shape().absarc(0, 0, R + rim, 0, Math.PI * 2, false); ring.holes.push(new THREE.Path().absarc(0, 0, R, 0, Math.PI * 2, true));
  part(pool, new THREE.ExtrudeGeometry(ring, { depth: coping, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2), p.structure, 'wading-coping', { roughness: .75 });
  cylinder(pool, R, .01, .005, p.surface, 'wading-floor', { segments: 48, roughness: .5 });
  merged(pool, [[1.2, 1.32], [2, 2.12]].map(([inner, outer]) => new THREE.RingGeometry(inner, outer, 48).rotateX(-Math.PI / 2).translate(0, .011, 0)), p.accent, 'wading-floor-ring', { roughness: .6 });
  cylinder(pool, R, .02, water - .01, p.liquid, 'wading-water', { segments: 48, opacity: .6, roughness: .08 });
  cylinder(pool, .16, .08, .04, p.trim, 'wading-mushroom-collar', { segments: 18 });
  cylinder(pool, .07, M, M / 2, p.structure, 'wading-mushroom-stem', { segments: 14 });
  const cap = part(pool, new THREE.SphereGeometry(.62, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), p.accent, 'wading-mushroom', { roughness: .55 }); cap.scale.set(1, .42, 1); cap.position.y = M;
  cylinder(pool, .62, .02, M + .005, p.trim, 'wading-mushroom-rim', { segments: 28 });
  part(pool, new THREE.SphereGeometry(.05, 12, 8), p.trim, 'wading-mushroom-spout').position.y = M + .27;
  if (variant === 'fountain') {
    const spray = lighter(p.liquid, .55);
    const curtain = part(pool, new THREE.CylinderGeometry(.6, .95, M - water, 36, 1, true), spray, 'wading-curtain', { opacity: .3, roughness: .1 }); curtain.position.y = (M + water) / 2;
    (curtain.material as THREE.Material).side = THREE.DoubleSide;
    const foam = part(pool, new THREE.TorusGeometry(.95, .03, 8, 40), spray, 'wading-splash', { opacity: .4 }); foam.rotation.x = Math.PI / 2; foam.position.y = water;
    const drops = Array.from({ length: 8 }, () => part(pool, new THREE.SphereGeometry(.03, 8, 6), spray, 'wading-droplet', { opacity: .6 }));
    const splash = (time: number) => {
      curtain.scale.set(1 + .025 * Math.sin(time * 7), 1, 1 + .025 * Math.sin(time * 7)); (curtain.material as THREE.MeshStandardMaterial).opacity = .26 + .06 * Math.sin(time * 5);
      drops.forEach((drop, i) => { const phase = (time * .9 + i / drops.length) % 1, angle = i / drops.length * Math.PI * 2, r = .95 + phase * .35; drop.position.set(Math.cos(angle) * r, water + Math.sin(phase * Math.PI) * .18, Math.sin(angle) * r); });
    };
    splash(0); setAssetAnimator(pool, ({ time }) => splash(time), [curtain, ...drops]);
  }
  anchor(pool, 'water', [0, water, 0]); anchor(pool, 'entry', [0, 0, R + rim + .4]); anchor(pool, 'top', [0, M + .32, 0]);
  return pool;
}

const SWIMMER_TONES = { accent: '#e4553f', structure: '#24364f', screen: '#1b2533' } as const;
/**
 * A swimmer lying at the water line, head toward +z, for placing in a pool at its water height. `freestyle` strokes
 * with optional local motion (arms circle, the body rolls, the legs kick); `floating` lies face up with arms and legs
 * spread and does not animate. The pivot is the water-line point under the chest. Color changes the swim cap.
 */
export function createSwimmer(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['freestyle', 'floating'] as const, 'swimmer'), p = objectPalette(node, context, 'accent', SWIMMER_TONES), floating = variant === 'floating';
  const swimmer = new THREE.Group(); swimmer.name = `swimmer-${variant}`;
  const body = new THREE.Group(); body.name = 'swimmer-body'; body.position.y = .12; swimmer.add(body);
  const capsule = (radius: number, length: number) => new THREE.CapsuleGeometry(radius, length, 4, 10).rotateX(Math.PI / 2);
  part(body, capsule(.15, .5), p.skin, 'swimmer-torso').scale.set(1.2, .72, 1);
  const suit = part(body, capsule(.155, .14), p.structure, 'swimmer-suit'); suit.scale.set(1.2, .72, 1); suit.position.z = -.28;
  part(body, new THREE.SphereGeometry(.105, 16, 12), p.skin, 'swimmer-head').position.set(0, .05, .55);
  // The cap covers the crown and the back of the head: up when face down, down when floating face up.
  const cap = part(body, new THREE.SphereGeometry(.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55), p.accent, 'swimmer-cap'); cap.position.set(0, .05, .55); cap.rotation.x = Math.PI / 2 + (floating ? .5 : -.5);
  merged(body, [-1, 1].map(side => new THREE.SphereGeometry(.024, 10, 8).translate(side * .04, floating ? .13 : -.01, floating ? .6 : .645)), p.screen, 'swimmer-goggles', { roughness: .3 });
  const limb = (x: number, y: number, z: number, name: string) => { const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); body.add(group); return group; };
  const legs = [-1, 1].map(side => {
    const leg = limb(side * .09, -.02, -.45, 'swimmer-hip'); leg.rotation.y = floating ? side * -.18 : 0;
    part(leg, capsule(.06, .55).translate(0, 0, -.335), p.skin, 'swimmer-leg');
    block(leg, [.08, .035, .17], [0, 0, -.72], p.skin, 'swimmer-foot', { bevel: .015 });
    return leg;
  });
  const arms = [-1, 1].map(side => {
    const arm = limb(side * .21, .02, .3, 'swimmer-shoulder');
    part(arm, capsule(.048, .5).translate(0, 0, .298), p.skin, 'swimmer-arm');
    part(arm, new THREE.SphereGeometry(.052, 10, 8), p.skin, 'swimmer-hand').position.z = .6;
    if (floating) arm.rotation.y = side * 1.35; else arm.rotation.x = side > 0 ? 0 : Math.PI;
    return arm;
  });
  anchor(swimmer, 'top', [0, .32, .5]);
  if (floating) return swimmer;
  // Kick foam behind the feet; it pulses with the kick.
  const foam = [-.1, 0, .1].map((x, i) => { const puff = part(swimmer, new THREE.SphereGeometry(.08, 10, 6), '#ffffff', 'swimmer-splash', { opacity: .35 }); puff.scale.set(1, .4, 1); puff.position.set(x, .03, -1.12 - (i % 2) * .06); return puff; });
  // Positive rotation about x sweeps an arm forward → down (the pull) → back → up (the recovery).
  setAssetAnimator(swimmer, ({ time }) => {
    const stroke = time * 2.6; arms[1].rotation.x = stroke; arms[0].rotation.x = stroke + Math.PI; body.rotation.z = Math.sin(stroke) * .22;
    legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 9 + i * Math.PI) * .2; });
    foam.forEach((puff, i) => { const scale = .75 + .3 * (.5 + .5 * Math.sin(time * 9 + i * 2)); puff.scale.set(scale, .4 * scale, scale); });
  }, [body, ...arms, ...legs, ...foam]);
  return swimmer;
}

export const STARTING_BLOCK = Object.freeze({ deck: .68, tilt: .1, plate: [0, .36, .243] as const });
const BLOCK_TONES = { structure: '#c9d2db', accent: '#2f6fd6', trim: '#3a4656', text: '#f7f9fb', screen: '#1f3a5f' } as const;
/**
 * Competition starting block facing +z (toward the water): stainless body with a front number plate, a platform tilted
 * toward the pool with grip strips and an adjustable kick wedge, and backstroke grips under the front edge.
 * Lane alerts belong to the host composition. The number plate is a surface-label area. Static. Color changes the platform.
 */
export function createStartingBlock(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'accent', BLOCK_TONES), { deck: deckY, tilt, plate } = STARTING_BLOCK, start = new THREE.Group(); start.name = 'starting-block';
  block(start, [.5, .06, .5], [0, .03, 0], p.trim, 'block-foot', { bevel: .01 });
  block(start, [.46, .6, .46], [0, .36, 0], p.structure, 'block-body', { bevel: .02, ...metal });
  block(start, [.34, .24, .012], [plate[0], plate[1], plate[2] - .007], p.text, 'block-plate', { bevel: .004 });
  merged(start, [new THREE.BoxGeometry(.035, .15, .004).translate(.01, plate[1], plate[2] + .001), new THREE.BoxGeometry(.04, .025, .004).translate(-.012, plate[1] + .062, plate[2] + .001)], p.screen, 'block-number');
  const deck = new THREE.Group(); deck.name = 'block-deck'; deck.position.y = deckY; deck.rotation.x = tilt; start.add(deck);
  block(deck, [.52, .05, .72], [0, .025, 0], p.accent, 'block-top', { bevel: .015, roughness: .8 });
  merged(deck, Array.from({ length: 8 }, (_, i) => new THREE.BoxGeometry(.46, .004, .02).translate(0, .051, -.28 + i * .08)), p.trim, 'block-grip');
  block(deck, [.48, .14, .05], [0, .1, -.24], p.trim, 'block-wedge', { bevel: .012 }).rotation.x = -.55;
  merged(start, [rod([-.2, .6, .3], [.2, .6, .3], .016, 10), ...[-.2, .2].map(x => rod([x, .6, .3], [x, .6, .22], .016))], p.structure, 'block-handle', metal);
  anchor(deck, 'stand', [0, .05, 0]); anchor(start, 'plate', [...plate]);
  return start;
}

const CHAIR_TONES = { structure: '#f3f1ec', accent: '#d9483b' } as const;
/**
 * Elevated lifeguard chair with splayed legs, rungs on the rear legs, a footrest, a seat at 1.6 m under a shade canopy
 * and a rescue tube on the front leg. Post coverage is host data. Static. Color changes the seat,
 * backrest and canopy.
 */
export function createLifeguardChair(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'accent', CHAIR_TONES), chair = new THREE.Group(); chair.name = 'lifeguard-chair';
  const leg = (sx: number, sz: number, y: number): Vec => { const t = y / 1.53; return [sx * (.5 - .18 * t), y, sz * (.55 - .27 * t)]; };
  const frame = [-1, 1].flatMap(sx => [-1, 1].map(sz => rod(leg(sx, sz, 0), leg(sx, sz, 1.53), .035)));
  for (const y of [.32, .64, .96, 1.28]) frame.push(rod(leg(-1, -1, y), leg(1, -1, y), .022));
  frame.push(rod(leg(-1, 1, 1.08), leg(1, 1, 1.08), .03));
  for (const sx of [-1, 1]) {
    frame.push(rod(leg(sx, -1, .45), leg(sx, 1, .45), .022), rod([sx * .3, 1.85, -.25], [sx * .3, 1.85, .2], .02), rod([sx * .3, 1.58, .2], [sx * .3, 1.85, .2], .02));
    for (const sz of [-1, 1]) frame.push(rod([sx * .32, 1.56, sz * .28], [sx * .32, 2.56, sz * .28], .022));
  }
  merged(chair, frame, p.structure, 'chair-frame', { roughness: .5 });
  block(chair, [.74, .05, .66], [0, 1.555, 0], p.structure, 'chair-platform', { bevel: .01 });
  block(chair, [.56, .08, .42], [0, 1.62, 0], p.accent, 'chair-seat', { bevel: .03, roughness: .8 });
  block(chair, [.56, .5, .06], [0, 1.92, -.24], p.accent, 'chair-back', { bevel: .025, roughness: .8 }).rotation.x = -.12;
  block(chair, [1.2, .05, 1.1], [0, 2.58, 0], p.accent, 'chair-canopy', { bevel: .02, roughness: .85 });
  block(chair, [.11, .72, .15], [.42, .78, .48], RESCUE, 'chair-rescue-tube', { bevel: .05, roughness: .7 }).rotation.z = .12;
  anchor(chair, 'seat', [0, 1.66, .02]); anchor(chair, 'ladder', [0, 0, -.85]); anchor(chair, 'top', [0, 2.605, 0]);
  return chair;
}

/** Stainless pool ladder straddling the coping: two grab rails from the deck (−z) over the edge into the water (+z) with a step. Static. Color changes the rails. */
export function createPoolLadder(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'structure', { structure: '#cfd8e0', trim: '#eef2f5' }), ladder = new THREE.Group(); ladder.name = 'pool-ladder';
  const path = [[-.32, .022], [-.32, .62], [-.27, .86], [-.12, .97], [.1, .97], [.25, .86], [.3, .62], [.3, .03]] as const;
  merged(ladder, [-.25, .25].map(x => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path.map(([z, y]) => new THREE.Vector3(x, y, z))), 48, .022, 8, false)), p.structure, 'ladder-rail', metal);
  block(ladder, [.48, .03, .1], [0, .07, .3], p.trim, 'ladder-step', { bevel: .008 });
  for (const x of [-.25, .25]) cylinder(ladder, .045, .012, 0, p.trim, 'ladder-escutcheon', { segments: 16, ...metal }).position.set(x, .006, -.32);
  anchor(ladder, 'deck', [0, 0, -.7]); anchor(ladder, 'top', [0, .99, 0]);
  return ladder;
}

const LOUNGER_TONES = { accent: '#2f8fb0', structure: '#f1f0ec', trim: '#f6efe2' } as const;
/** Sun lounger, 2 m along z with the head at −z: aluminium frame, wheels, a cushioned seat and backrest (`reclined` or `flat`) and a rolled towel. Static. Color changes the cushions. */
export function createSunLounger(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['reclined', 'flat'] as const, 'sun lounger'), p = objectPalette(node, context, 'accent', LOUNGER_TONES), angle = variant === 'reclined' ? .75 : 0;
  const lounger = new THREE.Group(); lounger.name = `sun-lounger-${variant}`;
  const back = new THREE.Group(); back.name = 'lounger-backrest'; back.position.set(0, .355, -.25); back.rotation.x = angle; lounger.add(back);
  // Point under the backrest, in lounger coordinates, where the prop meets it.
  const under = (z: number): Vec => [0, .355 - .04 * Math.cos(angle) - z * Math.sin(angle), -.25 - .04 * Math.sin(angle) + z * Math.cos(angle)];
  const frame = [-1, 1].flatMap(s => [rod([s * .32, .3, -.95], [s * .32, .3, .95], .025), rod([s * .32, .3, .9], [s * .32, 0, .95], .025), rod([s * .32, .3, -.85], [s * .32, .1, -.9], .025)]);
  for (const z of [-.9, -.25, .9]) frame.push(rod([-.32, .3, z], [.32, .3, z], .02));
  if (angle) for (const s of [-1, 1]) { const top = under(-.45); frame.push(rod([s * .28, .3, -.75], [s * .28, top[1], top[2]], .018)); }
  merged(lounger, frame, p.structure, 'lounger-frame', { roughness: .45 });
  merged(back, [-1, 1].map(s => rod([s * .3, -.04, 0], [s * .3, -.04, -.72], .02)), p.structure, 'lounger-frame', { roughness: .45 });
  for (const s of [-1, 1]) { const tyre = cylinder(lounger, .1, .05, 0, RUBBER, 'lounger-wheel', { segments: 16 }); tyre.rotation.z = Math.PI / 2; tyre.position.set(s * .35, .1, -.9); }
  block(lounger, [.62, .07, 1.2], [0, .355, .35], p.accent, 'lounger-cushion', { bevel: .03, roughness: .85 });
  block(back, [.62, .07, .72], [0, 0, -.36], p.accent, 'lounger-cushion', { bevel: .03, roughness: .85 });
  const towel = cylinder(lounger, .07, .52, 0, p.trim, 'lounger-towel', { segments: 14, roughness: .95 }); towel.rotation.z = Math.PI / 2; towel.position.set(0, .46, .78);
  anchor(lounger, 'surface', [0, .39, .35]);
  return lounger;
}

const SHOWER_TONES = { structure: '#c9d2db', trim: '#e9edf1', liquid: '#8fd3ef' } as const;
/**
 * Deck shower: stainless column on a drain tray with an arched rose head over the tray, a push button and a foot tap.
 * waterRunning (default true) controls visible water; optional local motion lets droplets fall.
 * Alerts never change water or geometry. Color changes the column and arm.
 */
export function createDeckShower(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  validateOperatingProperties(node);
  const p = objectPalette(node, context, 'structure', SHOWER_TONES), shower = new THREE.Group(); shower.name = 'deck-shower';
  block(shower, [.8, .04, .8], [0, .02, 0], p.trim, 'shower-tray', { bevel: .01, roughness: .5 });
  const grate: number[] = []; for (let i = 0; i < 9; i++) { const x = -.32 + i * .08; grate.push(x, .041, -.32, x, .041, .32); } wires(shower, grate, p.structure, 'shower-grate');
  cylinder(shower, .05, 2.2, 1.1, p.structure, 'shower-column', { segments: 16, ...metal }).position.z = -.28;
  merged(shower, [rod([0, 2.2, -.28], [0, 2.26, -.18], .03, 10), rod([0, 2.26, -.18], [0, 2.26, .15], .03, 10), rod([0, .5, -.24], [0, .5, -.14], .018)], p.structure, 'shower-arm', metal);
  cylinder(shower, .11, .035, 2.22, p.trim, 'shower-head', { segments: 24, ...metal }).position.z = .18;
  block(shower, [.1, .14, .03], [0, 1.3, -.22], p.trim, 'shower-button-panel', { bevel: .008 });
  const button = cylinder(shower, .025, .02, 0, p.structure, 'shower-button', { segments: 14 }); button.rotation.x = Math.PI / 2; button.position.set(0, 1.32, -.2);
  anchor(shower, 'stand', [0, .04, .15]); anchor(shower, 'top', [0, 2.3, 0]);
  if (node.waterRunning === false) return shower;
  const stream = part(shower, new THREE.CylinderGeometry(.1, .17, 2.12, 20, 1, true), p.liquid, 'shower-water', { opacity: .28, roughness: .1 }); stream.position.set(0, 1.1, .18);
  (stream.material as THREE.Material).side = THREE.DoubleSide;
  const drops = Array.from({ length: 10 }, () => part(shower, new THREE.SphereGeometry(.018, 8, 6), p.liquid, 'shower-drop', { opacity: .7 }));
  const fall = (time: number) => {
    (stream.material as THREE.MeshStandardMaterial).opacity = .24 + .06 * Math.sin(time * 11);
    drops.forEach((drop, i) => { const phase = (time * 1.4 + i / drops.length) % 1, angle = i * 2.4, r = .08 + phase * .08; drop.position.set(Math.cos(angle) * r, 2.16 - phase * 2.1, .18 + Math.sin(angle) * r); });
  };
  fall(0); setAssetAnimator(shower, ({ time }) => fall(time), [stream, ...drops]);
  return shower;
}

export const LIFE_RING_POST = Object.freeze({ ring: [0, 1, .11] as const, sign: [0, 1.55, .057] as const });
const RING_TONES = { accent: '#ef6a2e', trim: '#f7f7f4', structure: '#3f5a73', text: '#f7f9fb', screen: '#2e7d5b' } as const;
/** Rescue point: a post on a base plate holding a life ring with white bands and a coiled throw line, under a sign plate that is a surface-label area. Static. Color changes the ring. */
export function createLifeRingPost(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'accent', RING_TONES), { ring, sign } = LIFE_RING_POST, post = new THREE.Group(); post.name = 'life-ring-post';
  block(post, [.4, .03, .4], [0, .015, 0], p.structure, 'ring-post-base', { bevel: .006 });
  block(post, [.08, 1.7, .08], [0, .85, 0], p.structure, 'ring-post', { bevel: .01 });
  block(post, [.06, .06, .12], [0, 1.3, .08], p.structure, 'ring-post-hook');
  part(post, new THREE.TorusGeometry(.3, .07, 12, 32), p.accent, 'ring-buoy', { roughness: .6 }).position.set(...ring);
  merged(post, [0, 1, 2, 3].map(i => new THREE.TorusGeometry(.302, .073, 12, 6, .32).rotateZ(i * Math.PI / 2 + Math.PI / 4 - .16).translate(...ring)), p.trim, 'ring-band', { roughness: .6 });
  part(post, new THREE.TorusGeometry(.12, .012, 6, 24), '#c9a274', 'ring-line', { roughness: .9 }).position.set(0, .55, .06);
  block(post, [.3, .2, .015], [sign[0], sign[1], sign[2] - .009], p.text, 'ring-post-sign', { bevel: .004 });
  part(post, new THREE.TorusGeometry(.055, .016, 8, 20), p.screen, 'ring-post-mark').position.set(...sign);
  anchor(post, 'ring', [...ring]); anchor(post, 'top', [0, 1.7, 0]);
  return post;
}

export const DOSING_STATION = Object.freeze({ display: [-.24, 1.6, -.117] as const });
const DOSING_TONES = { surface: '#eef2f5', structure: '#5f7186', trim: '#cfd8e0', screen: '#26384f', text: '#9ff0d0', glass: '#bfe3f2', accent: '#f2f2ea' } as const;
const CAPS = ['#d24b3e', '#3d6fd1'] as const;
/**
 * Water-treatment dosing station facing +z: a controller with a display (a surface-label area for host readings),
 * a transparent sample flow cell with probes, two dosing pumps and two chemical canisters on a spill tray.
 * Cap tones are decorative and do not identify chemicals. Static. Color changes the back board.
 */
export function createDosingStation(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'surface', DOSING_TONES), { display } = DOSING_STATION, station = new THREE.Group(); station.name = 'dosing-station';
  block(station, [1.3, .06, .6], [0, .03, 0], p.structure, 'dosing-base');
  block(station, [1.2, .08, .48], [0, .1, .02], p.trim, 'dosing-tray', { bevel: .01 });
  for (const x of [-.6, .6]) block(station, [.06, 1.9, .06], [x, 1.01, -.25], p.structure, 'dosing-post');
  block(station, [1.14, 1, .03], [0, 1.35, -.24], p.surface, 'dosing-board', { roughness: .6 });
  block(station, [.42, .32, .1], [display[0], 1.55, -.175], p.screen, 'dosing-controller', { bevel: .015 });
  block(station, [.3, .12, .006], [display[0], display[1], display[2] - .005], DISPLAY, 'dosing-display', { roughness: .3 });
  merged(station, [-.09, 0, .09].map(x => new THREE.BoxGeometry(.05, .06, .002).translate(display[0] + x, display[1], display[2])), p.text, 'dosing-digits', { emissive: p.text });
  for (const x of [-.36, -.3]) block(station, [.035, .025, .01], [x, 1.45, -.122], p.trim, 'dosing-key');
  cylinder(station, .045, .32, 1.55, p.glass, 'dosing-flow-cell', { segments: 16, opacity: .5, roughness: .1 }).position.set(.24, 1.55, -.17);
  for (const x of [.215, .265]) cylinder(station, .015, .1, 1.76, p.structure, 'dosing-probe', { segments: 8 }).position.set(x, 1.76, -.17);
  block(station, [.14, .04, .08], [.24, 1.37, -.19], p.trim, 'dosing-bracket');
  const tubes: number[] = [];
  [-.3, .3].forEach((x, i) => {
    block(station, [.16, .13, .1], [x, 1.05, -.175], p.trim, 'dosing-pump', { bevel: .012 });
    const head = cylinder(station, .04, .03, 0, p.screen, 'dosing-pump-head', { segments: 16 }); head.rotation.x = Math.PI / 2; head.position.set(x, 1.05, -.11);
    block(station, [.26, .4, .2], [x, .34, .06], p.accent, 'dosing-canister', { bevel: .03, roughness: .7 });
    block(station, [.08, .04, .04], [x - .05, .56, .06], p.accent, 'dosing-canister');
    cylinder(station, .04, .05, .565, CAPS[i], 'dosing-cap', { segments: 14 }).position.set(x + .06, .565, .06);
    tubes.push(x + .06, .59, .06, x + .06, .9, -.15, x + .06, .9, -.15, x, .985, -.15, x, 1.115, -.15, .24, 1.39, -.17);
  });
  wires(station, tubes, LINE, 'dosing-tube');
  anchor(station, 'display', [...display]); anchor(station, 'operator', [0, 0, .75]); anchor(station, 'top', [0, 1.96, -.25]);
  return station;
}

const FILTER_TONES = { accent: '#3f78b5', structure: '#56687c', trim: '#cfd8e0', screen: '#26384f', glass: '#c6e6f2' } as const;
/**
 * Pool sand filter: fibreglass vessel on a stand with domed ends, a six-way valve with handle on top, inlet and outlet
 * pipes with flanges and a sight glass, on a plinth. The gauge bezel stays neutral; alerts belong to the host. Static. Color
 * changes the vessel.
 */
export function createSandFilter(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = objectPalette(node, context, 'accent', FILTER_TONES), filter = new THREE.Group(); filter.name = 'sand-filter';
  block(filter, [1.1, .08, 1.1], [0, .04, 0], p.trim, 'filter-plinth', { bevel: .01 });
  cylinder(filter, .36, .14, .15, p.structure, 'filter-stand', { segments: 24 });
  cylinder(filter, .45, 1, .72, p.accent, 'filter-vessel', { segments: 32, roughness: .45 });
  // Domed ends: the lower half-sphere under the shell, the upper one on top.
  for (const [y, start, squash] of [[.22, Math.PI / 2, .35], [1.22, 0, .4]] as const) { const dome = part(filter, new THREE.SphereGeometry(.45, 32, 8, 0, Math.PI * 2, start, Math.PI / 2), p.accent, 'filter-vessel', { roughness: .45 }); dome.scale.set(1, squash, 1); dome.position.y = y; }
  merged(filter, [.45, 1].map(y => new THREE.TorusGeometry(.452, .015, 6, 40).rotateX(Math.PI / 2).translate(0, y, 0)), p.trim, 'filter-band');
  cylinder(filter, .15, .14, 1.45, p.structure, 'filter-valve', { segments: 20 });
  cylinder(filter, .1, .05, 1.545, p.trim, 'filter-valve-cap', { segments: 18 });
  block(filter, [.34, .035, .05], [0, 1.6, 0], p.screen, 'filter-handle', { bevel: .012 });
  merged(filter, [-1, 1].flatMap(s => [rod([s * .15, 1.45, 0], [s * .38, 1.45, 0], .045, 12), rod([s * .38, 1.45, 0], [s * .38, .1, 0], .045, 12)]), p.structure, 'filter-pipe', metal);
  merged(filter, [-1, 1].flatMap(s => [.55, .1].map(y => new THREE.CylinderGeometry(.07, .07, .03, 16).translate(s * .38, y, 0))), p.trim, 'filter-flange', metal);
  cylinder(filter, .055, .14, 1.1, p.glass, 'filter-sight-glass', { segments: 14, opacity: .55, roughness: .1 }).position.x = -.38;
  const gauge = cylinder(filter, .055, .02, 0, PLATE, 'filter-gauge', { segments: 20 }); gauge.rotation.x = Math.PI / 2; gauge.position.set(0, 1.45, .16);
  part(filter, new THREE.TorusGeometry(.058, .009, 6, 22), p.trim, 'filter-gauge-rim', metal).position.set(0, 1.45, .17);
  block(filter, [.004, .04, .003], [0, 1.46, .172], p.screen, 'filter-needle').rotation.z = -.7;
  const drain = cylinder(filter, .03, .08, 0, p.structure, 'filter-drain', { segments: 10 }); drain.rotation.x = Math.PI / 2; drain.position.set(0, .3, .46);
  anchor(filter, 'top', [0, 1.62, 0]); anchor(filter, 'service', [0, 0, .9]);
  return filter;
}
