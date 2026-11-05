import * as THREE from 'three';
import type { MaterialContext } from './laboratory';
import { resolveObjectColor } from './object-palette';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { anchor, block, cylinder, gridWires, ITEM_TONES, part, wires } from './parts';

const FRAME = '#7f8fa6', DARK = '#273545', PAPER = '#fbfcfe';

function caster(group: THREE.Object3D, x: number, z: number, radius = .06) {
  const wheel = part(group, new THREE.CylinderGeometry(radius, radius, .04, 12), DARK, 'caster'); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, radius, z);
}

/** Order ticket in a small stand facing +z: a work token for orders that are not yet in a tote or box. Color changes the header strip. */
export function createOrderTicket(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const ticket = new THREE.Group(); ticket.name = 'order-ticket';
  const header = resolveObjectColor(node, context, 'accent', '#e8a33d');
  block(ticket, [.36, .04, .16], [0, .02, 0], '#c9d4e2', 'ticket-stand', { bevel: .012 });
  block(ticket, [.05, .08, .05], [0, .08, 0], DARK, 'ticket-clip');
  block(ticket, [.34, .44, .012], [0, .34, 0], PAPER, 'ticket-card', { roughness: .9 });
  block(ticket, [.12, .03, .03], [0, .12, 0], '#56657a', 'ticket-clip', { metalness: .3, roughness: .4 });
  block(ticket, [.34, .08, .004], [0, .52, .008], header, 'ticket-header');
  for (const [index, width] of [.24, .2, .14].entries()) block(ticket, [width, .018, .004], [-(.24 - width) / 2, .43 - index * .05, .008], '#c3cedc', 'ticket-line');
  for (let i = 0; i < 9; i++) block(ticket, [.008 + (i % 3) * .004, .05, .004], [-.08 + i * .02, .2, .008], '#4b5a6e', 'ticket-barcode');
  anchor(ticket, 'top', [0, .56, 0]);
  return ticket;
}

/** Small open tote used by the picking cart; contents are one decorative item. */
function cartTote(group: THREE.Object3D, color: string, tone: string): void {
  block(group, [.5, .02, .34], [0, .01, 0], color, 'cart-tote');
  block(group, [.52, .02, .36], [0, .2, 0], color, 'cart-tote');
  for (const z of [-.16, .16]) block(group, [.5, .2, .02], [0, .1, z], color, 'cart-tote');
  for (const x of [-.24, .24]) block(group, [.02, .2, .3], [x, .1, 0], color, 'cart-tote');
  block(group, [.3, .14, .2], [0, .09, 0], tone, 'cart-tote-item', { bevel: .012 });
}
const PICK_DECKS = [.215, .765] as const;
/** Two-level picking cart pushed toward +z; `count` fills 0–6 fixed tote slots, bottom level first. Color changes the totes. */
export function createPickingCart(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const cart = new THREE.Group(); cart.name = 'picking-cart';
  const color = resolveObjectColor(node, context, 'accent', '#4f86d9');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['picking-cart']);
  for (const y of PICK_DECKS) {
    block(cart, [.62, .03, 1.2], [0, y - .015, 0], FRAME, 'cart-deck');
    for (const x of [-.3, .3]) block(cart, [.03, .05, 1.2], [x, y + .01, 0], FRAME, 'cart-deck-lip');
  }
  for (const x of [-.3, .3]) for (const z of [-.58, .58]) block(cart, [.035, 1, .035], [x, .62, z], FRAME, 'cart-post');
  block(cart, [.66, .045, .045], [0, 1.12, -.6], DARK, 'cart-handle', { bevel: .015 });
  for (const x of [-.24, .24]) { const grip = cylinder(cart, .03, .14, 1.12, '#3a4656', 'cart-grip', { segments: 10 }); grip.rotation.z = Math.PI / 2; grip.position.set(x, 1.12, -.6); }
  for (const x of [-.3, .3]) for (const z of [-.5, .5]) caster(cart, x, z);
  for (let i = 0; i < count; i++) {
    const tote = new THREE.Group(); tote.name = `count-part-${i}`; tote.position.set(0, PICK_DECKS[Math.floor(i / 3)], (i % 3 - 1) * .38); cart.add(tote);
    cartTote(tote, color, ITEM_TONES[i % 3]);
  }
  anchor(cart, 'handle', [0, 1.12, -.6]);
  return cart;
}

