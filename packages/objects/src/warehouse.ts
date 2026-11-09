import * as THREE from 'three';
import { resolveObjectColor } from './object-palette';
import { resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from './asset-counts';
import { setAssetAnimator } from '@opsorama/three';
import type { MaterialContext } from '@opsorama/three';
import { anchor, block, cylinder, gridWires, merged, part, wires } from './parts';
import { kitPalette, variantOf } from './kit';
import { createVehicleOperator } from './worker';
import { driveForks } from './forks';
import { PALLET, palletBoards } from './parcels';

export type StretchWrapperVariant = 'wrapping' | 'empty';
export type SafetyBarrierVariant = 'rail' | 'bollard';

const WOOD = '#c29966', WOOD_DARK = '#a98059', CARTON = '#d9b48a', FILM = '#e8f1f8';
/** One merged mesh for a wooden pallet (runners, blocks and deck boards), its base at `y`. */
function pallet(group: THREE.Object3D, [x, y, z]: readonly [number, number, number], width: number, depth: number, tone = WOOD, name = 'pallet-wood'): THREE.Mesh {
  const boards: THREE.BufferGeometry[] = [];
  for (const dx of [-1, 0, 1]) boards.push(new THREE.BoxGeometry(width * .12, .1, depth).translate(x + dx * width * .42, y + .05, z));
  for (let i = 0; i < 5; i++) boards.push(new THREE.BoxGeometry(width, .03, depth * .14).translate(x, y + .115, z + (i - 2) * depth * .215));
  for (const dz of [-1, 1]) boards.push(new THREE.BoxGeometry(width, .02, depth * .14).translate(x, y + .01, z + dz * depth * .43));
  return merged(group, boards, tone, name, { roughness: .9 });
}
/**
 * Stretch-wrapped carton load on its pallet. The film is a glossy shell in the tone a 28 % film overlay gave on the cartons,
 * drawn opaque so loads merge and instance instead of sorting as transparent parts.
 */
function wrappedLoad(group: THREE.Object3D, base: readonly [number, number, number], width: number, depth: number, height: number, carton = CARTON) {
  pallet(group, base, width, depth);
  block(group, [width - .06, height, depth - .06], [base[0], base[1] + .13 + height / 2, base[2]], carton, 'load-cartons', { bevel: .02, roughness: .85 });
  block(group, [width - .02, height * .9, depth - .02], [base[0], base[1] + .13 + height * .47, base[2]], `#${new THREE.Color(carton).lerp(new THREE.Color(FILM), .28).getHexString()}`, 'load-film', { roughness: .1 });
}

export const PALLET_RACK = Object.freeze({ levels: [0, 1.56, 3.06] as const, positions: [-.65, .65] as const, width: 2.75, depth: 1.1, height: 4.5 });
/**
 * Single selective pallet-rack bay, 2.75 × 1.1 × 4.5 m, picked from +z. `count` fills 0–6 fixed pallet positions
 * (two per level, floor first). Loads are decorative and do not encode SKUs or stock. Color changes the upright frames.
 */
export function createPalletRack(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), upright = node.materials?.accent ?? node.color ?? p.accent, beam = p.warning, { levels, positions, width, depth, height } = PALLET_RACK;
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['pallet-rack']);
  const rack = new THREE.Group(); rack.name = 'pallet-rack';
  const bracing: THREE.BufferGeometry[] = [];
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2 + .04, depth / 2 - .04]) { block(rack, [.09, height, .07], [x, height / 2, z], upright, 'rack-upright', { roughness: .45 }); block(rack, [.16, .015, .14], [x, .0075, z], p.structure, 'rack-base-plate'); }
    for (let i = 0; i < 6; i++) {
      const y0 = .15 + i * .7, y1 = y0 + .7, length = Math.hypot(depth - .08, .7);
      bracing.push(new THREE.BoxGeometry(.03, length, .03).rotateX((i % 2 ? 1 : -1) * Math.atan2(depth - .08, .7)).translate(x, (y0 + y1) / 2, 0));
    }
  }
  merged(rack, bracing, upright, 'rack-bracing', { roughness: .45 });
  for (const y of [...levels.slice(1), 4.4]) for (const z of [-depth / 2 + .04, depth / 2 - .04]) block(rack, [width, .12, .05], [0, y - .06, z], beam, 'rack-beam', { bevel: .01, roughness: .45 });
  for (let i = 0; i < count; i++) {
    const load = new THREE.Group(); load.name = `count-part-${i}`; load.position.set(positions[i % 2], levels[Math.floor(i / 2)], 0); rack.add(load);
    wrappedLoad(load, [0, 0, 0], 1, 1.2, .95);
  }
  levels.forEach((y, level) => positions.forEach((x, index) => anchor(rack, `slot-${level * 2 + index}`, [x, y, depth / 2])));
  anchor(rack, 'front', [0, 0, depth / 2 + .1]);
  return rack;
}

