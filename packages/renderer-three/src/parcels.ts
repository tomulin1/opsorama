import * as THREE from 'three';
import { projectContents, type MaterialPalette } from '@opsorama/core';
import { objectPalette, resolveObjectColor } from './object-palette';
import type { MaterialContext } from './laboratory';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { anchor, block } from './parts';

/** Reused taped parcel geometry, with the original metric dimensions and sticker part names. */
export function parcelPart(color: string, index: number, palette?: MaterialPalette): THREE.Group {
  const part = new THREE.Group(); part.name = `count-part-${index}`;
  block(part, [1.02, .8, .83], [0, .48, 0], color, 'parcel-body', { bevel: .03, roughness: .85 });
  // Lid flap seam along the box, under the cross tape; tape is glossier than cardboard.
  block(part, [.006, .004, .8], [-.3, .881, 0], '#000000', 'parcel-seam', { opacity: .12 });
  block(part, [.11, .81, .84], [0, .48, 0], palette?.trim ?? '#f6e6c7', 'parcel-tape', { roughness: .35 });
  block(part, [1.03, .04, .12], [0, .885, 0], palette?.trim ?? '#f5e4c5', 'parcel-tape', { roughness: .35 });
  block(part, [.31, .18, .01], [.2, .52, .422], palette?.text ?? '#fffaf2', 'parcel-sticker', { roughness: .5 });
  for (let bar = 0; bar < 5; bar++) block(part, [.013, .09, .015], [.1 + bar * .035, .52, .436], palette?.structure ?? '#6f7885', 'parcel-barcode');
  return part;
}

/** The open carton's floor sat 4.5 cm above its pivot; it is lowered by this much. */
const OPEN_LIFT = .045, OPEN_TOP = .78 - OPEN_LIFT, OPEN_FRONT = .42 - OPEN_LIFT;
/** `parcelPart` starts 8 cm above its origin, the height of the parcel base; a lone carton is lowered onto the ground. */
const PART_LIFT = .08;

/** Exactly one carton: closed and taped, or open with optional real contents. Counted parcels are `parcel-base` or `pallet`. */
export function createParcel(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const palette = objectPalette(node, context), group = new THREE.Group(), color = palette.surface;
  if (node.variant !== undefined && !['open', 'closed'].includes(node.variant)) throw new Error('Parcel variant must be open or closed.');
  if (node.count !== undefined || node.multiplier !== undefined) throw new Error('A parcel is exactly one carton; use parcel-base (0–27 parcels on a base) or pallet (0–27 boxes) for counted parcels.');
  if (node.variant !== 'open') {
    const box = parcelPart(color, 0, palette); box.position.y = -PART_LIFT; group.add(box);
    anchor(group, 'top', [0, .905 - PART_LIFT, 0]); anchor(group, 'front', [0, .48 - PART_LIFT, .43]);
    return group;
  }
  // The carton floor rests on the ground, so the pivot is the base center like the closed carton.
  const carton = new THREE.Group(); carton.name = 'count-part-0'; carton.position.y = -OPEN_LIFT; group.add(carton);
  block(carton, [1.02, .07, .83], [0, .08, 0], color, 'carton-floor');
  for (const x of [-.48, .48]) block(carton, [.06, .68, .83], [x, .42, 0], color, 'carton-wall');
  for (const z of [-.385, .385]) block(carton, [1.02, .68, .06], [0, .42, z], color, 'carton-wall');
  for (const x of [-.51, .51]) { const flap = new THREE.Group(); flap.name = x < 0 ? 'flap-left' : 'flap-right'; flap.position.set(x, .76, 0); flap.rotation.z = x < 0 ? -.55 : .55; block(flap, [.31, .045, .83], [x < 0 ? -.15 : .15, 0, 0], color, 'carton-flap'); carton.add(flap); }
  for (const z of [-.415, .415]) { const flap = new THREE.Group(); flap.name = z < 0 ? 'flap-back' : 'flap-front'; flap.position.set(0, .76, z); flap.rotation.x = z < 0 ? .5 : -.5; block(flap, [1.02, .045, .24], [0, 0, z < 0 ? -.12 : .12], color, 'carton-flap'); carton.add(flap); }
  if (node.contents) projectContents(node.contents, 9).visible.forEach((line, i) => block(carton, [.24, .38, .2], [(i % 3 - 1) * .28, .34, (Math.floor(i / 3) - 1) * .23], line.color ?? palette.accent, `content-part-${i}`));
  block(carton, [.42, .19, .01], [0, .46, .421], palette.text, 'parcel-sticker');
  anchor(group, 'contents', [0, .12 - OPEN_LIFT, 0]); anchor(group, 'top', [0, OPEN_TOP, 0]); anchor(group, 'front', [0, OPEN_FRONT, .43]);
  return group;
}

