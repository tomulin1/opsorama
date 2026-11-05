import * as THREE from 'three';
import type { AssetNode, MaterialPalette } from '@opsorama/core';
import { setAssetAnimator } from './animation';
import type { MaterialContext } from './laboratory';
import { objectPalette } from './object-palette';
import { anchor, block, merged, part } from './parts';
import { variantOf } from './kit';

/**
 * Pose shared by every animal. `standing` idles in place (head turn, tail swish), `walking` animates a gait in place
 * while a route or controller moves the root, and `lying` rests on the ground and never animates.
 */
export const ANIMAL_POSES = ['standing', 'walking', 'lying'] as const;
export type AnimalPose = typeof ANIMAL_POSES[number];

type Vec = readonly [number, number, number];
/** Natural tones that no palette role changes. */
const EYE = '#16181c', HOOF = '#2f2a27', HORN = '#e4d9bf', NOSE = '#2a2426', BEAK = '#e7a238', COMB = '#d2392d', SHANK = '#e2b03c', CAT_EYE = '#c7b43a';
/** Deterministic sequence, so two instances of a model are identical. */
function seeded(seed: number): () => number { let value = seed; return () => (value = value * 16807 % 2147483647) / 2147483647; }
/** Ellipsoid geometry with the given radii, for merging. */
const ellipsoid = (radii: Vec, position: Vec, segments: readonly [number, number] = [12, 8]) => new THREE.SphereGeometry(1, ...segments).scale(...radii).translate(...position);
function blob(group: THREE.Object3D, radii: Vec, position: Vec, color: string, name: string): THREE.Mesh {
  const mesh = part(group, new THREE.SphereGeometry(1, 16, 10), color, name, { roughness: .85 }); mesh.scale.set(...radii); mesh.position.set(...position); return mesh;
}
/** Tapered limb hanging from its pivot along −y. */
const limb = (top: number, bottom: number, length: number) => new THREE.CylinderGeometry(top, bottom, length, 10).translate(0, -length / 2, 0);
function joint(parent: THREE.Object3D, name: string, position: Vec): THREE.Group {
  const group = new THREE.Group(); group.name = name; group.position.set(...position); parent.add(group); return group;
}
const eyes = (group: THREE.Object3D, [x, y, z]: Vec, radius: number, color: string, name: string) => merged(group, [-1, 1].map(side => new THREE.SphereGeometry(radius, 10, 8).translate(side * x, y, z)), color, name, { roughness: .25 });
const tag = (group: THREE.Object3D, size: Vec, position: Vec, p: MaterialPalette, name: string) => { return block(group, size, position, p.trim, name, { roughness: .5 }); };

interface Rig { body: THREE.Group; head: THREE.Group; legs: THREE.Group[]; tail: THREE.Group; }
interface Gait { /** Leg cycle in rad/s. */ rate: number; /** Peak leg swing in rad. */ swing: number; /** Peak head nod in rad. */ nod: number; }

/** Poses parts in place on the shared clock; the root transform belongs to the host, routes and controllers. */
function animateRig(root: THREE.Object3D, { head, legs, tail }: Rig, pose: AnimalPose, gait: Gait): void {
  if (pose === 'lying') return;
  const tilt = head.rotation.x, lead = legs.length === 4 ? [0, 3] : [0];
  setAssetAnimator(root, ({ time }) => {
    if (pose === 'walking') {
      // Trot: diagonal pairs swing together (front-left with rear-right); two legs alternate.
      const swing = Math.sin(time * gait.rate) * gait.swing;
      legs.forEach((leg, i) => { leg.rotation.x = lead.includes(i) ? swing : -swing; });
      head.rotation.x = tilt + Math.sin(time * gait.rate * 2) * gait.nod;
    } else head.rotation.y = Math.sin(time * .5) * .22;
    tail.rotation.z = Math.sin(time * (pose === 'walking' ? gait.rate : 1.6)) * .3;
  }, [head, ...legs, tail]);
}