/** `empty` (default) shows the vacant compartment; `operated` adds a static standing operator in a high-visibility vest (scene warning role). */
export type ReachTruckVariant = 'empty' | 'operated';
/** Top of the low stand-in compartment floor on the -x side. */
const REACH_STEP_TOP = .22;

/**
 * Narrow-aisle reach truck facing +z: straddle legs, a tall mast and forks, a low stand-in operator compartment beside the
 * battery body under an overhead guard. `forks` raises the carriage and reaches the mast forward between the legs; the `load` and
 * `front` anchors move with the forks. Alerts belong to host labels or separate markers. Movement uses host routes only.
 */
export function createReachTruck(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['empty', 'operated'] as const, 'reach truck'), p = kitPalette(node, context), body = node.materials?.accent ?? node.color ?? p.accent, metal = { metalness: .3, roughness: .4 };
  const truck = new THREE.Group(); truck.name = 'reach-truck';
  // Battery and drive body on the +x side; the operator stands in the low compartment on the -x side.
  block(truck, [.62, .9, 1.05], [.24, .55, -.45], body, 'reach-body', { bevel: .06, roughness: .45 });
  block(truck, [.5, .52, .14], [-.3, .36, -.91], body, 'reach-body', { bevel: .04, roughness: .45 });
  block(truck, [.52, .06, .8], [.24, 1.03, -.5], p.structure, 'reach-battery-hood', { bevel: .02 });
  for (const x of [-.5, .5]) {
    block(truck, [.15, .18, 1.25], [x, .14, .62], p.structure, 'reach-straddle-leg', { bevel: .02 });
    const wheel = cylinder(truck, .1, .1, 0, p.screen, 'reach-load-wheel', { segments: 16 }); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .1, 1.1);
  }
  const drive = cylinder(truck, .17, .14, 0, p.screen, 'reach-drive-wheel', { segments: 16 }); drive.rotation.z = Math.PI / 2; drive.position.set(.3, .17, -.75);
  // Low operator compartment under a four-post overhead guard; the posts stand on the chassis.
  block(truck, [.5, .08, .74], [-.3, REACH_STEP_TOP - .04, -.47], p.structure, 'reach-floor');
  block(truck, [.4, .4, .08], [-.3, 1.05, -.8], p.screen, 'reach-backrest', { bevel: .03 });
  block(truck, [.22, .12, .26], [-.07, 1.1, -.2], p.structure, 'reach-controls', { bevel: .02 });
  for (const x of [-.5, .5]) for (const z of [-.95, -.05]) block(truck, [.05, 2.1, .05], [x, 1.15, z], p.structure, 'reach-guard-post', metal);
  if (variant === 'operated') { const operator = createVehicleOperator(node.id, 'standing', { theme: context?.theme ?? 'light', palette: { ...context?.palette, ...node.materials } }); operator.position.set(-.3, REACH_STEP_TOP, -.5); truck.add(operator); }
  block(truck, [1.1, .05, 1], [0, 2.2, -.5], p.structure, 'reach-guard', metal);
  for (const x of [-.3, 0, .3]) block(truck, [.04, .06, .95], [x, 2.25, -.5], p.trim, 'reach-guard-bar');
  // The mast slides forward as one assembly; the carriage rises along it and carries the forks and the load anchor.
  const mast = new THREE.Group(), carriage = new THREE.Group(); mast.name = 'reach-mast-assembly'; carriage.name = 'reach-fork-carriage'; truck.add(mast); mast.add(carriage);
  for (const x of [-.34, .34]) block(mast, [.1, 4.3, .12], [x, 2.35, .18], p.structure, 'reach-mast', metal);
  for (const y of [.6, 2.2, 3.8, 4.45]) block(mast, [.78, .08, .08], [0, y, .18], p.structure, 'reach-mast-tie', metal);
  block(carriage, [.8, .5, .05], [0, .55, .3], p.trim, 'reach-carriage', metal);
  for (const x of [-.25, .25]) block(carriage, [.12, .05, 1.1], [x, .2, .9], p.trim, 'reach-fork', metal);
  anchor(carriage, 'load', [0, .23, .9]); anchor(carriage, 'front', [0, .2, 1.5]);
  driveForks(truck, node, [mast, carriage], ({ height, reach }) => { carriage.position.y = height; mast.position.z = reach; });
  return truck;
}