const WALL = { columns: 4, rows: 5, width: .45, height: .36, depth: .45, base: .3 } as const;
/**
 * Put wall for order consolidation: a 4 × 5 grid of open cubbies, put from the back (−z) and picked from the front (+z).
 * `count` fills 0–20 cubbies from the bottom-left; contents are decorative and share the wall's identity. Color changes the frame.
 */
export function createPutWall(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const wall = new THREE.Group(); wall.name = 'put-wall';
  const frame = resolveObjectColor(node, context, 'accent', '#5a7fd6'), { columns, rows, width, height, depth, base } = WALL;
  const totalWidth = columns * width, top = base + rows * height;
  for (const x of [-totalWidth / 2, totalWidth / 2]) for (const z of [-depth / 2, depth / 2]) block(wall, [.04, base, .04], [x, base / 2, z], DARK, 'putwall-leg');
  for (let row = 0; row <= rows; row++) block(wall, [totalWidth + .04, .025, depth], [0, base + row * height, 0], '#eef2f7', 'putwall-shelf');
  for (let column = 0; column <= columns; column++) block(wall, [.025, rows * height, depth], [-totalWidth / 2 + column * width, base + rows * height / 2, 0], frame, 'putwall-divider');
  block(wall, [totalWidth + .04, .16, .03], [0, top + .1, .2], frame, 'putwall-header', { bevel: .01 });
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = -totalWidth / 2 + (column + .5) * width, y = base + row * height;
    block(wall, [.12, .035, .012], [x - .08, y - .002, depth / 2 + .006], PAPER, 'putwall-tag');
    block(wall, [.05, .035, .02], [x + .1, y - .002, depth / 2 + .01], '#3a4656', 'putwall-light');
  }
  const count = resolveCountRepresentation(node, assetCountDefinitions['put-wall']).count;
  for (let i = 0; i < count; i++) {
    const x = -totalWidth / 2 + (i % columns + .5) * width, y = base + Math.floor(i / columns) * height + .0125;
    const bundle = new THREE.Group(); bundle.name = `count-part-${i}`; bundle.position.set(x, y, 0); wall.add(bundle);
    block(bundle, [.26, .16, .24], [-.04, .08, 0], ITEM_TONES[i % 3], 'putwall-item', { bevel: .012 });
    if (i % 2 === 0) block(bundle, [.12, .1, .18], [.11, .05, .02], ITEM_TONES[(i + 1) % 3], 'putwall-item', { bevel: .01 });
  }
  anchor(wall, 'front', [0, 0, depth / 2 + .4]); anchor(wall, 'back', [0, 0, -depth / 2 - .4]);
  return wall;
}