/** Proportions of a four-legged animal; metres in the body, head and tail frames. */
interface Quadruped {
  asset: string; label: string; tones: Partial<MaterialPalette>;
  /** Body ellipsoid radii, and the height of its centre when standing. */
  body: Vec; height: number;
  /** Leg pivots: half track, shoulder z and hip z, and their drop below the body centre. */
  legX: number; frontZ: number; rearZ: number; legDrop: number;
  leg: { top: number; bottom: number; color: (p: MaterialPalette) => string };
  foot: { size: Vec; name: string; color: (p: MaterialPalette) => string };
  /** Head pivot on the body and its downward tilt in rad. */
  neck: Vec; headTilt: number;
  /** Tail pivot on the body, its length and its backward tilt in rad (above π/2 the tail points up). */
  tail: { at: Vec; length: number; tilt: number };
  /** Lying: hooved animals fold the front legs back under the chest; dogs and cats stretch them forward. */
  frontFold: 'back' | 'forward';
  gait: Gait;
  /** Coat, head and tail details on the rig; must add the `head` anchor to the head frame. */
  dress(rig: Rig, p: MaterialPalette, pose: AnimalPose): void;
}

function quadruped(spec: Quadruped, node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pose = variantOf(node, ANIMAL_POSES, spec.label), p = objectPalette(node, context, 'hair', spec.tones), lying = pose === 'lying';
  const root = new THREE.Group(); root.name = `${spec.asset}-${pose}`;
  // Lying lowers the body until the belly rests on the ground; legs, head and tail move with it.
  const body = joint(root, `${spec.asset}-torso`, [0, lying ? spec.body[1] : spec.height, 0]);
  blob(body, spec.body, [0, 0, 0], p.hair, `${spec.asset}-body`);
  const length = spec.height - spec.legDrop - spec.foot.size[1];
  const legs = ([[-1, spec.frontZ], [1, spec.frontZ], [-1, spec.rearZ], [1, spec.rearZ]] as const).map(([side, z], i) => {
    const leg = joint(body, `${spec.asset}-leg-pivot`, [side * spec.legX, -spec.legDrop, z]); leg.rotation.order = 'YXZ';
    part(leg, limb(spec.leg.top, spec.leg.bottom, length), spec.leg.color(p), `${spec.asset}-leg`, { roughness: .85 });
    // Shoulder or haunch muscle, blending the leg into the body.
    blob(leg, [spec.leg.top * 1.3, length * .22, spec.leg.top * 1.8], [0, -length * .04, 0], spec.leg.color(p), `${spec.asset}-leg`);
    block(leg, spec.foot.size, [0, -length - spec.foot.size[1] / 2, spec.foot.size[2] * .15], spec.foot.color(p), `${spec.asset}-${spec.foot.name}`, { bevel: Math.min(...spec.foot.size) * .3, roughness: .8 });
    if (lying) {
      // Fold the leg flat (back = toward −z), then splay it outward so the foot shows beside the body.
      const fold = i < 2 && spec.frontFold === 'back' ? 1 : -1;
      leg.rotation.x = fold * Math.PI / 2; leg.rotation.y = -side * fold * .35;
    }
    return leg;
  });
  const head = joint(body, `${spec.asset}-head-pivot`, spec.neck); head.rotation.x = spec.headTilt;
  const tail = joint(body, `${spec.asset}-tail-pivot`, spec.tail.at);
  // A hanging tail lying down trails back far enough to stay above the ground.
  tail.rotation.x = lying ? Math.max(spec.tail.tilt, Math.acos(Math.min(1, (spec.body[1] + spec.tail.at[1] - .1) / spec.tail.length))) : spec.tail.tilt;
  const rig: Rig = { body, head, legs, tail };
  spec.dress(rig, p, pose);
  animateRig(root, rig, pose, spec.gait);
  anchor(root, 'top', [0, new THREE.Box3().setFromObject(root).max.y + .12, 0]);
  return root;
}