/**
 * Turntable pallet stretch wrapper with a film-carriage mast at +x. The `wrapping` variant carries a load; optional local
 * motion turns the table on the shared clock (stopped with localMotion: false). Host alerts are separate.
 */
export function createStretchWrapper(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['wrapping', 'empty'] as const, 'stretch wrapper'), p = kitPalette(node, context), frame = node.materials?.accent ?? node.color ?? p.accent;
  const wrapper = new THREE.Group(); wrapper.name = `stretch-wrapper-${variant}`;
  cylinder(wrapper, 1.05, .1, .05, p.structure, 'wrapper-base', { segments: 40 });
  const table = new THREE.Group(); table.name = 'wrapper-table'; table.position.y = .1; wrapper.add(table);
  cylinder(table, 1, .04, .02, p.trim, 'wrapper-turntable', { segments: 40, metalness: .3, roughness: .4 });
  if (variant === 'wrapping') {
    wrappedLoad(table, [0, .04, 0], 1, 1.2, 1.1);
  }
  block(wrapper, [.6, .15, .6], [1.45, .075, 0], p.structure, 'wrapper-mast-base');
  block(wrapper, [.25, 2.6, .25], [1.45, 1.45, 0], frame, 'wrapper-mast', { bevel: .03, roughness: .45 });
  block(wrapper, [.32, .42, .36], [1.24, 1.15, 0], frame, 'wrapper-carriage', { bevel: .03 });
  cylinder(wrapper, .08, .36, 1.15, FILM, 'wrapper-film-roll', { segments: 16, roughness: .2 }).position.set(1.03, 1.15, 0);
  block(wrapper, [.3, .4, .16], [1.45, 1.45, .25], p.structure, 'wrapper-panel', { bevel: .02 });
  block(wrapper, [.2, .14, .01], [1.45, 1.53, .335], p.screen, 'wrapper-screen', { roughness: .2 });
  anchor(wrapper, 'table', [0, .14, 0]); anchor(wrapper, 'operator', [1.45, 0, .8]);
  if (variant === 'wrapping' && node.localMotion !== false) setAssetAnimator(wrapper, ({ time }) => { table.rotation.y = time * .8; }, [table]);
  return wrapper;
}

export const FLOW_RACK = Object.freeze({ lanes: 4, levels: 3, width: 2, depth: 1.2, slope: .2 });
/**
 * Carton flow rack for picking: three inclined roller levels, four lanes each, picked at +z and replenished at −z.
 * `count` fills 0–12 lanes with two cartons each, bottom level first; every lane has a pick-to-light module whose LED is lit
 * while the lane is filled. The header is a surface-label area. Color changes the frame.
 */
export function createCartonFlowRack(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), frame = node.materials?.accent ?? node.color ?? p.accent, { lanes, levels, width, depth, slope } = FLOW_RACK, angle = Math.atan2(slope, depth);
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['carton-flow-rack']);
  const rack = new THREE.Group(); rack.name = 'carton-flow-rack';
  for (const x of [-width / 2, width / 2]) for (const [z, h] of [[depth / 2, 2], [-depth / 2, 2.2]] as const) block(rack, [.06, h, .06], [x, h / 2, z], frame, 'flow-upright', { roughness: .45 });
  for (let level = 0; level < levels; level++) {
    const y = .45 + level * .5, bed = new THREE.Group(); bed.name = `flow-level-${level}`; bed.position.y = y + slope / 2; bed.rotation.x = angle; rack.add(bed);
    for (const z of [-depth / 2, depth / 2]) block(bed, [width, .06, .04], [0, -.03, z], frame, 'flow-beam');
    block(bed, [width - .04, .02, depth], [0, -.04, 0], p.trim, 'flow-bed', { metalness: .3, roughness: .45 });
    for (let lane = 0; lane <= lanes; lane++) block(bed, [.02, .04, depth], [-width / 2 + .02 + lane * (width - .04) / lanes, 0, 0], p.structure, 'flow-divider');
    // Roller lines across the lane width, in the tilted bed plane.
    const lines: number[] = [], rollers: number[] = []; gridWires(lines, [0, 0, 0], [width - .04, depth], .08, 'z');
    for (let k = 0; k < lines.length; k += 6) if (lines[k + 1] === lines[k + 4]) rollers.push(lines[k], -.028, lines[k + 1], lines[k + 3], -.028, lines[k + 4]);
    wires(bed, rollers, p.structure, 'flow-rollers');
    for (let lane = 0; lane < lanes; lane++) {
      const x = -width / 2 + .02 + (lane + .5) * (width - .04) / lanes, slot = level * lanes + lane;
      block(rack, [.12, .05, .04], [x, y - .07, depth / 2 + .03], p.screen, 'flow-pick-light');
      block(rack, [.03, .02, .01], [x - .03, y - .07, depth / 2 + .055], slot < count ? p.normal : p.inactive, 'flow-pick-led', slot < count ? { emissive: p.normal } : {});
      if (slot < count) {
        const carton = new THREE.Group(); carton.name = `count-part-${slot}`; bed.add(carton); carton.position.set(x, .13, depth / 2 - .22);
        block(carton, [.4, .24, .4], [0, 0, 0], CARTON, 'flow-carton', { bevel: .015, roughness: .85 });
        block(carton, [.4, .24, .4], [0, 0, -.42], CARTON, 'flow-carton', { bevel: .015, roughness: .85 });
      }
    }
  }
  block(rack, [width + .06, .22, .04], [0, 2.1, depth / 2], frame, 'flow-header', { bevel: .01 });
  anchor(rack, 'front', [0, 0, depth / 2 + .1]); anchor(rack, 'back', [0, 0, -depth / 2 - .1]);
  return rack;
}