/** Roll cage for outbound parcels, open at the front (+z); `count` fills 0–12 fixed slots, two by two per layer. Color changes the wire frame. */
export function createRollCage(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const cage = new THREE.Group(); cage.name = 'roll-cage';
  const wire = resolveObjectColor(node, context, 'structure', '#8fa0b5'), mesh = { opacity: .14 };
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['roll-cage']);
  block(cage, [.8, .05, .7], [0, .145, 0], '#56657a', 'cage-base');
  for (const x of [-.32, .32]) for (const z of [-.28, .28]) caster(cage, x, z);
  for (const x of [-.39, .39]) for (const z of [-.34, .34]) block(cage, [.025, 1.5, .025], [x, .92, z], wire, 'cage-frame');
  for (const y of [.6, 1.1, 1.66]) {
    block(cage, [.8, .02, .02], [0, y, -.34], wire, 'cage-frame');
    for (const x of [-.39, .39]) block(cage, [.02, .02, .7], [x, y, 0], wire, 'cage-frame');
  }
  block(cage, [.76, 1.48, .01], [0, .92, -.34], '#c3d0e0', 'cage-mesh', mesh);
  for (const x of [-.39, .39]) block(cage, [.01, 1.48, .66], [x, .92, 0], '#c3d0e0', 'cage-mesh', mesh);
  const grid: number[] = []; gridWires(grid, [0, .92, -.34], [.76, 1.48], .1, 'z'); for (const x of [-.39, .39]) gridWires(grid, [x, .92, 0], [.66, 1.48], .1, 'x');
  wires(cage, grid, wire, 'cage-wire');
  for (let i = 0; i < count; i++) {
    const parcel = block(cage, [.32, .28, .27], [(i % 2 - .5) * .36, .31 + Math.floor(i / 4) * .3, (Math.floor(i / 2) % 2 - .5) * .31], ITEM_TONES[i % 3], `count-part-${i}`, { bevel: .015 });
    parcel.rotation.y = (i % 3 - 1) * .04;
  }
  anchor(cage, 'front', [0, 0, .55]);
  return cage;
}

export type StationVariant = 'standard' | 'packing' | 'inspection';
/** Returns-inspection accessories for the station bench: task lamp, open return carton, item tray and clipboard. Decorative only. */
export function addInspectionKit(group: THREE.Object3D): void {
  block(group, [.16, .03, .16], [-1.2, 1.245, -.4], DARK, 'inspection-lamp');
  block(group, [.03, .55, .03], [-1.2, 1.53, -.4], FRAME, 'inspection-lamp');
  block(group, [.4, .03, .03], [-1.01, 1.79, -.4], FRAME, 'inspection-lamp');
  block(group, [.18, .06, .14], [-.82, 1.76, -.4], DARK, 'inspection-lamp');
  block(group, [.14, .01, .1], [-.82, 1.725, -.4], '#fff2cc', 'inspection-light', { emissive: '#fff2cc' });
  block(group, [.45, .25, .35], [-.5, 1.355, .05], '#cfa87e', 'inspection-carton');
  for (const side of [-1, 1]) block(group, [.015, .18, .35], [-.5 + side * .27, 1.5, .05], '#c49d73', 'inspection-flap').rotation.z = side * -.6;
  block(group, [.5, .03, .35], [.1, 1.245, .2], '#c3cedc', 'inspection-tray');
  block(group, [.18, .12, .14], [.1, 1.32, .2], ITEM_TONES[1], 'inspection-item');
  block(group, [.22, .01, .3], [1.2, 1.235, .3], PAPER, 'inspection-clipboard');
  block(group, [.08, .02, .03], [1.2, 1.245, .16], DARK, 'inspection-clipboard');
}
/** Packing accessories for the shared station bench (surface top at y = 1.23): paper roll, tape, open carton, scale and a lower shelf of flat cartons. */
export function addPackingKit(group: THREE.Object3D): void {
  for (const x of [-1.25, -.35]) block(group, [.04, .5, .04], [x, 1.48, -.45], FRAME, 'packing-roll-holder');
  const roll = part(group, new THREE.CylinderGeometry(.11, .11, .86, 16), '#d9c3a0', 'packing-paper-roll'); roll.rotation.z = Math.PI / 2; roll.position.set(-.8, 1.7, -.45);
  block(group, [.6, .005, .5], [-.8, 1.235, -.05], '#e8d9bd', 'packing-paper');
  block(group, [.5, .3, .4], [-.15, 1.38, .05], '#d9b48a', 'packing-carton');
  for (const side of [-1, 1]) block(group, [.5, .015, .2], [-.15, 1.53, .05 + side * .29], '#cfa87e', 'packing-flap').rotation.x = side * -.5;
  block(group, [.22, .1, .12], [.3, 1.28, .38], DARK, 'packing-tape');
  block(group, [.36, .03, .36], [1.2, 1.245, .25], '#c3cedc', 'packing-scale');
  block(group, [2.68, .03, 1], [0, .285, 0], '#e4eaf2', 'packing-shelf');
  for (let i = 0; i < 6; i++) block(group, [1.1, .02, .7], [0, .32 + i * .025, 0], i % 2 ? '#d9b48a' : '#cfa87e', 'packing-flat-carton');
}