const COW: Quadruped = {
  asset: 'cow', label: 'cow', tones: { hair: '#f3f0e8', trim: '#2b2a2e', skin: '#e7aea4' },
  body: [.38, .37, .82], height: 1, legX: .22, frontZ: .52, rearZ: -.55, legDrop: .22,
  leg: { top: .085, bottom: .06, color: p => p.hair }, foot: { size: [.13, .08, .15], name: 'hoof', color: () => HOOF },
  neck: [0, .12, .72], headTilt: .25, tail: { at: [0, .2, -.8], length: .8, tilt: .12 }, frontFold: 'back',
  gait: { rate: 4, swing: .32, nod: .04 },
  dress({ body, head, tail }, p, pose) {
    const [a, b, c] = COW.body;
    // Patches are shallow ellipsoids just under the coat surface, so only their middles show.
    const side = (s: number, y: number, z: number, ry: number, rz: number) => ellipsoid([.06, ry, rz], [s * (a * Math.sqrt(1 - (y / b) ** 2 - (z / c) ** 2) - .045), y, z]);
    const top = (x: number, z: number, rx: number, rz: number) => ellipsoid([rx, .05, rz], [x, b * Math.sqrt(1 - (x / a) ** 2 - (z / c) ** 2) - .035, z]);
    merged(body, [side(1, .05, .3, .17, .22), side(1, .02, -.42, .19, .2), side(-1, -.02, -.1, .2, .28), side(-1, .12, .5, .13, .15), top(.08, -.1, .2, .26)], p.trim, 'cow-patch', { roughness: .85 });
    if (pose !== 'lying') {
      blob(body, [.13, .09, .13], [0, -.31, -.4], p.skin, 'cow-udder');
      merged(body, [-1, 1].flatMap(x => [-1, 1].map(z => new THREE.CylinderGeometry(.015, .012, .07, 8).translate(x * .045, -.41, -.4 + z * .045))), p.skin, 'cow-udder');
    }
    blob(head, [.17, .2, .26], [0, -.02, .08], p.hair, 'cow-neck');
    block(head, [.26, .3, .36], [0, .04, .36], p.hair, 'cow-head', { bevel: .08, roughness: .85 });
    block(head, [.24, .17, .16], [0, -.07, .57], p.skin, 'cow-muzzle', { bevel: .06, roughness: .7 });
    merged(head, [-1, 1].map(s => new THREE.SphereGeometry(.022, 8, 6).translate(s * .05, -.04, .65)), NOSE, 'cow-nostril');
    eyes(head, [.132, .1, .42], .028, EYE, 'cow-eye');
    merged(head, [-1, 1].map(s => ellipsoid([.1, .035, .06], [s * .2, .13, .3])), p.trim, 'cow-ear', { roughness: .85 });
    merged(head, [-1, 1].map(s => new THREE.ConeGeometry(.025, .1, 8).rotateZ(-s * .9).translate(s * .12, .22, .3)), HORN, 'cow-horn', { roughness: .5 });
    tag(head, [.05, .06, .01], [.25, .09, .37], p, 'cow-tag');
    anchor(head, 'head', [0, -.07, .66]);
    part(tail, limb(.025, .015, .68), p.hair, 'cow-tail', { roughness: .85 });
    blob(tail, [.045, .1, .045], [0, -.72, 0], p.trim, 'cow-tail-tuft');
  },
};