/**
 * Warehouse impact protection: a 2 m double guard rail on three posts (start/end anchors for chaining) or a single
 * bollard with reflective bands. It does not encode a restricted zone. Color changes the steel (default warning role).
 */
export function createSafetyBarrier(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const variant = variantOf(node, ['rail', 'bollard'] as const, 'safety barrier'), p = kitPalette(node, context), steel = node.materials?.warning ?? node.color ?? p.warning;
  const barrier = new THREE.Group(); barrier.name = `safety-barrier-${variant}`;
  if (variant === 'rail') {
    for (const x of [-1, 0, 1]) { block(barrier, [.2, .015, .2], [x, .0075, 0], p.structure, 'barrier-base-plate'); block(barrier, [.12, .9, .12], [x, .465, 0], steel, 'barrier-post', { bevel: .02, roughness: .45 }); }
    for (const y of [.4, .75]) block(barrier, [2.1, .12, .1], [0, y, .1], steel, 'barrier-rail', { bevel: .04, roughness: .45 });
    for (const x of [-.5, .5]) block(barrier, [.2, .06, .005], [x, .75, .153], p.screen, 'barrier-stripe').rotation.z = .6;
    anchor(barrier, 'start', [-1, 0, 0]); anchor(barrier, 'end', [1, 0, 0]);
  } else {
    block(barrier, [.26, .015, .26], [0, .0075, 0], p.structure, 'barrier-base-plate');
    cylinder(barrier, .08, 1.1, .565, steel, 'barrier-bollard', { segments: 20, roughness: .45 });
    for (const y of [.75, .95]) cylinder(barrier, .082, .07, y, p.screen, 'barrier-band', { segments: 20, roughness: .4 });
    part(barrier, new THREE.SphereGeometry(.08, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 'barrier-bollard', { roughness: .45 }).position.y = 1.115;
  }
  return barrier;
}

/** Stack of 1–12 empty pallets the size of the `pallet` object, one `PALLET.deckTop` per layer, with a slight deterministic offset. Pallets are decorative, not counted stock records. */
export function createPalletStack(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const { count } = resolveCountRepresentation(node, assetCountDefinitions['pallet-stack']), stack = new THREE.Group(); stack.name = 'pallet-stack';
  const boards = Object.values(palletBoards()).flat();
  for (let i = 0; i < count; i++) {
    const layer = new THREE.Group(); layer.name = `count-part-${i}`; layer.position.set(Math.sin(i * 2.3) * .03, i * PALLET.deckTop, Math.cos(i * 1.7) * .03); layer.rotation.y = Math.sin(i * 3.1) * .03; stack.add(layer);
    merged(layer, boards.map(([[width, height, depth], [x, y, z]]) => new THREE.BoxGeometry(width, height, depth).translate(x, y, z)), resolveObjectColor(node, context, 'wood', i % 3 === 1 ? WOOD_DARK : WOOD), 'pallet-wood', { roughness: .9 });
  }
  anchor(stack, 'base', [0, 0, 0]);
  return stack;
}

/**
 * 1 m³ intermediate bulk container: white tank inside a welded steel cage on a pallet base, with a top cap and a bottom
 * outlet valve facing +z. It does not show a fill level or contents. Color changes the tank.
 */
export function createIbcTank(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), tank = resolveObjectColor(node, context, 'surface', '#eef2f5'), metal = { metalness: .35, roughness: .4 };
  const ibc = new THREE.Group(); ibc.name = 'ibc-tank';
  block(ibc, [1.2, .15, 1], [0, .075, 0], p.structure, 'ibc-base', { bevel: .02 });
  block(ibc, [1.12, .95, .92], [0, .64, 0], tank, 'ibc-tank-body', { bevel: .08, roughness: .35 });
  for (const x of [-.58, .58]) for (const z of [-.48, .48]) block(ibc, [.04, 1, .04], [x, .65, z], p.trim, 'ibc-cage-post', metal);
  for (const y of [.16, 1.14]) { for (const z of [-.48, .48]) block(ibc, [1.2, .03, .03], [0, y, z], p.trim, 'ibc-cage-rail', metal); for (const x of [-.58, .58]) block(ibc, [.03, .03, 1], [x, y, 0], p.trim, 'ibc-cage-rail', metal); }
  const cage: number[] = [];
  for (const z of [-.48, .48]) gridWires(cage, [0, .65, z], [1.16, .98], .16, 'z');
  for (const x of [-.58, .58]) gridWires(cage, [x, .65, 0], [.96, .98], .16, 'x');
  wires(ibc, cage, p.trim, 'ibc-cage');
  cylinder(ibc, .1, .05, 1.14, p.structure, 'ibc-cap', { segments: 16 });
  const outlet = cylinder(ibc, .05, .12, 0, p.structure, 'ibc-outlet', { segments: 12 }); outlet.rotation.x = Math.PI / 2; outlet.position.set(0, .26, .5);
  block(ibc, [.12, .04, .04], [0, .32, .53], p.critical, 'ibc-valve-lever');
  anchor(ibc, 'outlet', [0, .26, .56]); anchor(ibc, 'top', [0, 1.17, 0]);
  return ibc;
}