/** Flat-carton supply on a low base; `count` stacks 0–10 strapped bundles bottom-up. Color changes the straps. Shows packaging on hand, not exact stock. */
export function createPackagingSupply(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const supply = new THREE.Group(); supply.name = 'packaging-supply';
  const strap = resolveObjectColor(node, context, 'accent', '#4f86d9');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['packaging-supply']);
  // Low pallet: three runners under five deck boards, together the original 0.1 m base.
  for (const z of [-.33, 0, .33]) block(supply, [1, .06, .12], [0, .03, z], '#a98059', 'supply-base', { roughness: .9 });
  for (const x of [-.42, -.21, 0, .21, .42]) block(supply, [.15, .04, .8], [x, .08, 0], '#b88e65', 'supply-base', { roughness: .9, bevel: .006 });
  for (let i = 0; i < count; i++) {
    const bundle = new THREE.Group(); bundle.name = `count-part-${i}`; bundle.position.y = .1 + i * .13; supply.add(bundle);
    block(bundle, [.9, .12, .7], [0, .06, 0], i % 2 ? '#cfa87e' : '#d9b48a', 'supply-bundle', { bevel: .008, roughness: .9 });
    for (const x of [-.25, .25]) block(bundle, [.06, .125, .71], [x, .06, 0], strap, 'supply-strap', { roughness: .4 });
  }
  anchor(supply, 'top', [0, 1.3925, 0]);
  return supply;
}

/** Desktop thermal label printer facing +z with a label tongue; the printed label is a surface-label area. Color changes the lid. */
export function createLabelPrinter(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const printer = new THREE.Group(); printer.name = 'label-printer';
  block(printer, [.3, .14, .3], [0, .07, 0], '#e9eef5', 'printer-body', { bevel: .02, roughness: .5 });
  block(printer, [.3, .06, .22], [0, .17, -.04], resolveObjectColor(node, context, 'structure', '#3a4656'), 'printer-lid', { bevel: .02, roughness: .4 });
  block(printer, [.12, .025, .08], [0, .19, -.05], '#a9cbe8', 'printer-window', { opacity: .55, roughness: .1 });
  cylinder(printer, .016, .012, .146, '#56657a', 'printer-button', { segments: 12 }).position.set(-.1, .146, .1);
  block(printer, [.2, .015, .01], [0, .12, .151], DARK, 'printer-slot');
  block(printer, [.16, .005, .12], [0, .121, .21], PAPER, 'printer-label');
  block(printer, [.03, .03, .01], [.11, .07, .151], '#8ddac2', 'printer-power-mark');
  anchor(printer, 'label', [0, .124, .21]);
  return printer;
}

/** Floor platform scale with a display column at the back; the display is a surface-label area for a host-supplied weight. Color changes the display head. */
export function createParcelScale(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const scale = new THREE.Group(); scale.name = 'parcel-scale';
  block(scale, [.6, .05, .6], [0, .035, 0], '#c3cedc', 'scale-platform', { bevel: .012, metalness: .2, roughness: .4 });
  for (const x of [-.25, .25]) for (const z of [-.25, .25]) cylinder(scale, .03, .01, .005, '#273545', 'scale-foot', { segments: 10 }).position.set(x, .005, z);
  block(scale, [.56, .01, .56], [0, .065, 0], '#56657a', 'scale-deck', { roughness: .85 });
  block(scale, [.14, .02, .1], [0, .07, -.27], FRAME, 'scale-column-foot');
  block(scale, [.05, .85, .05], [0, .485, -.27], FRAME, 'scale-column');
  block(scale, [.3, .16, .08], [0, .95, -.27], resolveObjectColor(node, context, 'structure', '#3a4656'), 'scale-head', { bevel: .015 });
  block(scale, [.24, .09, .01], [0, .95, -.225], '#182f46', 'scale-screen');
  anchor(scale, 'load', [0, .07, 0]);
  return scale;
}