const HORSE: Quadruped = {
  asset: 'horse', label: 'horse', tones: { hair: '#8a5838', trim: '#2a201b', skin: '#4a3a33', accent: '#c4402f' },
  body: [.32, .36, .78], height: 1.22, legX: .19, frontZ: .52, rearZ: -.52, legDrop: .24,
  leg: { top: .075, bottom: .045, color: p => p.hair }, foot: { size: [.11, .08, .12], name: 'hoof', color: () => HOOF },
  neck: [0, .2, .6], headTilt: -.95, tail: { at: [0, .22, -.76], length: .85, tilt: .22 }, frontFold: 'back',
  gait: { rate: 5, swing: .42, nod: .05 },
  dress({ head, tail }, p) {
    // The head frame carries the neck rising forward; the skull hangs from its far end.
    part(head, new THREE.CylinderGeometry(.11, .17, .8, 12).rotateX(Math.PI / 2).translate(0, 0, .32), p.hair, 'horse-neck', { roughness: .85 });
    block(head, [.05, .1, .66], [0, .14, .36], p.trim, 'horse-mane', { bevel: .02, roughness: .9 });
    const skull = joint(head, 'horse-skull', [0, .02, .7]); skull.rotation.x = 1.75;
    block(skull, [.21, .25, .56], [0, 0, .24], p.hair, 'horse-head', { bevel: .08, roughness: .85 });
    block(skull, [.19, .2, .16], [0, -.01, .55], p.skin, 'horse-muzzle', { bevel: .07, roughness: .7 });
    merged(skull, [-1, 1].map(s => new THREE.SphereGeometry(.02, 8, 6).translate(s * .05, .04, .63)), NOSE, 'horse-nostril');
    eyes(skull, [.11, .06, .1], .025, EYE, 'horse-eye');
    // Skull-local +y faces up and forward; tilting the ears back keeps them upright.
    merged(skull, [-1, 1].map(s => new THREE.ConeGeometry(.035, .12, 8).rotateX(-.8).translate(s * .06, .14, -.02)), p.hair, 'horse-ear', { roughness: .85 });
    merged(skull, [
      new THREE.TorusGeometry(.115, .012, 6, 20).scale(1, 1.12, 1).translate(0, -.01, .46),
      new THREE.TorusGeometry(.14, .012, 6, 20).scale(.8, 1, 1).translate(0, 0, .02),
      ...[-1, 1].map(s => new THREE.BoxGeometry(.012, .03, .44).translate(s * .11, 0, .24)),
    ], p.accent, 'horse-halter', { roughness: .6 });
    tag(skull, [.012, .06, .05], [.122, -.07, .46], p, 'horse-tag');
    anchor(skull, 'head', [0, 0, .65]);
    part(tail, limb(.05, .085, .85), p.trim, 'horse-tail', { roughness: .9 });
  },
};

const SHEEP: Quadruped = {
  asset: 'sheep', label: 'sheep', tones: { hair: '#eee7d8', trim: '#2e2927' },
  body: [.3, .29, .48], height: .62, legX: .14, frontZ: .3, rearZ: -.3, legDrop: .18,
  leg: { top: .04, bottom: .03, color: p => p.trim }, foot: { size: [.06, .05, .07], name: 'hoof', color: () => HOOF },
  neck: [0, .12, .45], headTilt: .15, tail: { at: [0, .08, -.46], length: .15, tilt: .3 }, frontFold: 'back',
  gait: { rate: 5, swing: .38, nod: .05 },
  dress({ body, head, tail }, p) {
    const [a, b, c] = SHEEP.body, random = seeded(11), puffs: THREE.BufferGeometry[] = [];
    // Mirrored wool puffs over the back and sides; none below the belly line, so the lying sheep stays on the ground.
    for (let i = 0; i < 13; i++) {
      const azimuth = random() * Math.PI, elevation = -.3 + random() * 1.7, r = .1 + random() * .03;
      for (const side of [-1, 1]) puffs.push(ellipsoid([r, r, r], [side * a * .85 * Math.cos(elevation) * Math.sin(azimuth), b * .85 * Math.sin(elevation), c * .85 * Math.cos(elevation) * Math.cos(azimuth)], [8, 6]));
    }
    merged(body, puffs, p.hair, 'sheep-wool', { roughness: .95 });
    blob(head, [.12, .1, .12], [0, .1, .08], p.hair, 'sheep-wool-cap');
    block(head, [.14, .17, .24], [0, -.01, .17], p.trim, 'sheep-face', { bevel: .06, roughness: .85 });
    eyes(head, [.071, .04, .2], .016, EYE, 'sheep-eye');
    merged(head, [-1, 1].map(s => ellipsoid([.08, .022, .035], [s * .1, .05, .12])), p.trim, 'sheep-ear', { roughness: .85 });
    tag(head, [.04, .05, .01], [.16, .03, .145], p, 'sheep-tag');
    anchor(head, 'head', [0, -.03, .3]);
    blob(tail, [.06, .09, .06], [0, -.05, -.02], p.hair, 'sheep-tail');
  },
};