/** Top of the grey base plate of `parcel-base`, in metres. */
const BASE_TOP = .095;

/** 0–27 closed parcels on a grey base plate; compact shrinks the base to the count, reserved keeps the 3 × 3 × 3 capacity. Fills rows, then columns, then layers. */
export function createParcelBase(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const palette = objectPalette(node, context), group = new THREE.Group(), color = palette.surface;
  if (node.variant !== undefined) throw new Error('parcel-base has no variants; use parcel with variant open for an open carton.');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['parcel-base']), reserved = node.countLayout === 'reserved';
  // An empty compact base keeps the one-parcel footprint.
  const columns = reserved ? 3 : Math.max(1, Math.min(count, 3)), rows = reserved ? 3 : Math.max(1, Math.min(Math.ceil(count / 3), 3));
  for (let i = 0; i < count; i++) {
    const part = parcelPart(color, i, palette);
    part.position.set((i % 3 - (columns - 1) / 2) * 1.12, Math.floor(i / 9) * .9, (Math.floor(i / 3) % 3 - (rows - 1) / 2) * .93); group.add(part);
  }
  block(group, [1.18 + (columns - 1) * 1.12, .1, .98 + (rows - 1) * .93], [0, .045, 0], palette.structure, 'base-plate');
  // Top of the highest occupied layer, or of the base plate when empty, and the face of the front row.
  anchor(group, 'top', [0, count ? Math.floor((count - 1) / 9) * .9 + .9 : BASE_TOP, 0]); anchor(group, 'front', [0, .42, (rows - 1) / 2 * .93 + .43]);
  return group;
}

/** Industrial pallet (ISO 6780, 1.2 m along x × 1.0 m along z) with the deck top at 0.21 m, the size of the pallet-rack loads. */
export const PALLET = Object.freeze({ width: 1.2, depth: 1, deckTop: .21 });
type Board = readonly [size: readonly [number, number, number], position: readonly [number, number, number]];
/** Block-pallet build-up, bottom up and ground-centered: runners, blocks, stringer boards, then deck boards. `pallet` and `pallet-stack` share it, so they keep one size. */
export function palletBoards(): Readonly<Record<'runners' | 'blocks' | 'stringers' | 'deck', readonly Board[]>> {
  const { width, depth } = PALLET, rows = [-depth / 2 + .065, 0, depth / 2 - .065], columns = [-width / 2 + .085, 0, width / 2 - .085];
  return {
    runners: rows.map(z => [[width, .04, .13], [0, .02, z]]),
    blocks: columns.flatMap(x => rows.map((z): Board => [[.17, .09, .13], [x, .085, z]])),
    stringers: rows.map(z => [[width, .03, .13], [0, .145, z]]),
    deck: [-.51, -.255, 0, .255, .51].map(x => [[.18, .05, depth], [x, .185, 0]]),
  };
}

/** Wooden industrial pallet with 0–27 fixed-size boxes in 27 stable slots; zero is the empty pallet. No wrap, motion, or inferred unit identities. */
export function createPallet(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pallet = new THREE.Group(); pallet.name = 'pallet';
  const { count } = resolveCountRepresentation(node, assetCountDefinitions.pallet);
  const color = resolveObjectColor(node, context, 'surface', '#dab383'), { depth } = PALLET, { runners, blocks, stringers, deck } = palletBoards();
  // Reuse the warehouse prototype's wood tones and slat/block construction, with a ground-centered pivot; deck boards alternate tones.
  for (const [size, position] of runners) block(pallet, size, position, '#ab8257', 'pallet-runner', { bevel: .006, roughness: .9 });
  for (const [size, position] of blocks) block(pallet, size, position, position[0] === 0 ? '#b48b5c' : '#c29966', 'pallet-block', { bevel: .008, roughness: .9 });
  for (const [size, position] of stringers) block(pallet, size, position, '#b38a5d', 'pallet-stringer', { roughness: .9 });
  for (const [i, [size, position]] of deck.entries()) block(pallet, size, position, i % 2 ? '#c9a271' : '#c29966', 'pallet-deck', { bevel: .008, roughness: .9 });
  for (let i = 0; i < count; i++) {
    const box = parcelPart(color, i); box.scale.set(.333, .4, .35);
    box.position.set((i % 3 - 1) * .38, .2 + Math.floor(i / 9) * .36, (Math.floor(i / 3) % 3 - 1) * .32); pallet.add(box);
  }
  anchor(pallet, 'load', [0, PALLET.deckTop, 0]); anchor(pallet, 'front', [0, 0, depth / 2]);
  return pallet;
}
