import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialPalette, MaterialRole } from '@opsorama/core';

/**
 * Asset ids built on the shared person rig: the generic `worker` and the clothed characters. They share the worker
 * poses (`variant`), anchors and animation, and they are the only assets that accept `AssetNode.options.person`.
 */
export const PERSON_ASSETS = Object.freeze(['worker', 'office-worker', 'chef', 'doctor', 'nurse', 'security-guard', 'construction-worker', 'visitor'] as const);
export type PersonAsset = typeof PERSON_ASSETS[number];
export const isPersonAsset = (asset: string): asset is PersonAsset => (PERSON_ASSETS as readonly string[]).includes(asset);

/**
 * Body silhouette of a person. `feminine` is a smaller, slimmer build (about 1.67 m instead of 1.74 m) with
 * narrower shoulders and waist, hides the ears under hair, replaces the short hair cap with one-piece
 * long hair that falls to the shoulders and, for the visitor and office worker, adds a knee-length skirt instead of
 * trousers. Poses, anchor names and the 0.52 m seat height are the same for both figures; hand and carry anchors
 * follow the smaller body.
 */
export const PERSON_FIGURES = Object.freeze(['masculine', 'feminine'] as const);
export type PersonFigure = typeof PERSON_FIGURES[number];
/** `AssetNode.options.person`; person assets only (`PERSON_ASSETS`). */
export interface PersonOptions {
  /** Body silhouette and hair length. Default: `masculine`. Changing it rebuilds the model. */
  figure?: PersonFigure;
}
export function validatePersonOptions(options: PersonOptions): void {
  if (typeof options !== 'object' || options === null) throw new Error('Person options must be an object such as { figure: \'feminine\' }.');
  const unknown = Object.keys(options).filter(key => key !== 'figure');
  if (unknown.length) throw new Error(`Unknown person option ${unknown.join(', ')}; person accepts only figure.`);
  if (options.figure !== undefined && !(PERSON_FIGURES as readonly string[]).includes(options.figure)) throw new Error(`Unknown person figure: ${String(options.figure)}. Use one of ${PERSON_FIGURES.join(', ')}.`);
}

/**
 * Preset hair colors for the `hair` palette role. Set one with `materials: { hair: PERSON_HAIR_COLORS.blonde }`;
 * `dark` matches the default theme. Any #RRGGBB color still works; these presets only keep scenes consistent.
 */
export const PERSON_HAIR_COLORS = Object.freeze({ dark: '#3a3c43', brown: '#6b4a32', blonde: '#d8b46a', red: '#a4472a' } as const);
export type PersonHairColor = keyof typeof PERSON_HAIR_COLORS;
/**
 * A stable preset hair color for a person id, so a crowd shows all presets without random changes between renders.
 * The same id always returns the same color.
 */
export function personHairColor(id: string): string {
  const presets = Object.values(PERSON_HAIR_COLORS), hash = [...id].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
  return presets[hash % presets.length];
}

/** Colors of the shared rig parts; collar defaults to the shirt. A `skirt` replaces trousers: the legs show skin below it. */
export interface PersonClothes { shirt: string; collar?: string; sleeve: string; forearm: string; trousers: string; shoes: string; belt: string; skirt?: string; }
/**
 * The rig groups a look dresses: the body rig (standing or seated) and the head group at the top of the neck.
 * `narrow` is how much the feminine figure takes off the shoulder and waist width (0 for masculine); garments around
 * the torso subtract it so they keep fitting.
 */
export interface PersonParts { rig: THREE.Group; head: THREE.Group; seated: boolean; narrow: number; }
export interface PersonLook {
  /** Role that the compatibility `color` field sets. */
  colorRole: MaterialRole;
  /** Definition defaults that keep the character recognizable in the default scene; a scene palette still overrides them. */
  defaults?: Partial<MaterialPalette>;
  clothes(p: MaterialPalette, figure: PersonFigure): PersonClothes;
  /** Adds the character's garments and accessories; parts must stay inside the rig or head group so they follow the pose. */
  dress?(parts: PersonParts, p: MaterialPalette): void;
}

/** Shoulder and waist width the feminine figure removes from the 0.47 m torso. */
export const FEMININE_NARROWING = .05;
/**
 * Rig scale of the feminine figure (width, height, depth): a smaller, slimmer build of about 1.67 m. Seated, the height
 * stays 1 so the hips keep the shared 0.52 m seat height and the shoes stay on the floor.
 */
export const FEMININE_SCALE = [.92, .96, .95] as const;

/** Clothing and limbs use softly rounded boxes so the figure reads as fabric and skin rather than crates. */
export function fabric(group: THREE.Object3D, size: readonly number[], position: readonly number[], color: string, bevel = 0) {
  const geometry = bevel ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, bevel) : new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85 }));
  mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function solid(group: THREE.Object3D, geometry: THREE.BufferGeometry, position: readonly number[], color: string) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .8 }));
  mesh.position.set(position[0], position[1], position[2]); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