const PIG: Quadruped = {
  asset: 'pig', label: 'pig', tones: { hair: '#efb4a5', skin: '#e18c84' },
  body: [.28, .27, .55], height: .5, legX: .15, frontZ: .34, rearZ: -.34, legDrop: .14,
  leg: { top: .06, bottom: .045, color: p => p.hair }, foot: { size: [.07, .05, .08], name: 'hoof', color: () => HOOF },
  neck: [0, .02, .45], headTilt: .15, tail: { at: [0, .1, -.54], length: .08, tilt: 0 }, frontFold: 'back',
  gait: { rate: 5, swing: .35, nod: .04 },
  dress({ head, tail }, p) {
    blob(head, [.19, .18, .2], [0, 0, .1], p.hair, 'pig-head');
    part(head, new THREE.CylinderGeometry(.085, .085, .1, 16).rotateX(Math.PI / 2).translate(0, -.03, .31), p.skin, 'pig-snout', { roughness: .6 });
    merged(head, [-1, 1].map(s => ellipsoid([.016, .022, .006], [s * .03, -.03, .361], [8, 6])), NOSE, 'pig-nostril');
    eyes(head, [.09, .07, .24], .02, EYE, 'pig-eye');
    merged(head, [-1, 1].map(s => ellipsoid([.075, .018, .085], [0, 0, 0]).rotateX(.6).translate(s * .11, .16, .17)), p.skin, 'pig-ear', { roughness: .7 });
    tag(head, [.04, .05, .01], [.17, .12, .245], p, 'pig-tag');
    anchor(head, 'head', [0, -.03, .37]);
    part(tail, new THREE.TorusGeometry(.035, .01, 6, 14, Math.PI * 1.5).rotateY(Math.PI / 2).translate(0, -.03, -.02), p.hair, 'pig-tail', { roughness: .8 });
  },
};

const DOG: Quadruped = {
  asset: 'dog', label: 'dog', tones: { hair: '#c99a5b', trim: '#8c5d2e', accent: '#d0453a' },
  body: [.16, .17, .36], height: .45, legX: .1, frontZ: .24, rearZ: -.24, legDrop: .08,
  leg: { top: .045, bottom: .035, color: p => p.hair }, foot: { size: [.07, .04, .08], name: 'paw', color: p => p.hair },
  neck: [0, .1, .3], headTilt: 0, tail: { at: [0, .08, -.34], length: .3, tilt: 2.2 }, frontFold: 'forward',
  gait: { rate: 7, swing: .5, nod: .05 },
  dress({ head, tail }, p) {
    blob(head, [.085, .13, .1], [0, .07, .02], p.hair, 'dog-neck').rotation.x = -.4;
    blob(head, [.1, .1, .115], [0, .17, .1], p.hair, 'dog-head');
    block(head, [.085, .075, .13], [0, .13, .22], p.hair, 'dog-snout', { bevel: .035, roughness: .85 });
    blob(head, [.03, .025, .02], [0, .155, .29], NOSE, 'dog-nose');
    eyes(head, [.055, .2, .18], .018, EYE, 'dog-eye');
    merged(head, [-1, 1].map(s => ellipsoid([.025, .085, .05], [s * .105, .12, .09])), p.trim, 'dog-ear', { roughness: .85 });
    // The collar ring follows the neck, which leans 0.4 rad forward from vertical.
    part(head, new THREE.TorusGeometry(.095, .014, 8, 24).rotateX(.4 - Math.PI / 2).translate(0, .04, .03), p.accent, 'dog-collar', { roughness: .5 });
    tag(head, [.03, .035, .006], [0, -.025, .125], p, 'dog-tag');
    anchor(head, 'head', [0, .13, .3]);
    part(tail, limb(.028, .014, .3), p.hair, 'dog-tail', { roughness: .85 });
  },
};