/** Soft shipping mailer; `count` piles 1–6 in fixed slots. Each top face carries a sticker that a surface label can replace. Color changes the mailer. */
export function createPolyMailer(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const pile = new THREE.Group(); pile.name = 'poly-mailer';
  const color = resolveObjectColor(node, context, 'accent', '#7c8fd6');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['poly-mailer']);
  for (let i = 0; i < count; i++) {
    const mailer = new THREE.Group(); mailer.name = `count-part-${i}`; mailer.position.y = i * .09; mailer.rotation.y = (i % 3 - 1) * .12; pile.add(mailer);
    block(mailer, [.5, .06, .36], [0, .03, 0], color, 'mailer-body', { bevel: .025, roughness: .35 });
    block(mailer, [.44, .025, .3], [0, .0725, 0], color, 'mailer-body', { bevel: .012, roughness: .35 });
    block(mailer, [.5, .01, .04], [0, .065, -.16], '#e9eef5', 'mailer-seal');
    block(mailer, [.18, .005, .12], [.08, .0875, 0], PAPER, 'mailer-sticker');
  }
  return pile;
}

/** Postal sacks for carrier handover; `count` places 1–6 in a fixed 3 × 2 grid. Color changes the sacks. Sacks are not carrier records. */
export function createMailSack(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const group = new THREE.Group(); group.name = 'mail-sack';
  const color = resolveObjectColor(node, context, 'surface', '#8a9bb3');
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['mail-sack']);
  for (let i = 0; i < count; i++) {
    const sack = new THREE.Group(); sack.name = `count-part-${i}`; sack.position.set((i % 3 - 1) * .62, 0, (Math.floor(i / 3) - .5) * .66); sack.rotation.y = (i % 2 ? 1 : -1) * .3; group.add(sack);
    const profile = [[0, 0], [.19, .005], [.235, .06], [.245, .2], [.225, .38], [.16, .5], [.08, .56], [.06, .6]].map(([x, y]) => new THREE.Vector2(x, y));
    const body = part(sack, new THREE.LatheGeometry(profile, 14), color, 'sack-body', { roughness: .95 }); body.scale.z = .85;
    const neck = part(sack, new THREE.CylinderGeometry(.03, .065, .1, 10), color, 'sack-body', { roughness: .95 }); neck.position.y = .63;
    const tie = part(sack, new THREE.TorusGeometry(.055, .014, 6, 14), DARK, 'sack-tie'); tie.rotation.x = Math.PI / 2; tie.position.y = .6;
    block(sack, [.08, .1, .01], [.09, .5, .19], PAPER, 'sack-tag');
  }
  return group;
}