/** Steel drums on a pallet: `count` places 1–4 in fixed 2 × 2 slots. Drums are decorative, not hazardous-goods records. Color changes the drums. */
export function createDrumPallet(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), drum = node.materials?.accent ?? node.color ?? p.accent, { count } = resolveCountRepresentation(node, assetCountDefinitions['drum-pallet']);
  const group = new THREE.Group(); group.name = 'drum-pallet';
  pallet(group, [0, 0, 0], 1.2, 1.2);
  for (let i = 0; i < count; i++) {
    const item = new THREE.Group(); item.name = `count-part-${i}`; item.position.set((i % 2 - .5) * .6, .13, (Math.floor(i / 2) - .5) * .6); group.add(item);
    cylinder(item, .28, .88, .44, drum, 'drum-body', { segments: 24, metalness: .25, roughness: .4 });
    for (const y of [.3, .6]) { const rib = part(item, new THREE.TorusGeometry(.282, .012, 6, 28), drum, 'drum-body', { metalness: .25, roughness: .4 }); rib.rotation.x = Math.PI / 2; rib.position.y = y; }
    const rim = part(item, new THREE.TorusGeometry(.27, .015, 6, 28), p.trim, 'drum-rim', { metalness: .3 }); rim.rotation.x = Math.PI / 2; rim.position.y = .88;
    cylinder(item, .035, .02, .89, p.trim, 'drum-bung', { segments: 10 }).position.set(.14, .89, .05);
  }
  anchor(group, 'load', [0, .13, 0]);
  return group;
}

/** Flexible intermediate bulk container (big bag) on a pallet with four lifting loops and a filling spout. Fill and contents are host data. Color changes the bag. */
export function createBulkBag(node: AssetNode, context?: MaterialContext): THREE.Object3D {
  const p = kitPalette(node, context), fabric = resolveObjectColor(node, context, 'surface', '#e8e2d4');
  const bag = new THREE.Group(); bag.name = 'bulk-bag';
  pallet(bag, [0, 0, 0], 1.1, 1.1);
  block(bag, [.95, .95, .95], [0, .61, 0], fabric, 'bag-body', { bevel: .16, roughness: .95 });
  for (const x of [-.4, .4]) for (const z of [-.4, .4]) { const loop = part(bag, new THREE.TorusGeometry(.09, .02, 6, 12, Math.PI), fabric, 'bag-loop', { roughness: .95 }); loop.position.set(x, 1.06, z); loop.rotation.y = Math.atan2(x, z); }
  cylinder(bag, .14, .16, 1.15, fabric, 'bag-spout', { bottomRadius: .2, segments: 14, roughness: .95 });
  block(bag, [.22, .3, .01], [.2, .65, .48], '#fbfcfe', 'bag-tag');
  for (const x of [-.48, .48]) block(bag, [.01, .9, .06], [x, .6, 0], p.accent, 'bag-stripe');
  anchor(bag, 'top', [0, 1.23, 0]);
  return bag;
}