const CAT: Quadruped = {
  asset: 'cat', label: 'cat', tones: { hair: '#5e6269', trim: '#f1ece2', skin: '#e2a0a3', accent: '#3f7fd0' },
  body: [.085, .1, .2], height: .22, legX: .05, frontZ: .13, rearZ: -.13, legDrop: .05,
  leg: { top: .025, bottom: .02, color: p => p.hair }, foot: { size: [.035, .025, .045], name: 'paw', color: p => p.trim },
  neck: [0, .07, .16], headTilt: 0, tail: { at: [0, .05, -.19], length: .31, tilt: 2.5 }, frontFold: 'forward',
  gait: { rate: 6, swing: .45, nod: .04 },
  dress({ body, head, tail }, p) {
    blob(body, [.05, .07, .05], [0, -.02, .16], p.trim, 'cat-chest');
    blob(head, [.075, .07, .07], [0, .07, .05], p.hair, 'cat-head');
    blob(head, [.04, .028, .03], [0, .04, .105], p.trim, 'cat-muzzle');
    blob(head, [.012, .008, .008], [0, .058, .133], p.skin, 'cat-nose');
    eyes(head, [.03, .085, .105], .013, CAT_EYE, 'cat-eye');
    merged(head, [-1, 1].map(s => new THREE.ConeGeometry(.03, .06, 4).rotateZ(-s * .25).translate(s * .042, .14, .04)), p.hair, 'cat-ear', { roughness: .85 });
    merged(head, [-1, 1].map(s => new THREE.ConeGeometry(.018, .04, 4).rotateZ(-s * .25).translate(s * .042, .135, .052)), p.skin, 'cat-ear-inner', { roughness: .8 });
    part(head, new THREE.TorusGeometry(.05, .008, 6, 20).rotateX(.3 - Math.PI / 2).translate(0, 0, .02), p.accent, 'cat-collar', { roughness: .5 });
    tag(head, [.018, .022, .005], [0, -.035, .065], p, 'cat-tag');
    anchor(head, 'head', [0, .045, .14]);
    part(tail, limb(.016, .011, .3), p.hair, 'cat-tail', { roughness: .85 });
    blob(tail, [.014, .02, .014], [0, -.3, 0], p.trim, 'cat-tail-tip');
  },
};

/** Dairy cow, 1.37 m at the back, head toward +z: white coat with dark patches, muzzle, udder, horns and an ear tag for identification. Color changes the coat. */
export const createCow = (node: AssetNode, context?: MaterialContext) => quadruped(COW, node, context);
/** Riding horse, 1.6 m at the withers, head toward +z: bay coat, dark mane and tail, and a halter with a neutral cheek tag. Color changes the coat. */
export const createHorse = (node: AssetNode, context?: MaterialContext) => quadruped(HORSE, node, context);
/** Sheep with a wool coat, dark face and legs, and an ear tag for identification; head toward +z. Color changes the wool. */
export const createSheep = (node: AssetNode, context?: MaterialContext) => quadruped(SHEEP, node, context);
/** Pig with a snout, folded ears, a curly tail and an ear tag for identification; head toward +z. Color changes the coat. */
export const createPig = (node: AssetNode, context?: MaterialContext) => quadruped(PIG, node, context);
/** Medium dog, head toward +z, with floppy ears and a collar with an identification tag. Color changes the coat. */
export const createDog = (node: AssetNode, context?: MaterialContext) => quadruped(DOG, node, context);
/** House cat, head toward +z, with a white chest, muzzle and paws and a collar with an identification tag. Color changes the coat. */
export const createCat = (node: AssetNode, context?: MaterialContext) => quadruped(CAT, node, context);