/** A darker (factor < 1) shade of a palette color for seams, ties and soles. */
export const shade = (color: string, factor: number) => `#${new THREE.Color(color).multiplyScalar(factor).getHexString()}`;

/** Hair cap radius and scale shared by the short cap of the worker rig and the long hair, so both sit on the head alike. */
const HAIR_RADIUS = .212, HAIR_SCALE = [.9, .95, .92] as const, HAIR_TOP = .035;
/** How far the long hair falls below the crown, in head-local metres: just onto the shoulders. */
const LONG_HAIR_LENGTH = .36;
/** Half-angle of the opening in front of the face, in radians from +z. */
const FACE_OPENING = .78;
/**
 * Long hair of the feminine figure as one mesh: the crown dome continues into a curtain that falls down the sides and
 * the back onto the shoulders and leaves the face open. It replaces the short hair cap in the head group (y = 0 at the
 * centre of the head).
 */
export function createLongHair(color: string): THREE.Mesh {
  const crown = new THREE.SphereGeometry(HAIR_RADIUS, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  // The curtain starts at the crown's equator and widens slightly toward the ends.
  const curtain = new THREE.CylinderGeometry(HAIR_RADIUS, HAIR_RADIUS * 1.08, LONG_HAIR_LENGTH, 16, 1, true, FACE_OPENING, Math.PI * 2 - FACE_OPENING * 2);
  curtain.translate(0, -LONG_HAIR_LENGTH / 2, 0);
  const geometry = mergeGeometries([crown, curtain])!; crown.dispose(); curtain.dispose();
  geometry.scale(HAIR_SCALE[0], HAIR_SCALE[1], HAIR_SCALE[2]); geometry.translate(0, HAIR_TOP, 0);
  // Double-sided so the inside of the curtain shows through the face opening.
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide }));
  mesh.name = 'worker-long-hair'; mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
}
/** The short hair cap of the masculine figure. */
export function createHairCap(color: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(HAIR_RADIUS, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: .95 }));
  mesh.position.y = HAIR_TOP; mesh.scale.set(...HAIR_SCALE); mesh.castShadow = true; return mesh;
}

/** A lab coat or jacket hem below the belt; seated figures get a flap over the thighs instead. */
function hem({ rig, seated, narrow }: PersonParts, color: string, length: number) {
  if (seated) fabric(rig, [.47 - narrow, .03, .36], [0, .86, .2], color, .01);
  else fabric(rig, [.49 - narrow, length, .33], [0, .78 - length / 2, 0], color, .03);
}

