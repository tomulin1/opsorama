import * as THREE from 'three';
import { HANDLING_FIT_TOLERANCE, receptacleAnchors, validateAssetHandling, validateHandlingProfile, handlingVocabulary, type AssetHandling, type AssetNode, type HandlingClass, type HandlingProfile, type LoadPattern, type InteractionSlotSource, type Receptacle } from '@opsorama/core';
import type { AssetFactory } from './assets';
import { disposeObject, SHELF_SLOTS } from './assets';
import { PALLET_RACK } from './warehouse';
import { PALLET } from './parcels';
import { SHIPPING_CONTAINER } from './logistics';
import { TRUCK } from './vehicles';
import { assetInteractionSlots } from './interaction-slots';
import type { ContractCheck, ContractReport } from './descriptors';

/**
 * The `logistics` domain profile (phase H0 of docs/CONTAINMENT.md). Class sizes are the real
 * nominal sizes of the catalog models at their handling scale; `checkAssetHandling` keeps them in
 * step with the built models.
 */
export const logisticsProfile: HandlingProfile = Object.freeze({
  id: 'logistics', name: 'Logistics',
  classes: Object.freeze<HandlingClass[]>([
    { id: 'logistics/carton-m', family: 'case', name: 'Medium carton', size: { footprint: [.41, .34], height: .33 }, stacking: { maxAbove: 4, families: ['case', 'soft-pack'] }, turnable: true },
    { id: 'logistics/tote', family: 'case', name: 'Tote 600 × 400', size: { footprint: [.6, .4], height: .28 }, stacking: { maxAbove: 5, families: ['case'] }, turnable: true },
    { id: 'logistics/drum-pallet', family: 'unit-load', name: 'Drums on a pallet', size: { footprint: [1.2, 1.2], height: 1.03 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
    { id: 'logistics/ibc', family: 'unit-load', name: 'IBC tank', size: { footprint: [1.2, 1.06], height: 1.165 }, stacking: { maxAbove: 1, families: ['unit-load'] }, turnable: true },
    { id: 'logistics/bulk-bag', family: 'unit-load', name: 'Bulk bag', size: { footprint: [1.1, 1.1], height: 1.23 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
    { id: 'logistics/poly-mailer', family: 'soft-pack', name: 'Poly mailer', size: { footprint: [.54, .42], height: .09 }, stacking: { maxAbove: 3, families: ['soft-pack'] }, turnable: true },
    { id: 'logistics/mail-sack', family: 'soft-pack', name: 'Mail sack', size: { footprint: [.58, .54], height: .68 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
    { id: 'logistics/roll-cage', family: 'wheeled', name: 'Roll cage', size: { footprint: [.8, .7], height: 1.67 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
    { id: 'logistics/industrial-pallet', family: 'unit-load', name: 'Industrial pallet 1200 × 1000', size: { footprint: [PALLET.width, PALLET.depth], height: PALLET.deckTop }, stacking: { maxAbove: 1, families: ['unit-load'] }, turnable: true },
  ]),
  patterns: Object.freeze<LoadPattern[]>([
    {
      id: 'logistics/carton-m-3x2', class: 'logistics/carton-m', name: 'Six medium cartons, turned, three across',
      positions: [-.39, 0, .39].flatMap(x => [-.235, .235].map(z => ({ offset: [x, z] as const, yaw: 90 as const }))),
    },
    {
      id: 'logistics/tote-2x2', class: 'logistics/tote', name: 'Four totes, two across',
      positions: [-.3, .3].flatMap(x => [-.2, .2].map(z => ({ offset: [x, z] as const, yaw: 0 as const }))),
    },
    {
      id: 'logistics/pallet-2x4', class: 'logistics/industrial-pallet', name: 'Eight pallets, turned, two across',
      positions: [-.55, .55].flatMap(x => [-1.8, -.6, .6, 1.8].map(z => ({ offset: [x, z] as const, yaw: 90 as const }))),
    },
    {
      id: 'logistics/pallet-2x7', class: 'logistics/industrial-pallet', name: 'Fourteen pallets, two across',
      positions: [-.61, .61].flatMap(x => [-3, -2, -1, 0, 1, 2, 3].map(z => ({ offset: [x, z] as const, yaw: 0 as const }))),
    },
  ]),
});

/** Shop goods carriers. Products themselves stay host contents lines: the catalog has no product model. */
export const retailProfile: HandlingProfile = Object.freeze({
  id: 'retail', name: 'Retail',
  classes: Object.freeze<HandlingClass[]>([
    { id: 'retail/shopping-bag', family: 'soft-pack', name: 'Shopping bag', size: { footprint: [.33, .21], height: .49 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
    { id: 'retail/hand-basket', family: 'case', name: 'Hand basket', size: { footprint: [.465, .33], height: .39 }, stacking: { maxAbove: 3, families: ['case'] }, turnable: true },
    { id: 'retail/shopping-cart', family: 'wheeled', name: 'Shopping cart', size: { footprint: [.66, 1.02], height: 1.09 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
  ]),
  patterns: Object.freeze<LoadPattern[]>([]),
});

/** Rack-mounted equipment, sized in rack units of 44.5 mm. */
export const datacenterProfile: HandlingProfile = Object.freeze({
  id: 'datacenter', name: 'Datacenter',
  classes: Object.freeze<HandlingClass[]>([
    { id: 'datacenter/server-2u', family: 'module', name: 'Server 2U', size: { footprint: [.483, .70], height: .089 }, stacking: { maxAbove: 0, families: [] }, turnable: false },
    { id: 'datacenter/server-1u', family: 'module', name: 'Server 1U', size: { footprint: [.483, .70], height: .0445 }, stacking: { maxAbove: 0, families: [] }, turnable: false },
    { id: 'datacenter/switch-1u', family: 'module', name: 'Network switch 1U', size: { footprint: [.483, .318], height: .0445 }, stacking: { maxAbove: 0, families: [] }, turnable: false },
  ]),
  patterns: Object.freeze<LoadPattern[]>([]),
});

/** Labware. */
export const laboratoryProfile: HandlingProfile = Object.freeze({
  id: 'laboratory', name: 'Laboratory',
  classes: Object.freeze<HandlingClass[]>([
    { id: 'laboratory/flask', family: 'item', name: 'Flask', size: { footprint: [.25, .25], height: .424 }, stacking: { maxAbove: 0, families: [] }, turnable: false },
    { id: 'laboratory/tray', family: 'tray', name: 'Lab tray', size: { footprint: [.92, .94], height: .06 }, stacking: { maxAbove: 0, families: [] }, turnable: true },
  ]),
  patterns: Object.freeze<LoadPattern[]>([
    { id: 'laboratory/flask-3x3', class: 'laboratory/flask', name: 'Nine flasks, three across', positions: [-.285, 0, .285].flatMap(z => [-.285, 0, .285].map(x => ({ offset: [x, z] as const, yaw: 0 as const }))) },
  ]),
});

/** Domain profiles the shared declarations use. A `restaurant` profile waits for a movable restaurant model; plates and trays are decoration today. */
export const handlingProfiles: readonly HandlingProfile[] = Object.freeze([logisticsProfile, retailProfile, datacenterProfile, laboratoryProfile]);

const LOOSE_CASES = { families: ['case', 'soft-pack'] } as const;
const FORK_LOAD = { arrangement: 'stack', capacity: 1, accepts: { families: ['unit-load'] }, envelope: { footprint: [1.45, 1.25], height: 2.2 } } as const;
/** Shelf clear heights per level: deck top to the next level's beams, and the top deck to the 2.8 m frame top. */
const SHELF_CLEAR = [.78, .78, .84] as const;
/** Pallet-rack clear heights per level: beam top to the next 0.12 m beam (the top beam sits at 4.4 m). */
const RACK_CLEAR = [1.44, 1.38, 1.22] as const;

/**
 * Handling declarations for shared models, in local model metres. Data only: they state what
 * fits where; placements and moves stay host-owned. Assets without an entry have no declared
 * compatibility yet.
 */
export const assetHandling: Readonly<Record<string, AssetHandling>> = Object.freeze({
  /** The single parcel (one closed carton) at scale 0.4. Cartons stack on each other through the class stacking rule, not a receptacle. */
  parcel: { unit: { class: 'logistics/carton-m', scale: .4 }, receptacles: [] },
  /** An empty tote at scale 0.475, a 600 × 400 mm tote. */
  tote: { unit: { class: 'logistics/tote', scale: .475 }, receptacles: [], empty: { count: 0 } },
  /** The industrial pallet is a unit load and carries cases and soft packs on its deck; loads up to 1.6 m high. Count 0 is the empty pallet. */
  pallet: {
    unit: { class: 'logistics/industrial-pallet', scale: 1 },
    receptacles: [{ name: 'deck', arrangement: 'deck', anchor: 'load', accepts: LOOSE_CASES, envelope: { footprint: [PALLET.width, PALLET.depth], height: 1.6 }, patterns: ['logistics/carton-m-3x2', 'logistics/tote-2x2'] }],
    empty: { count: 0 },
  },
  /** Four slots per level, picked from the `pick` faces; each slot is 0.68 m wide and 0.95 m deep between the beams. */
  shelf: {
    receptacles: SHELF_CLEAR.map((height, level): Receptacle => ({
      name: `level-${level}`, arrangement: 'slot', anchors: SHELF_SLOTS.slice(level * 4, level * 4 + 4).map((_, i) => `slot-${level * 4 + i}`),
      accepts: LOOSE_CASES, envelope: { footprint: [.68, .95], height }, reachedFrom: 'pick',
    })),
    empty: { count: 0 },
  },
  /** Two pallet positions per level, loaded from the `load` slot. Slot anchors mark the beam front, so each envelope is offset to the bay centre. */
  'pallet-rack': {
    receptacles: RACK_CLEAR.map((height, level): Receptacle => ({
      name: `level-${level}`, arrangement: 'slot', anchors: [`slot-${level * 2}`, `slot-${level * 2 + 1}`],
      accepts: { families: ['unit-load'] }, envelope: { footprint: [1.3, 1.25], height }, offset: [0, 0, -PALLET_RACK.depth / 2], reachedFrom: 'load',
    })),
    empty: { count: 0 },
  },
  /** Hands of the standing worker: up to two cases or soft packs held at the `carry` anchor. */
  worker: { receptacles: [{ name: 'carry', arrangement: 'stack', anchor: 'carry', capacity: 2, accepts: LOOSE_CASES, envelope: { footprint: [.65, .5], height: .75 } }] },
  /** Forks of the counterbalance truck and reach truck: one unit load at the `load` anchor. On the forklift it sits 0.1 m forward, so a 1.2 m long load clears the backrest. */
  forklift: { receptacles: [{ name: 'load', anchor: 'load', ...FORK_LOAD, offset: [0, 0, .1] }] },
  'reach-truck': { receptacles: [{ name: 'load', anchor: 'load', ...FORK_LOAD }] },
  /** Turntable of the stretch wrapper: one unit load. */
  'stretch-wrapper': { receptacles: [{ name: 'table', anchor: 'table', ...FORK_LOAD }] },
  /** Weighing plate: one case or soft pack, reached from the `weigh` position. */
  'parcel-scale': { receptacles: [{ name: 'plate', arrangement: 'stack', anchor: 'load', capacity: 1, accepts: LOOSE_CASES, envelope: { footprint: [.6, .6], height: .7 }, reachedFrom: 'weigh' }] },
  /** Deck of the mobile robot: one tote. */
  'mobile-robot': { receptacles: [{ name: 'deck', arrangement: 'stack', anchor: 'load', capacity: 1, accepts: { families: ['case'], classes: ['logistics/tote'] }, envelope: { footprint: [.63, .5], height: .4 } }] },
  /** Straight belt, 4 m long in 0.25 m positions from the `entry` anchor. The curved variant has no rail. */
  conveyor: { receptacles: [{ name: 'belt', arrangement: 'rail', anchor: 'entry', positions: 16, pitch: .25, axis: 'z', accepts: LOOSE_CASES, envelope: { footprint: [.7, 4], height: .6 } }] },
  /** Container floor for pallets, loaded from the door. */
  'shipping-container': { receptacles: [{ name: 'floor', arrangement: 'deck', anchor: 'load', accepts: { families: ['unit-load'] }, envelope: { footprint: [SHIPPING_CONTAINER.floor.width, SHIPPING_CONTAINER.floor.length], height: SHIPPING_CONTAINER.floor.clearHeight }, patterns: ['logistics/pallet-2x4'] }] },
  /** Cargo body of the rigid truck for pallets, loaded from the rear door. */
  truck: { receptacles: [{ name: 'floor', arrangement: 'deck', anchor: 'load', accepts: { families: ['unit-load'] }, envelope: { footprint: [TRUCK.cargo.width, TRUCK.cargo.length], height: TRUCK.cargo.height }, patterns: ['logistics/pallet-2x7'] }] },
  'drum-pallet': { unit: { class: 'logistics/drum-pallet', scale: 1 }, receptacles: [], empty: { count: 4 } },
  'ibc-tank': { unit: { class: 'logistics/ibc', scale: 1 }, receptacles: [] },
  'bulk-bag': { unit: { class: 'logistics/bulk-bag', scale: 1 }, receptacles: [] },
  'poly-mailer': { unit: { class: 'logistics/poly-mailer', scale: 1 }, receptacles: [], empty: { count: 1 } },
  'mail-sack': { unit: { class: 'logistics/mail-sack', scale: 1 }, receptacles: [], empty: { count: 1 } },
  'roll-cage': { unit: { class: 'logistics/roll-cage', scale: 1 }, receptacles: [], empty: { count: 0 } },
  /** A shopping bag at scale 0.4; goods inside stay host contents lines. */
  bag: { unit: { class: 'retail/shopping-bag', scale: .4 }, receptacles: [{ name: 'contents', arrangement: 'bulk', anchor: 'contents', accepts: { families: ['item'] }, envelope: { footprint: [.3, .18], height: .45 } }] },
  'hand-basket': { unit: { class: 'retail/hand-basket', scale: 1 }, receptacles: [], empty: { count: 0 } },
  'shopping-cart': { unit: { class: 'retail/shopping-cart', scale: 1 }, receptacles: [{ name: 'contents', arrangement: 'bulk', anchor: 'contents', accepts: { families: ['item'] }, envelope: { footprint: [.5, .7], height: .4 } }], empty: { count: 0 } },
  /** Takeout bags on three levels of three bays, collected from the `collect` position. */
  'pickup-shelf': {
    receptacles: [0, 1, 2].map((level): Receptacle => ({ name: `level-${level}`, arrangement: 'slot', anchors: [0, 1, 2].map(i => `slot-${level * 3 + i}`), accepts: { families: ['soft-pack'] }, envelope: { footprint: [.46, .4], height: .52 }, reachedFrom: 'collect' })),
    empty: { count: 0 },
  },
  /** 42 rack units of 44.5 mm. Decorative count units stay separate; use count 0 when tracking real equipment. */
  'equipment-cabinet': { receptacles: [{ name: 'rail', arrangement: 'rail', anchor: 'rail', positions: 42, pitch: .0445, axis: 'y', accepts: { families: ['module'] }, envelope: { footprint: [.5, .8], height: 1.869 } }], empty: { count: 0 } },
  'rack-server': { unit: { class: 'datacenter/server-2u', scale: 1, variants: { '1u': 'datacenter/server-1u' } }, receptacles: [] },
  'network-switch': { unit: { class: 'datacenter/switch-1u', scale: 1 }, receptacles: [] },
  'lab-flask': { unit: { class: 'laboratory/flask', scale: 1 }, receptacles: [] },
  /** A tray with a deck for flasks; its count flasks are decoration. */
  'lab-tray': { unit: { class: 'laboratory/tray', scale: 1 }, receptacles: [{ name: 'deck', arrangement: 'deck', anchor: 'load', accepts: { families: ['item'], classes: ['laboratory/flask'] }, envelope: { footprint: [.92, .92], height: .45 }, patterns: ['laboratory/flask-3x3'] }], empty: { count: 0 } },
  /** Bench spot for one lab tray. */
  'lab-workstation': { receptacles: [{ name: 'tray', arrangement: 'stack', anchor: 'tray', capacity: 1, accepts: { families: ['tray'] }, envelope: { footprint: [.95, 1], height: .55 } }] },
  /** A small pile of work items on the bench surface, reached from the `work` position. */
  station: { receptacles: [{ name: 'surface', arrangement: 'stack', anchor: 'surface', capacity: 4, accepts: LOOSE_CASES, envelope: { footprint: [.65, .5], height: .6 }, reachedFrom: 'work' }] },
  /** One unit load on the forks, loads up to 2 m high including the pallet. */
  'pallet-jack': { receptacles: [{ name: 'load', arrangement: 'stack', anchor: 'load', capacity: 1, accepts: { families: ['unit-load'] }, envelope: { footprint: [1.45, 1.25], height: 2 } }] },
});

/** Metres between a unit's measured model size and its class size, at the unit's scale. */
export const UNIT_SIZE_TOLERANCE = .03;
/** Metres a slot or deck envelope may overhang the model footprint, as pallets overhang rack beams. */
export const ENVELOPE_OVERHANG = .1;
/** Metres the envelope is shrunk by before testing it against model parts, so touching surfaces pass. */
export const CLEARANCE_SHRINK = .01;

const decorative = (object: THREE.Object3D) => { for (let current: THREE.Object3D | null = object; current; current = current.parent) if (current.userData.decorative) return true; return false; };

/** Whether any triangle of a non-decorative mesh enters the box; merged parts are tested per triangle, not by their combined bounds. */
function meshesEnter(meshes: readonly THREE.Mesh[], box: THREE.Box3): boolean {
  const triangle = new THREE.Triangle(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const mesh of meshes) {
    if (!new THREE.Box3().setFromObject(mesh).intersectsBox(box)) continue;
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex(), count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const [i0, i1, i2] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
      triangle.set(a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld), b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld), c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld));
      if (box.intersectsTriangle(triangle)) return true;
    }
  }
  return false;
}

/**
 * Check a handling declaration against the model its factory builds: structural validity, each
 * receptacle anchor once, the unit size against its class, slot and deck envelopes inside the
 * model footprint, slot envelopes clear of model parts and of each other, and the interaction
 * slot group each receptacle is reached from. Runs without WebGL; every probe model is disposed.
 */
export function checkAssetHandling(asset: string, handling: AssetHandling, factory: AssetFactory, profiles: readonly HandlingProfile[] = handlingProfiles, slots: InteractionSlotSource | undefined = assetInteractionSlots[asset]): ContractReport {
  const checks: ContractCheck[] = [], check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, ...(ok || !detail ? {} : { detail }) }); };
  const node = { id: `${asset}-handling-probe`, kind: 'asset', asset, ...handling.empty } as AssetNode;
  let model: THREE.Object3D | undefined;
  try {
    try { for (const profile of profiles) validateHandlingProfile(profile); validateAssetHandling(asset, handling, profiles); check('declaration is structurally valid', true); }
    catch (error) { check('declaration is structurally valid', false, (error as Error).message); return { asset, ok: false, checks }; }
    model = factory(node, { theme: 'light' }); model.updateMatrixWorld(true);
    const anchors = new Map<string, THREE.Vector3[]>();
    model.traverse(child => { if (child.name.startsWith('anchor-')) { const name = child.name.slice(7); anchors.set(name, [...anchors.get(name) ?? [], child.getWorldPosition(new THREE.Vector3())]); } });
    const bounds = new THREE.Box3().setFromObject(model);
    const meshes: THREE.Mesh[] = [];
    model.traverse(child => { if (child instanceof THREE.Mesh && !decorative(child)) meshes.push(child); });

    if (handling.unit) {
      const unitClass = handlingVocabulary(profiles).classes.get(handling.unit.class)!, scale = handling.unit.scale;
      for (const [variant, id] of Object.entries(handling.unit.variants ?? {})) {
        const entry = handlingVocabulary(profiles).classes.get(id)!, probe = factory({ ...node, variant }, { theme: 'light' }), box = new THREE.Box3().setFromObject(probe), size = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
        disposeObject(probe);
        check(`variant ${variant} matches ${id}`, Math.abs(size.x - entry.size.footprint[0]) <= UNIT_SIZE_TOLERANCE && Math.abs(size.z - entry.size.footprint[1]) <= UNIT_SIZE_TOLERANCE && Math.abs(size.y - entry.size.height) <= UNIT_SIZE_TOLERANCE, `model ${size.x.toFixed(3)} × ${size.z.toFixed(3)} × ${size.y.toFixed(3)} m`);
      }
      const width = (bounds.max.x - bounds.min.x) * scale, depth = (bounds.max.z - bounds.min.z) * scale;
      const deck = handling.receptacles.find(receptacle => receptacle.arrangement === 'deck');
      const deckY = deck && anchors.get(receptacleAnchors(deck)[0])?.[0]?.y;
      const height = (deckY ?? bounds.max.y - bounds.min.y) * scale;
      const [classWidth, classDepth] = unitClass.size.footprint;
      check(`unit footprint matches ${unitClass.id}`, Math.abs(width - classWidth) <= UNIT_SIZE_TOLERANCE && Math.abs(depth - classDepth) <= UNIT_SIZE_TOLERANCE, `model ${width.toFixed(3)} × ${depth.toFixed(3)} m at scale ${scale}, class ${classWidth} × ${classDepth} m`);
      check(`unit height matches ${unitClass.id}${deck ? ' at the deck top' : ''}`, Math.abs(height - unitClass.size.height) <= UNIT_SIZE_TOLERANCE, `model ${height.toFixed(3)} m at scale ${scale}, class ${unitClass.size.height} m`);
    }

    const groups = slots ? slots(node).map(slot => slot.group ?? slot.name) : [];
    for (const receptacle of handling.receptacles) {
      const names = receptacleAnchors(receptacle), boxes: THREE.Box3[] = [];
      for (const name of names) check(`receptacle ${receptacle.name} anchor ${name} exists once`, anchors.get(name)?.length === 1, `found ${anchors.get(name)?.length ?? 0}`);
      if (receptacle.reachedFrom) check(`receptacle ${receptacle.name} is reached from slot group ${receptacle.reachedFrom}`, groups.includes(receptacle.reachedFrom), `slot groups: ${groups.join(', ') || 'none'}`);
      if (receptacle.arrangement !== 'slot' && receptacle.arrangement !== 'deck') continue;
      const [width, depth] = receptacle.envelope.footprint, [ox, oy, oz] = receptacle.offset ?? [0, 0, 0];
      for (const name of names) {
        const anchor = anchors.get(name)?.[0];
        if (!anchor) continue;
        boxes.push(new THREE.Box3(new THREE.Vector3(anchor.x + ox - width / 2, anchor.y + oy, anchor.z + oz - depth / 2), new THREE.Vector3(anchor.x + ox + width / 2, anchor.y + oy + receptacle.envelope.height, anchor.z + oz + depth / 2)));
      }
      const inside = boxes.every(box => box.min.x >= bounds.min.x - ENVELOPE_OVERHANG && box.max.x <= bounds.max.x + ENVELOPE_OVERHANG && box.min.z >= bounds.min.z - ENVELOPE_OVERHANG && box.max.z <= bounds.max.z + ENVELOPE_OVERHANG);
      check(`receptacle ${receptacle.name} lies within the model footprint`, inside, `model x ${bounds.min.x.toFixed(2)}…${bounds.max.x.toFixed(2)}, z ${bounds.min.z.toFixed(2)}…${bounds.max.z.toFixed(2)} m`);
      if (receptacle.arrangement === 'slot') {
        const blocked = boxes.flatMap((box, i) => meshesEnter(meshes, box.clone().expandByScalar(-CLEARANCE_SHRINK)) ? [names[i]] : []);
        check(`receptacle ${receptacle.name} envelopes are clear of model parts`, !blocked.length, `blocked at ${blocked.join(', ')}`);
        const overlapping = boxes.some((box, i) => boxes.some((other, j) => j > i && box.clone().expandByScalar(-HANDLING_FIT_TOLERANCE).intersectsBox(other)));
        check(`receptacle ${receptacle.name} slots do not overlap`, !overlapping);
      }
    }
    return { asset, ok: checks.every(entry => entry.ok), checks };
  } finally {
    if (model) disposeObject(model);
  }
}