const CHICKEN_TONES = { hair: '#b8642e', trim: '#6c3416' } as const;
/**
 * Hen, head toward +z: feathered body, wings and tail, comb, wattle and beak, and a wing tag for identification.
 * `lying` sits brooding on the ground with the legs tucked away. Color changes the plumage.
 */
export function createChicken(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pose = variantOf(node, ANIMAL_POSES, 'chicken'), p = objectPalette(node, context, 'hair', CHICKEN_TONES), lying = pose === 'lying';
  const root = new THREE.Group(); root.name = `chicken-${pose}`;
  const body = joint(root, 'chicken-torso', [0, lying ? .13 : .3, 0]);
  blob(body, [.12, .13, .17], [0, 0, 0], p.hair, 'chicken-body');
  blob(body, [.1, .1, .08], [0, .03, .1], p.hair, 'chicken-body');
  merged(body, [-1, 1].map(s => ellipsoid([.03, .075, .12], [s * .11, .01, -.02])), p.trim, 'chicken-wing', { roughness: .85 });
  tag(body, [.008, .028, .036], [.142, .02, .02], p, 'chicken-tag');
  // Legs exist only off the ground; the brooding hen tucks them under the body.
  const legs = lying ? [] : [-1, 1].map(side => {
    const leg = joint(body, 'chicken-leg-pivot', [side * .05, -.08, 0]);
    part(leg, limb(.013, .011, .205), SHANK, 'chicken-leg', { roughness: .6 });
    merged(leg, [-.45, 0, .45].map(angle => new THREE.BoxGeometry(.012, .012, .07).translate(0, 0, .03).rotateY(angle).translate(0, -.214, 0)), SHANK, 'chicken-foot', { roughness: .6 });
    return leg;
  });
  const head = joint(body, 'chicken-head-pivot', [0, .08, .12]);
  blob(head, [.055, .08, .055], [0, .05, 0], p.hair, 'chicken-neck');
  blob(head, [.055, .055, .055], [0, .13, .02], p.hair, 'chicken-head');
  part(head, new THREE.ConeGeometry(.018, .05, 8).rotateX(Math.PI / 2).translate(0, .12, .085), BEAK, 'chicken-beak', { roughness: .5 });
  merged(head, [[-.015, .19], [.01, .2], [.035, .185]].map(([z, y]) => new THREE.SphereGeometry(.018, 8, 6).translate(0, y, z)), COMB, 'chicken-comb', { roughness: .6 });
  blob(head, [.012, .025, .012], [0, .08, .06], COMB, 'chicken-wattle');
  eyes(head, [.045, .14, .05], .01, EYE, 'chicken-eye');
  anchor(head, 'head', [0, .12, .11]);
  const tail = joint(body, 'chicken-tail-pivot', [0, .05, -.14]);
  merged(tail, [-1, 1].map(s => ellipsoid([.03, .11, .07], [s * .02, .07, -.02]).rotateX(-.4)), p.trim, 'chicken-tail', { roughness: .85 });
  animateRig(root, { body, head, legs, tail }, pose, { rate: 8, swing: .5, nod: .2 });
  anchor(root, 'top', [0, new THREE.Box3().setFromObject(root).max.y + .12, 0]);
  return root;
}

/** Pose of the small bird: `flying` (default) flaps in place while a route or the host moves the root through the air; `perched` stands and idles. */
export const BIRD_POSES = ['flying', 'perched'] as const;
export type BirdPose = typeof BIRD_POSES[number];
const BIRD_TONES = { hair: '#8b6a4c', trim: '#4f3b2c', accent: '#d9874a' } as const, BIRD_BEAK = '#3a3330', BIRD_LEG = '#8a6a4f';
/**
 * Small songbird, about 0.25 m from beak to tail with a 0.29 m wingspan, head toward +z. The pivot is the point under the belly:
 * hosts set the flight height with the node position or 3D route points. `flying` spreads the wings (optional local
 * motion flaps them in bursts with a light body bob) and tucks the legs; `perched` folds the wings and stands on the
 * legs, turning the head. The leg band is neutral identification. Color changes the back and head.
 */