/** Marked floor pad where carriers collect outbound work, with a sign post at the back-left; the sign is a surface-label area. Color changes the border and sign. */
export function createCarrierPickupPoint(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const point = new THREE.Group(); point.name = 'carrier-pickup-point';
  const accent = resolveObjectColor(node, context, 'accent', '#e8a33d');
  block(point, [2.4, .02, 1.8], [0, .01, 0], '#dfe6f0', 'pickup-pad');
  for (const z of [-.86, .86]) block(point, [2.4, .022, .08], [0, .011, z], accent, 'pickup-border');
  for (const x of [-1.16, 1.16]) block(point, [.08, .022, 1.8], [x, .011, 0], accent, 'pickup-border');
  for (let i = 0; i < 4; i++) block(point, [.1, .023, .7], [-.6 + i * .4, .0115, 0], accent, 'pickup-hatch').rotation.y = Math.PI / 4;
  const post = part(point, new THREE.CylinderGeometry(.04, .04, 2.1, 10), '#56657a', 'pickup-post', { metalness: .3, roughness: .45 }); post.position.set(-1.1, 1.05, -.8);
  block(point, [.2, .025, .2], [-1.1, .0125, -.8], '#3a4656', 'pickup-post-foot');
  block(point, [.7, .45, .04], [-1.1, 1.9, -.8], accent, 'pickup-sign', { bevel: .012 });
  block(point, [.62, .37, .01], [-1.1, 1.9, -.775], PAPER, 'pickup-sign-panel');
  anchor(point, 'handover', [0, .02, 0]);
  return point;
}

/** Wire hold cage for blocked work, 2 × 1.6 m with a door at the front right (+z); `count` fills 0–8 fixed item slots. Color changes the frame. */
export function createHoldCage(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const cage = new THREE.Group(); cage.name = 'hold-cage';
  const frame = resolveObjectColor(node, context, 'accent', '#e0a33a'), mesh = { opacity: .12 };
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['hold-cage']);
  block(cage, [2, .02, 1.6], [0, .01, 0], '#c9d4e2', 'hold-floor');
  for (const x of [-1, 0, 1]) for (const z of [-.8, .8]) block(cage, [.05, 2, .05], [x, 1, z], frame, 'hold-frame');
  for (const z of [-.8, .8]) block(cage, [2.05, .05, .05], [0, 2, z], frame, 'hold-frame');
  for (const x of [-1, 1]) block(cage, [.05, .05, 1.6], [x, 2, 0], frame, 'hold-frame');
  block(cage, [1.96, 1.96, .01], [0, 1, -.8], '#c3d0e0', 'hold-mesh', mesh);
  for (const x of [-1, 1]) block(cage, [.01, 1.96, 1.56], [x, 1, 0], '#c3d0e0', 'hold-mesh', mesh);
  block(cage, [.96, 1.96, .01], [-.5, 1, .8], '#c3d0e0', 'hold-mesh', mesh);
  block(cage, [.9, 1.9, .02], [.5, 1, .82], '#c3d0e0', 'hold-door', mesh);
  for (const x of [.06, .94]) block(cage, [.04, 1.9, .04], [x, 1, .82], frame, 'hold-frame');
  const grid: number[] = [];
  gridWires(grid, [0, 1, -.8], [1.96, 1.96], .12, 'z'); for (const x of [-1, 1]) gridWires(grid, [x, 1, 0], [1.56, 1.96], .12, 'x');
  gridWires(grid, [-.5, 1, .8], [.96, 1.96], .12, 'z'); gridWires(grid, [.5, 1, .825], [.84, 1.9], .12, 'z');
  wires(cage, grid, '#8fa0b5', 'hold-wire');
  for (const y of [.4, 1.6]) block(cage, [.06, .12, .04], [.04, y, .84], '#56657a', 'hold-hinge');
  block(cage, [.1, .05, .03], [.9, 1.05, .855], '#56657a', 'hold-hasp');
  block(cage, [.07, .07, .03], [.9, .98, .865], '#d6b25a', 'hold-padlock', { bevel: .01, metalness: .4, roughness: .35 });
  block(cage, [.4, .25, .02], [.5, 1.5, .84], frame, 'hold-sign');
  block(cage, [.34, .19, .01], [.5, 1.5, .852], PAPER, 'hold-sign-panel');
  for (let i = 0; i < count; i++) block(cage, [.5, .4, .45], [(i % 2 - .5) * .6, .22 + Math.floor(i / 4) * .42, (Math.floor(i / 2) % 2 - .5) * .6], ITEM_TONES[i % 3], `count-part-${i}`, { bevel: .02 });
  anchor(cage, 'door', [.5, 0, .85]);
  return cage;
}