export const personLooks: Readonly<Record<PersonAsset, PersonLook>> = Object.freeze({
  worker: {
    colorRole: 'accent',
    clothes: p => ({ shirt: p.accent, sleeve: p.accent, forearm: p.skin, trousers: p.structure, shoes: shade(p.structure, .55), belt: shade(p.structure, .55) }),
    dress: ({ rig }, p) => { fabric(rig, [.27, .09, .018], [0, 1.13, .165], p.text); fabric(rig, [.12, .07, .018], [.12, .98, .165], p.text); },
  },
  'office-worker': {
    colorRole: 'accent', defaults: { accent: '#3f5272', structure: '#3a414e', trim: '#eef2f6' },
    clothes: (p, figure) => ({ shirt: p.accent, collar: p.trim, sleeve: p.accent, forearm: p.accent, trousers: p.structure, shoes: shade(p.structure, .5), belt: shade(p.structure, .5), ...(figure === 'feminine' ? { skirt: p.structure } : {}) }),
    dress: (parts, p) => {
      const { rig } = parts;
      fabric(rig, [.15, .3, .012], [0, 1.115, .159], p.trim);
      fabric(rig, [.05, .27, .012], [0, 1.1, .167], shade(p.accent, .45), .005);
      fabric(rig, [.07, .09, .012], [-.13, 1.08, .162], p.text);
      hem(parts, p.accent, .1);
    },
  },
  chef: {
    colorRole: 'accent', defaults: { accent: '#2f3a4a', structure: '#6b7280', trim: '#f5f3ee' },
    clothes: p => ({ shirt: p.trim, sleeve: p.trim, forearm: p.trim, trousers: p.structure, shoes: shade(p.structure, .55), belt: p.accent }),
    dress: ({ rig, head, seated, narrow }, p) => {
      for (const x of [-.07, .07]) for (const y of [1.18, 1.08, .98]) fabric(rig, [.025, .025, .012], [x, y, .16], p.structure);
      fabric(rig, [.13, .06, .03], [0, 1.255, .1], p.accent, .01);
      // Waist apron: a band around the hips and a skirt that hangs in front of the legs, or lies on the lap when seated.
      fabric(rig, [.48 - narrow, .05, .33], [0, .8, 0], p.accent, .015);
      if (seated) fabric(rig, [.42 - narrow, .014, .4], [0, .855, .22], p.accent);
      else fabric(rig, [.42 - narrow, .4, .014], [0, .58, .17], p.accent);
      solid(head, new THREE.CylinderGeometry(.165, .17, .1, 16), [0, .2, 0], p.trim);
      solid(head, new THREE.CylinderGeometry(.21, .17, .16, 16), [0, .33, 0], p.trim);
    },
  },
  doctor: {
    colorRole: 'accent', defaults: { accent: '#7ea6d8', structure: '#4a5262', trim: '#f4f6f8' },
    clothes: p => ({ shirt: p.trim, collar: p.accent, sleeve: p.trim, forearm: p.trim, trousers: p.structure, shoes: shade(p.structure, .55), belt: shade(p.structure, .55) }),
    dress: (parts, p) => {
      const { rig } = parts, tube = shade(p.structure, .5);
      fabric(rig, [.13, .24, .012], [0, 1.15, .158], p.accent);
      fabric(rig, [.09, .06, .012], [.13, 1.1, .162], p.text);
      hem(parts, p.trim, .36);
      // Stethoscope: a U over the chest, a tube and the chest piece.
      const loop = solid(rig, new THREE.TorusGeometry(.085, .011, 6, 14, Math.PI), [0, 1.17, .168], tube); loop.rotation.z = Math.PI;
      fabric(rig, [.018, .1, .018], [0, 1.035, .168], tube);
      solid(rig, new THREE.CylinderGeometry(.03, .03, .018, 12), [0, .98, .175], tube).rotation.x = Math.PI / 2;
    },
  },
  nurse: {
    colorRole: 'accent', defaults: { accent: '#4b9fa3', trim: '#eef2f4' },
    clothes: p => ({ shirt: p.accent, sleeve: p.accent, forearm: p.skin, trousers: shade(p.accent, .85), shoes: p.trim, belt: shade(p.accent, .85) }),
    dress: ({ rig }, p) => {
      fabric(rig, [.1, .07, .012], [0, 1.235, .158], p.skin);
      fabric(rig, [.11, .09, .012], [-.11, 1.06, .158], shade(p.accent, .8));
      fabric(rig, [.08, .06, .012], [.12, 1.1, .162], p.text);
    },
  },
  'security-guard': {
    colorRole: 'accent', defaults: { accent: '#36455f', structure: '#2b313c', trim: '#d4b05a' },
    clothes: p => ({ shirt: p.accent, sleeve: p.accent, forearm: p.accent, trousers: p.structure, shoes: shade(p.structure, .55), belt: shade(p.structure, .6) }),
    dress: ({ rig, head, narrow }, p) => {
      const gear = shade(p.structure, .6);
      fabric(rig, [.07, .08, .014], [.12, 1.12, .162], p.trim, .01);
      fabric(rig, [.05, .08, .03], [-.13, 1.13, .17], gear, .01);
      for (const x of [-.2, .2]) fabric(rig, [.13, .02, .12], [x * (1 - narrow / .47), 1.275, 0], gear);
      // Duty belt with two pouches.
      fabric(rig, [.49 - narrow, .075, .33], [0, .78, 0], gear, .015);
      for (const x of [-.17, .17]) fabric(rig, [.07, .07, .05], [x, .78, .17], gear, .01);
      solid(head, new THREE.CylinderGeometry(.2, .19, .11, 16), [0, .21, 0], p.accent);
      fabric(head, [.2, .015, .12], [0, .155, .2], gear).rotation.x = .2;
      fabric(head, [.04, .04, .01], [0, .21, .195], p.trim);
    },
  },
  'construction-worker': {
    colorRole: 'warning', defaults: { accent: '#5d6b80', structure: '#4b5566', warning: '#f2b134' },
    clothes: p => ({ shirt: p.accent, sleeve: p.accent, forearm: p.skin, trousers: p.structure, shoes: shade(p.structure, .5), belt: shade(p.structure, .5) }),
    dress: ({ rig, head, narrow }, p) => {
      // High-visibility vest with two reflective bands, and a hard hat with a brim.
      fabric(rig, [.49 - narrow, .44, .33], [0, 1.03, 0], p.warning, .03);
      for (const y of [.9, 1.02]) fabric(rig, [.5 - narrow, .035, .34], [0, y, 0], p.text);
      solid(head, new THREE.SphereGeometry(.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, .07, 0], p.warning).scale.set(.95, .85, 1);
      solid(head, new THREE.CylinderGeometry(.24, .24, .018, 18), [0, .075, .015], p.warning);
    },
  },
  visitor: {
    colorRole: 'accent', defaults: { accent: '#d27a5a', structure: '#4b6286', trim: '#eceae4' },
    clothes: (p, figure) => ({ shirt: p.accent, sleeve: p.accent, forearm: p.skin, trousers: p.structure, shoes: p.trim, belt: shade(p.structure, .6), ...(figure === 'feminine' ? { skirt: p.structure } : {}) }),
  },
});