export function createBird(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pose = variantOf(node, BIRD_POSES, 'bird'), p = objectPalette(node, context, 'hair', BIRD_TONES), flying = pose === 'flying';
  const root = new THREE.Group(); root.name = `bird-${pose}`;
  const body = joint(root, 'bird-torso', [0, flying ? .035 : .058, 0]);
  blob(body, [.035, .034, .065], [0, 0, 0], p.hair, 'bird-body');
  blob(body, [.03, .028, .034], [0, -.008, .03], p.accent, 'bird-breast');
  const head = joint(body, 'bird-head-pivot', [0, .02, .05]);
  blob(head, [.026, .026, .028], [0, .016, .02], p.hair, 'bird-head');
  part(head, new THREE.ConeGeometry(.007, .02, 8).rotateX(Math.PI / 2).translate(0, .012, .055), BIRD_BEAK, 'bird-beak', { roughness: .5 });
  eyes(head, [.021, .022, .034], .005, EYE, 'bird-eye');
  anchor(head, 'head', [0, .012, .065]);
  const tail = joint(body, 'bird-tail-pivot', [0, .01, -.055]);
  part(tail, ellipsoid([.02, .004, .045], [0, 0, -.035]), p.trim, 'bird-tail', { roughness: .85 }).rotation.x = flying ? 0 : -.35;
  // Legs hang under the belly when perched and fold back along it in flight; the band on the +x leg is decorative.
  for (const side of [-1, 1]) {
    const leg = joint(body, 'bird-leg-pivot', [side * .012, -.025, .005]); leg.rotation.x = flying ? Math.PI / 2 - .2 : 0;
    part(leg, limb(.003, .0025, .033), BIRD_LEG, 'bird-leg', { roughness: .6 });
    if (!flying) merged(leg, [-.5, 0, .5].map(angle => new THREE.BoxGeometry(.003, .003, .018).translate(0, 0, .008).rotateY(angle).translate(0, -.0335, 0)), BIRD_LEG, 'bird-foot', { roughness: .6 });
    if (side > 0) { part(leg, new THREE.CylinderGeometry(.0045, .0045, .007, 10).translate(0, -.02, 0), p.trim, 'bird-band', { roughness: .5 }); }
  }
  if (flying) {
    const wings = [-1, 1].map(side => {
      const wing = joint(body, 'bird-wing-pivot', [side * .028, .015, .008]);
      part(wing, ellipsoid([.06, .005, .03], [side * .055, 0, -.008]), p.trim, 'bird-wing', { roughness: .85 });
      return wing;
    });
    // Flap-bounding: bursts of fast beats, then a short glide with the wings held level.
    setAssetAnimator(root, ({ time }) => {
      const burst = Math.max(0, Math.sin(time * 1.6)), beat = Math.sin(time * 16) * .85 * Math.min(1, burst * 3);
      wings[0].rotation.z = -beat; wings[1].rotation.z = beat;
      body.position.y = .035 + Math.sin(time * 16) * .004 * burst; tail.rotation.x = Math.sin(time * 2.1) * .12;
    }, [body, ...wings, tail]);
  } else {
    merged(body, [-1, 1].map(side => ellipsoid([.012, .026, .05], [side * .031, .004, -.012])), p.trim, 'bird-wing', { roughness: .85 });
    // The tail mesh carries the perched tilt; the pivot only flicks it.
    setAssetAnimator(root, ({ time }) => { head.rotation.y = Math.sin(time * 1.1) * .5; tail.rotation.x = Math.max(0, Math.sin(time * 2.3)) * .2; }, [head, tail]);
  }
  anchor(root, 'top', [0, new THREE.Box3().setFromObject(root).max.y + .08, 0]);
  return root;
}
