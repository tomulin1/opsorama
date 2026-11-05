import { neutralModelStates } from './visual-states';
import * as THREE from 'three';
import { validateObjectDescriptor, type AssetNode, type Bounds, type MaterialRole, type NodeSample, type ObjectDescriptor } from '@opsorama/core';
import type { AssetFactory } from '@opsorama/three';
import { disposeObject } from '@opsorama/three';
import { animateAsset, hasAssetAnimator } from '@opsorama/three';
import { assetInteractionSlots } from './interaction-slots';
import { aquaticsDescriptors } from './aquatics-descriptors';
import { animalDescriptors } from './animal-descriptors';
import { farmDescriptors } from './farm-descriptors';
import { catalogDescriptors } from './catalog-descriptors';

const contentsSample: NodeSample = { variant: 'open', contents: { lines: [{ id: 'mug', title: 'Mug', quantity: 2 }] } };

/** The first definition with the complete common contract (C1): exactly one carton, the one package type (ADR 0059). */
export const parcelDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'parcel', name: 'Parcel / Box', category: 'Work items', version: 1,
  purpose: 'The one package type: a single taped carton for orders, shipments and work items, closed or open with real contents. Counted parcels use parcel-base or pallet.',
  geometry: {
    units: 'metres', pivot: 'base-center', forward: '+z', up: '+y',
    bounds: { min: [-.515, 0, -.42], max: [.515, .825, .4435] },
    largest: { node: { variant: 'open' }, bounds: { min: [-.782, 0, -.636], max: [.782, .894, .636] } },
    note: 'One carton is about 1.03 × 0.83 × 0.86 m at scale 1 and stands on the ground; examples place it at scale 0.4, the logistics/carton-m handling unit. The open variant is wider because its flaps fold outward.',
  },
  palette: {
    colorRole: 'surface',
    roles: [
      { role: 'surface', parts: 'Carton body, walls and flaps' },
      { role: 'trim', parts: 'Packing tape' },
      { role: 'text', parts: 'Shipping sticker' },
      { role: 'structure', parts: 'Barcode of the closed carton' },
      { role: 'accent', parts: 'Content proxies without their own color', when: contentsSample },
    ],
    fixed: 'The lid seam is a translucent black line.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'surface role', update: 'rebuild', description: 'Compatibility shortcut for the surface role; materials.surface wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep inheriting.', samples: [{ materials: { trim: '#123456' } }] },
    { field: 'variant', type: "'closed' | 'open'", default: 'closed', update: 'rebuild', description: 'Closed taped carton, or an open carton with raised flaps.', samples: [{ variant: 'open' }] },
    { field: 'contents', type: 'ContainerContents', default: 'none', update: 'rebuild', description: 'Real content lines in the open carton, with up to nine visible proxies.', samples: [contentsSample] },
    { field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the front sticker.' },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion). Scale changes size, never quantity.' },
  ],
  states: neutralModelStates('parcel'),
  motion: {
    animation: 'none', staticPose: 'Always static; open flaps hold a fixed pose.',
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately. Routes and controllers own the transform when present.',
    policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.',
    hit: 'Every visible mesh of the carton.',
    anchors: [
      { name: 'top', purpose: 'Top of the tape or the open rim, for labels and stacking.' },
      { name: 'front', purpose: 'Front face, for stickers and approach.' },
      { name: 'contents', purpose: 'Floor of the open carton, where content items attach.', when: [{ variant: 'open' }, contentsSample] },
    ],
    slots: [],
    relationships: 'Attach to other anchors (a worker carry anchor, a pallet load anchor) through node attachments; assetHandling.parcel declares it the logistics/carton-m unit at scale 0.4. count and multiplier are rejected: parcel-base and pallet show counted parcels. The host owns what the parcel means.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'Surface-label artwork only, owned by the instance.', animator: false,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry, material and label texture; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/examples/object-contract', '/docs/objects/parcel', 'examples/object-contract-javascript.ts', 'examples/object-contract-react.tsx', 'examples/object-contract-vue.ts', 'examples/vue-sfc/ParcelContract.vue'],
    tests: ['tests/object-contract.test.ts', 'tests/handling.test.ts', 'tests/e2e/object-contract.spec.ts'],
    limits: ['Visual states are host metadata; the model remains neutral.', 'One carton size; size options are later handling work (docs/CONTAINMENT.md).', 'Measured resource cost covers the example scene in software WebGL only.'],
  },
} satisfies ObjectDescriptor);

/** Parcels on the grey base: the counted presentation of the parcel on the ground (ADR 0059). */
export const parcelBaseDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'parcel-base', name: 'Parcels on base', category: 'Work items', version: 1,
  purpose: 'Zero to twenty-seven closed parcels on a grey base plate under one selectable node, for counted stock and staging areas.',
  geometry: {
    units: 'metres', pivot: 'base-center', forward: '+z', up: '+y',
    bounds: { min: [-.59, 0, -.49], max: [.59, .905, .49] },
    largest: { node: { count: 27, countLayout: 'reserved' }, bounds: { min: [-1.71, 0, -1.42], max: [1.71, 2.705, 1.42] } },
    note: 'The shared parcel geometry (about 1.03 × 0.83 × 0.86 m each) on a 0.1 m base plate; layouts fill three columns, three rows, then up to three layers. Zero parcels leaves the empty base.',
  },
  palette: {
    colorRole: 'surface',
    roles: [
      { role: 'surface', parts: 'Carton bodies' },
      { role: 'trim', parts: 'Packing tape' },
      { role: 'text', parts: 'Shipping stickers' },
      { role: 'structure', parts: 'Base plate and barcodes' },
    ],
    fixed: 'The lid seams are translucent black lines.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'surface role', update: 'rebuild', description: 'Compatibility shortcut for the carton surface role; materials.surface wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep inheriting.', samples: [{ materials: { structure: '#123456' } }] },
    { field: 'count', type: 'integer 0–27', default: '1', update: 'rebuild', description: 'Visible parcels sharing the node identity; zero is the empty base. Not a unit identity.', samples: [{ count: 0 }, { count: 9 }, { count: 27, countLayout: 'reserved' }] },
    { field: 'countLayout', type: "'compact' | 'reserved'", default: 'compact', update: 'rebuild', description: 'Compact shrinks the base to the count (an empty base keeps the one-parcel size); reserved keeps all 27 slots, so changing the count never moves parcels or resizes the base.', samples: [{ count: 0, countLayout: 'reserved' }, { count: 4, countLayout: 'reserved' }] },
    { field: 'multiplier', type: 'positive integer', default: 'none', update: 'rebuild', description: 'Disclosed symbolic total: each visible parcel stands for this many.', samples: [{ count: 3, multiplier: 10 }] },
    { field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the front sticker of every visible parcel.' },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion). Scale changes size, never quantity.' },
  ],
  states: neutralModelStates('parcel base'),
  motion: {
    animation: 'none', staticPose: 'Always static.',
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately.',
    policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true; the whole base is one node, never a member parcel.',
    hit: 'Every visible mesh; parcels on the base do not become separate entities.',
    anchors: [
      { name: 'top', purpose: 'Top of the highest occupied layer, or of the base plate when empty, for labels and drill-down markers.' },
      { name: 'front', purpose: 'Front face of the front row, for approach.' },
    ],
    slots: [],
    relationships: 'Visible parcels reuse the parcel geometry and gain no IDs of their own. Parcels that move individually are separate parcel nodes.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'Surface-label artwork only, owned by the instance.', animator: false,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry, material and label texture; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/docs/objects/parcel-base', '/examples/performance'],
    tests: ['tests/object-contract.test.ts', 'tests/asset-counts.test.ts', 'tests/reserved-counts.test.ts'],
    limits: ['Visual states are host metadata; the model remains neutral.', 'Closed cartons only; an open carton is one parcel with variant open.', 'No handling declaration: the base is a presentation, not a unit load.'],
  },
} satisfies ObjectDescriptor);

const WORKER_VARIANTS = ['working', 'carrying', 'holding', 'walking', 'idle', 'seated', 'pushing', 'picking', 'placing'] as const;

/** Foundation entry (C2): a person with poses, clothing roles, composition anchors and local animation. */
export const workerDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'worker', name: 'Worker', category: 'People', version: 1,
  purpose: 'A low-poly person for staff, shoppers and operators: nine static poses with optional local animation, composed with carts, seats and carried items through anchors.',
  geometry: {
    units: 'metres', pivot: 'stance', forward: '+z', up: '+y',
    bounds: { min: [-.367, 0, -.195], max: [.367, 1.736, .543] },
    largest: { node: { variant: 'carrying' }, bounds: { min: [-.367, 0, -.195], max: [.367, 1.736, .7] } },
    note: 'About 1.74 m tall standing. The pivot is the floor point under the body; the arms and a carried carton reach forward. Seated hips are at 0.52 m, matching desk-pod and meeting-table seat anchors.',
  },
  palette: {
    colorRole: 'accent',
    roles: [
      { role: 'accent', parts: 'Shirt, sleeves and collar' },
      { role: 'skin', parts: 'Face, neck, ears, nose, mouth and hands' },
      { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' },
      { role: 'structure', parts: 'Trousers; shoes and belt are a darker shade of it' },
      { role: 'text', parts: 'Chest stripe and badge' },
      { role: 'surface', parts: 'Built-in carton of the carrying pose', when: { variant: 'carrying' } },
      { role: 'trim', parts: 'Tape on that carton', when: { variant: 'carrying' } },
    ],
    fixed: 'Shoes and belt derive from the structure role instead of having a role of their own.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'accent role', update: 'rebuild', description: 'Compatibility shortcut for the shirt (accent role); materials.accent wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette, e.g. skin, hair or trousers; unspecified roles keep inheriting.', samples: [{ materials: { skin: '#8d5a3b', hair: '#d8c29a' } }] },
    { field: 'variant', type: `'${WORKER_VARIANTS.join("' | '")}'`, default: 'working', update: 'rebuild', description: 'Pose. Holding has the carrying arms without the built-in carton, for an item attached at the carry anchor; pushing holds the arms at a cart handle; picking and placing are finite reach actions.', samples: WORKER_VARIANTS.map(variant => ({ variant })) },
    { field: 'person', type: "PersonOptions ({ figure?: 'masculine' | 'feminine' })", default: "{ figure: 'masculine' }", update: 'rebuild', description: "Body silhouette: feminine is a smaller, slimmer build (about 1.67 m standing) with narrower shoulders and one-piece long hair over the ears (and a skirt for the visitor and office worker). Poses, anchor names and the 0.52 m seat height do not change; hand and carry anchors follow the smaller body. Person assets only.", samples: [{ person: { figure: 'feminine' } }, { person: { figure: 'feminine' }, variant: 'seated' }] },
    { field: 'localMotion', type: 'boolean', default: 'true', update: 'rebuild', description: 'false keeps the built pose without an animator; true cannot turn animation on when the scene or reduced motion turns it off.', samples: [{ localMotion: false }] },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion).' },
  ],
  states: {
    shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'],
    parts: 'A person is never tinted by status, so clothing colors keep their meaning.',
    alternative: 'Show status in the node label, a status beacon placed near the person or the host HTML record view; selection and hover use a separate ring.',
  },
  motion: {
    animation: 'local',
    staticPose: 'With localMotion false, scene motion off, paused or reduced motion, the pose stays as built; a pose never confirms that work happens.',
    transform: 'A new record position interpolates toward the target while motion is on. Routes, behaviors and controllers own the root when present; the animator then walks in place while moving and stands at stops.',
    policy: 'The animator poses the rig on the scene clock (head, arms, legs and gait bob; walking and carrying also pace inside the model) and never moves the root. Scene motion, pause, speed and reduced motion apply.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.',
    hit: 'Every visible mesh of the figure, including a built-in carton.',
    anchors: [
      { name: 'hand', purpose: 'Right hand; follows the forearm pose, for small held items.' },
      { name: 'carry', purpose: 'Base of a load held in front of the chest; follows the rig, so attached items bob with the gait.' },
      { name: 'cart', purpose: 'Floor point in front of the person where a pushed cart attaches.' },
    ],
    slots: [],
    relationships: 'Attach separately owned items (a parcel at carry, a shopping cart at cart) through node attachments, and place a seated worker at a desk-pod or meeting-table seat anchor. The host owns what the person and the pose mean.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'None.', animator: true,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild. A rebuilt picking or placing pose restarts its reach.',
    disposal: 'disposeObject releases every geometry and material and clears the animator; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/docs/objects/worker', '/examples/ecommerce', '/examples/motion', '/examples/restaurant'],
    tests: ['tests/object-contract.test.ts', 'tests/staff.test.ts', 'tests/carry.test.ts', 'tests/composition.test.ts', 'tests/e2e/objects.spec.ts'],
    limits: ['Status has no visual mapping on the figure.', 'One rigid rig for every pose: no skinning, facial expression or body variation beyond the palette roles.', 'Animation cost was not profiled on real hardware.'],
  },
} satisfies ObjectDescriptor);

interface PersonEntry {
  asset: string; name: string; purpose: string; bounds: Bounds; note: string;
  colorRole: MaterialRole; colorParts: string; roles: readonly { role: MaterialRole; parts: string }[]; fixed: string; materials: NodeSample['materials'];
}
const SKIN_ROLE = { role: 'skin', parts: 'Face, neck, ears, nose, mouth and hands' } as const;
const CARTON_ROLES = [
  { role: 'surface', parts: 'Built-in carton of the carrying pose', when: { variant: 'carrying' } },
  { role: 'trim', parts: 'Tape on that carton', when: { variant: 'carrying' } },
] as const;
const personBounds = (minZ: number, maxY: number): Bounds => ({ min: [-.367, 0, minZ], max: [.367, maxY, .543] });
/**
 * Person characters share the worker rig, poses, anchors, animator and lifecycle; only clothing, accessories and the
 * palette mapping differ, so each descriptor reuses the worker contract and declares its own bounds and roles.
 */
const personDescriptor = (entry: PersonEntry): ObjectDescriptor => {
  const shared = workerDescriptor.customization.filter(option => ['variant', 'person', 'localMotion', 'state', 'position / rotation / scale'].includes(option.field));
  const roles = [...entry.roles, ...CARTON_ROLES.filter(use => !entry.roles.some(own => own.role === use.role))];
  return Object.freeze({
    ...workerDescriptor, asset: entry.asset, name: entry.name, purpose: entry.purpose,
    geometry: { ...workerDescriptor.geometry, bounds: entry.bounds, largest: { node: { variant: 'carrying' }, bounds: { min: entry.bounds.min, max: [entry.bounds.max[0], entry.bounds.max[1], .7] } }, note: `${entry.note} Seated hips are at 0.52 m, matching the seat anchors; the arms and a carried carton reach forward.` },
    palette: { colorRole: entry.colorRole, roles, fixed: entry.fixed },
    customization: [
      { field: 'color', type: 'CSS #RRGGBB', default: `${entry.colorRole} role`, update: 'rebuild', description: `Compatibility shortcut for the ${entry.colorParts} (${entry.colorRole} role); materials.${entry.colorRole} wins over it.`, samples: [{ color: '#aa5533' }] },
      { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette and the character defaults; unspecified roles keep inheriting.', samples: [{ materials: entry.materials }] },
      ...shared,
    ],
    interaction: { ...workerDescriptor.interaction, relationships: 'The same anchors and compositions as the worker: attach items at carry or hand, a cart at cart, and place the seated pose at a seat anchor. The host owns who the person is; the outfit never confirms a role or identity.' },
    evidence: {
      examples: [`/docs/objects/${entry.asset}`],
      tests: ['tests/people.test.ts', 'tests/object-contract.test.ts'],
      limits: ['Status has no visual mapping on the figure.', 'The outfit is fixed per character; recolor it through palette roles, not by swapping garments.', 'One rigid rig shared with the worker: no skinning, facial expression or body variation.', 'Animation cost was not profiled on real hardware.'],
    },
  } satisfies ObjectDescriptor);
};

/** People characters on the worker rig, keyed by asset; `personLooks` in people.ts builds their clothing. */
export const personDescriptors: Readonly<Record<string, ObjectDescriptor>> = Object.freeze(Object.fromEntries(([
  { asset: 'office-worker', name: 'Office worker', purpose: 'A person in a suit jacket, shirt and tie for offices, receptions and control rooms, with the nine worker poses.',
    bounds: personBounds(-.195, 1.736), note: 'About 1.74 m tall standing, like the worker; the jacket hem ends just below the belt.',
    colorRole: 'accent', colorParts: 'jacket', roles: [{ role: 'accent', parts: 'Jacket, sleeves and hem; the tie is a darker shade of it' }, { role: 'trim', parts: 'Shirt front and collar; tape on the carrying carton' }, { role: 'text', parts: 'Lanyard card' }, { role: 'structure', parts: 'Trousers, or the skirt of the feminine figure; shoes and belt are a darker shade of it' }, { role: 'skin', parts: 'Face, neck, ears, nose, mouth and hands; the legs below a skirt' }, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'The tie, shoes and belt are darker shades of the accent and structure roles. Defaults: navy jacket, white shirt, charcoal trousers.', materials: { accent: '#5a3d6e', trim: '#f2e6c8' } },
  { asset: 'chef', name: 'Chef', purpose: 'A cook in a white double-breasted jacket, toque and waist apron for kitchens and food service, with the nine worker poses.',
    bounds: personBounds(-.21, 1.91), note: 'About 1.91 m to the top of the toque standing.',
    colorRole: 'accent', colorParts: 'apron', roles: [{ role: 'accent', parts: 'Waist apron, apron band, neckerchief and belt' }, { role: 'trim', parts: 'Jacket, long sleeves and toque; tape on the carrying carton' }, { role: 'structure', parts: 'Buttons and trousers; shoes are a darker shade of it' }, SKIN_ROLE, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'Shoes are a darker shade of the structure role. Seated, the apron lies on the lap. Defaults: white jacket and toque, dark apron, grey trousers.', materials: { accent: '#a33b3b' } },
  { asset: 'doctor', name: 'Doctor', purpose: 'A clinician in a knee-length white coat with a stethoscope for hospitals, clinics and laboratories, with the nine worker poses.',
    bounds: personBounds(-.195, 1.736), note: 'About 1.74 m tall standing; the coat reaches the knees.',
    colorRole: 'accent', colorParts: 'shirt under the coat', roles: [{ role: 'accent', parts: 'Shirt front and collar under the coat' }, { role: 'trim', parts: 'Coat, long sleeves and hem; tape on the carrying carton' }, { role: 'text', parts: 'Name badge' }, { role: 'structure', parts: 'Trousers; shoes, belt and stethoscope are darker shades of it' }, SKIN_ROLE, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'The stethoscope, shoes and belt are darker shades of the structure role. Seated, the coat hem lies on the lap. Defaults: white coat, light blue shirt.', materials: { accent: '#6fae8e' } },
  { asset: 'nurse', name: 'Nurse', purpose: 'A care worker in matching scrubs for wards, clinics and care homes, with the nine worker poses.',
    bounds: personBounds(-.195, 1.736), note: 'About 1.74 m tall standing, like the worker.',
    colorRole: 'accent', colorParts: 'scrubs', roles: [{ role: 'accent', parts: 'Scrub top and sleeves; trousers, belt and pocket are shades of it' }, { role: 'trim', parts: 'Clogs; tape on the carrying carton' }, { role: 'text', parts: 'Badge' }, { role: 'skin', parts: 'Face, neck, V-neck, ears, nose, forearms and hands' }, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'The scrub trousers, belt and pocket are shades of the accent role, so color recolors the whole set. Defaults: teal scrubs, white clogs.', materials: { accent: '#7a6fc0' } },
  { asset: 'security-guard', name: 'Security guard', purpose: 'A guard in a dark uniform with a peaked cap, badge, radio and duty belt, with the nine worker poses.',
    bounds: { min: [-.367, 0, -.2], max: [.367, 1.765, .543] }, note: 'About 1.77 m to the top of the cap standing.',
    colorRole: 'accent', colorParts: 'uniform shirt and cap', roles: [{ role: 'accent', parts: 'Shirt, long sleeves and cap' }, { role: 'trim', parts: 'Badge and cap badge; tape on the carrying carton' }, { role: 'structure', parts: 'Trousers; shoes, belt, duty belt, pouches, radio, epaulettes and visor are darker shades of it' }, SKIN_ROLE, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'Gear and the visor are darker shades of the structure role. Defaults: navy uniform, gold badge.', materials: { accent: '#3d5a46', trim: '#c9ced6' } },
  { asset: 'construction-worker', name: 'Construction worker', purpose: 'A site worker with a high-visibility vest, reflective bands and a hard hat for building sites, yards and plants, with the nine worker poses.',
    bounds: { min: [-.367, 0, -.225], max: [.367, 1.753, .543] }, note: 'About 1.75 m to the top of the hard hat standing.',
    colorRole: 'warning', colorParts: 'vest and hard hat', roles: [{ role: 'warning', parts: 'High-visibility vest and hard hat' }, { role: 'text', parts: 'Reflective bands on the vest' }, { role: 'accent', parts: 'Shirt and sleeves' }, { role: 'structure', parts: 'Trousers; shoes and belt are a darker shade of it' }, SKIN_ROLE, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'High-visibility clothing uses the warning palette color, like vehicle operators; it is not a status tint. Defaults: amber vest and hard hat.', materials: { warning: '#e8f04a' } },
  { asset: 'visitor', name: 'Visitor', purpose: 'A member of the public in a T-shirt and jeans, for shoppers, guests, passengers and visitors, with the nine worker poses.',
    bounds: personBounds(-.195, 1.736), note: 'About 1.74 m tall standing, like the worker.',
    colorRole: 'accent', colorParts: 'T-shirt', roles: [{ role: 'accent', parts: 'T-shirt and sleeves' }, { role: 'structure', parts: 'Jeans, or the skirt of the feminine figure; the belt is a darker shade of it' }, { role: 'trim', parts: 'Sneakers; tape on the carrying carton' }, { role: 'skin', parts: 'Face, neck, ears, nose, mouth and hands; the legs below a skirt' }, { role: 'hair', parts: 'Hair and eyes; the long hair of the feminine figure' }],
    fixed: 'The belt is a darker shade of the structure role. No staff badge and nothing carried on the back. Defaults: terracotta T-shirt, blue jeans, white sneakers.', materials: { accent: '#4f7fbf', structure: '#3a3f4a' } },
] as const satisfies readonly PersonEntry[]).map(entry => [entry.asset, personDescriptor(entry)])));

/** Descriptors by registry key; entries without one keep their documented partial contracts. */
const SHELF_SLOT_LEVELS = ['Bottom', 'Middle', 'Top'] as const;
/** Wave 2, first entry: the storage shelf. */
export const shelfDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'shelf', name: 'Storage shelf', category: 'Furniture', version: 1,
  purpose: 'A three-level storage rack with twelve named storage slots. Its count boxes are decoration; real inventory attaches to the slot anchors as separate nodes.',
  geometry: {
    units: 'metres', pivot: 'base-center', forward: '+z', up: '+y',
    bounds: { min: [-1.525, 0, -.555], max: [1.525, 2.8, .555] },
    note: 'Fixed 3.05 × 2.8 × 1.11 m frame with decks at 0.22, 1.09 and 1.96 m; four slots 0.7 m apart per level. Dimensions and the level count are not configurable yet.',
  },
  palette: {
    colorRole: 'structure',
    roles: [
      { role: 'structure', parts: 'Uprights and braces; the step beams and decks are lighter shades of it' },
      { role: 'surface', parts: 'Decorative cartons (every second box)', when: { count: 2 } },
      { role: 'accent', parts: 'Decorative totes (the other boxes)', when: { count: 1 } },
      { role: 'trim', parts: 'Label strips on the decorative boxes', when: { count: 1 } },
    ],
    fixed: 'Foot plates are dark steel.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'structure role', update: 'rebuild', description: 'Compatibility shortcut for the frame (structure role); decks and beams follow it; materials.structure wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the shelf defaults.', samples: [{ materials: { surface: '#123456' } }] },
    { field: 'count', type: 'integer 0–12', default: '12', update: 'rebuild', description: 'Decorative boxes filling the slots in order, bottom level first. They share the shelf identity and are not inventory; use 0 when real items attach to the slots.', samples: [{ count: 0 }, { count: 5 }, { count: 12 }] },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion).' },
  ],
  states: {
    shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'],
    parts: 'The shelf has no status tint; status belongs to the items in its slots or to a status beacon placed on the top anchor.',
    alternative: 'Use the node label, a status beacon or the host HTML record view.',
  },
  motion: {
    animation: 'none', staticPose: 'Always static.',
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately.',
    policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true; decorative boxes never become entities.',
    hit: 'Every visible mesh of the frame and the decorative boxes.',
    anchors: [
      ...Array.from({ length: 12 }, (_, i) => ({ name: `slot-${i}`, purpose: `${SHELF_SLOT_LEVELS[Math.floor(i / 4)]} level, position ${i % 4 + 1} from the left: the deck point where an item base rests.` })),
      { name: 'top', purpose: 'Top of the uprights, for labels and a status beacon.' },
      { name: 'front', purpose: 'Front edge of the bottom deck, for approach.' },
    ],
    slots: ['pick-0', 'pick-1'],
    relationships: 'Attach real inventory (parcels, totes) to slot anchors; two pick-face interaction slots on the front let behavior agents pick. The host owns stock levels and what each item means.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'None.', animator: false,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry and material; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/docs/objects/shelf', '/examples/motion', '/examples/ecommerce'],
    tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'],
    limits: ['Dimensions and the number of levels are fixed.', 'No status tint.'],
  },
} satisfies ObjectDescriptor);

/** Wave 2, entry 8: the workstation bench. */
export const stationDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'station', name: 'Workstation', category: 'Furniture', version: 1,
  purpose: 'A work bench with a terminal, as a general bench, a packing station or a returns inspection station. Its accessories are decoration; work items rest on the surface anchor as separate nodes.',
  geometry: {
    units: 'metres', pivot: 'base-center', forward: '+z', up: '+y',
    bounds: { min: [-1.65, 0, -.7], max: [1.65, 1.88, .7] },
    note: 'Fixed 3.3 × 1.88 × 1.4 m bench with its top at 1.23 m and a back panel on the rear edge; every variant keeps the same bounds and anchors.',
  },
  palette: {
    colorRole: 'structure',
    roles: [
      { role: 'structure', parts: 'Legs, stretchers and back panel' },
      { role: 'surface', parts: 'Bench top' },
      { role: 'screen', parts: 'Terminal housing, neck and foot' },
      { role: 'glass', parts: 'Terminal display' },
      { role: 'trim', parts: 'Keyboard' },
    ],
    fixed: 'Foot plates are dark steel; accessories (the standard carton, packing paper, roll, tape, scale and flat cartons, the inspection lamp, return carton, tray and clipboard) keep natural tones.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'structure role', update: 'rebuild', description: 'Compatibility shortcut for the frame and back panel (structure role); materials.structure wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the workstation defaults.', samples: [{ materials: { surface: '#123456' } }] },
    { field: 'variant', type: "'standard' | 'packing' | 'inspection'", default: 'standard', update: 'rebuild', description: 'Standard has a package beside the terminal; packing adds a paper roll, open carton, tape, scale and a lower shelf of flat cartons; inspection adds a task lamp, return carton, item tray and clipboard. Accessories are decorative.', samples: [{ variant: 'packing' }, { variant: 'inspection' }] },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion).' },
  ],
  states: {
    shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'],
    parts: 'The workstation has no status tint; status belongs to its work items or to a status beacon on the top anchor.',
    alternative: 'Use the node label, a status beacon or the host HTML record view.',
  },
  motion: {
    animation: 'none', staticPose: 'Always static; the inspection lamp is lit but does not animate.',
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately.',
    policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true; accessories never become entities.',
    hit: 'Every visible mesh of the bench, terminal and accessories.',
    anchors: [
      { name: 'surface', purpose: 'Work surface in front of the terminal, where a work item rests.' },
      { name: 'input', purpose: 'Left end of the bench top, where incoming work is staged or a conveyor ends.' },
      { name: 'output', purpose: 'Right end of the bench top, where finished work leaves.' },
      { name: 'top', purpose: 'Top of the back panel, for labels and a status beacon.' },
      { name: 'front', purpose: 'Front edge of the bench top, for approach.' },
    ],
    slots: ['work'],
    relationships: 'Put work items on the surface, input or output anchors (behavior agents can put down on them); one work interaction slot in front lets an agent work at the bench. The host owns what the work means.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'None.', animator: false,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry and material; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/docs/objects/station', '/examples/motion', '/examples/ecommerce'],
    tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'],
    limits: ['Dimensions are fixed.', 'Accessories keep fixed tones.', 'No status tint.'],
  },
} satisfies ObjectDescriptor);

/** Wave 2, entry 9: the open dispatch shelter. */
export const pavilionDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'pavilion', name: 'Dispatch shelter', category: 'Buildings', version: 1,
  purpose: 'An open-front shelter for a hub, service or pick-up point, with three staging spots and a sign strip. Its count parcels are decoration; real staged stock attaches to the stock anchors, and the sign shows host artwork.',
  geometry: {
    units: 'metres', pivot: 'base-center', forward: '+z', up: '+y',
    bounds: { min: [-2.41, 0, -1.9], max: [2.41, 2.548, 1.9] },
    note: 'Fixed 4.82 × 2.55 × 3.8 m: a 4.3 × 3.25 m floor with back and side walls, open to the front, under a roof that overhangs on every side. Dimensions are not configurable yet.',
  },
  palette: {
    colorRole: 'structure',
    roles: [
      { role: 'structure', parts: 'Back and left walls and the roof; the right wall, kick plates, gutter and roof ribs are shades of it' },
      { role: 'surface', parts: 'Floor' },
      { role: 'text', parts: 'Sign strip behind any sign artwork' },
    ],
    fixed: 'Decorative staged parcels keep carton tones.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'structure role', update: 'rebuild', description: 'Compatibility shortcut for the walls and roof (structure role); their shades follow it; materials.structure wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the shelter defaults.', samples: [{ materials: { surface: '#123456' } }] },
    { field: 'count', type: 'integer 0–3', default: '3', update: 'rebuild', description: 'Decorative staged parcels on the staging spots, left to right. They share the shelter identity and are not stock; use 0 when real items attach to the stock anchors.', samples: [{ count: 0 }, { count: 1 }, { count: 3 }] },
    { field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the sign strip, such as a hub name; the strip stays visible behind it.' },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion).' },
  ],
  states: {
    shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'],
    parts: 'The shelter has no status tint; status belongs to the stock inside, the sign artwork or a status beacon on the top anchor.',
    alternative: 'Use the sign artwork, the node label, a status beacon or the host HTML record view.',
  },
  motion: {
    animation: 'none', staticPose: 'Always static.',
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately.',
    policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true; decorative parcels never become entities.',
    hit: 'Every visible mesh of the walls, roof, floor, sign and decorative parcels.',
    anchors: [
      ...[0, 1, 2].map(i => ({ name: `stock-${i}`, purpose: `Staging spot ${i + 1} from the left on the floor, where a staged item base rests.` })),
      { name: 'entrance', purpose: 'Middle of the open front edge of the floor, for approach and routes.' },
      { name: 'interior', purpose: 'Floor centre under the roof.' },
      { name: 'sign', purpose: 'Centre of the sign strip, where sign artwork appears.' },
      { name: 'top', purpose: 'Top of the roof, for labels and a status beacon.' },
    ],
    slots: [],
    relationships: 'Attach staged stock (parcels, totes, pallets) to the stock anchors and route people or vehicles to the entrance; the open front is the only opening. The host owns what is staged and what the sign says.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'Sign artwork only, owned by the instance.', animator: false,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry, material and sign texture; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/docs/objects/pavilion', '/examples/surfaces'],
    tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'],
    limits: ['Dimensions and openings are fixed.', 'No status tint.'],
  },
} satisfies ObjectDescriptor);

/** Wave 2, entry 10: the bag as a generic work-item visual. */
export const bagDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'bag', name: 'Shopping bag', category: 'Work items', version: 1,
  purpose: 'A paper carrier bag as a generic work-item visual, for orders, pick-ups or tickets where a carton would read wrong. It keeps neutral styling like the parcel and has a front sticker for host artwork.',
  geometry: {
    units: 'metres', pivot: 'base-center', forward: '+z', up: '+y',
    bounds: { min: [-.415, 0, -.255], max: [.415, 1.229, .267] },
    note: 'About 0.83 × 1.23 × 0.52 at process scale, like the parcel; the sticker stands 1.5 cm proud of the front.',
  },
  palette: {
    colorRole: 'surface',
    roles: [
      { role: 'surface', parts: 'Bag body; the folded rim is a lighter shade of the body' },
      { role: 'structure', parts: 'Rope handles; the gusset creases are a darker shade of them' },
      { role: 'text', parts: 'Front sticker' },
    ],
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'surface role', update: 'rebuild', description: 'Compatibility shortcut for the body (surface role); the rim follows it; materials.surface wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the bag defaults.', samples: [{ materials: { structure: '#123456' } }] },
    { field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the front sticker, replacing the blank plate.' },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; a new position is interpolated (see motion).' },
  ],
  states: neutralModelStates('bag'),
  motion: {
    animation: 'none', staticPose: 'Always static.',
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately. Routes and controllers own the transform when present.',
    policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.',
    hit: 'Every visible mesh of the body, rim, handles and sticker.',
    anchors: [
      { name: 'contents', purpose: 'Inside floor of the bag, where content items attach.' },
      { name: 'top', purpose: 'Centre of the open rim, for labels and stacking.' },
      { name: 'handle', purpose: 'Top of the handles, where the bag hangs from a hand or a hook.' },
      { name: 'front', purpose: 'Centre of the front sticker.' },
    ],
    slots: [],
    relationships: 'Carry it like a parcel through a carry anchor or attach it to a pickup shelf; the host owns which order it stands for.',
  },
  lifecycle: {
    ownership: 'instance', textures: 'Sticker artwork only, owned by the instance.', animator: false,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry, material and sticker texture; no subscriptions or timers.',
  },
  evidence: {
    examples: ['/docs/objects/bag'],
    tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'],
    limits: ['No count or contents binding.', 'Visual states are host metadata; the model remains neutral.'],
  },
} satisfies ObjectDescriptor);

/** Shared text for static definitions without status, used by the last Wave 2 entries. */
const STATIC_MOTION = Object.freeze({
  animation: 'none' as const, staticPose: 'Always static.',
  transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately.',
  policy: 'No local animation; the scene clock and motion gates apply to transform interpolation only.',
});
const REBUILD = 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.';
const TRANSFORM_OPTION = { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform' as const, description: 'Root transform; scale resizes the whole model, and a new position is interpolated (see motion).' };
const NO_STATUS = (what: string) => ({
  shown: ['normal'] as const, unchanged: ['busy', 'warning', 'critical', 'inactive'] as const,
  parts: `The ${what} has no status tint.`, alternative: 'Use the node label, a status beacon or map pin, or the host HTML record view.',
});
const treeDescriptor = (asset: string, name: string, purpose: string, bounds: { min: readonly [number, number, number]; max: readonly [number, number, number] }, note: string, crown: string, trunk: string): ObjectDescriptor => Object.freeze({
  asset, name, category: 'Environment', version: 1, purpose,
  geometry: { units: 'metres', pivot: 'base-center', forward: '+z', up: '+y', bounds, note },
  palette: {
    colorRole: 'foliage',
    roles: [{ role: 'foliage', parts: crown }, { role: 'wood', parts: trunk }],
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'foliage role', update: 'rebuild', description: 'Compatibility shortcut for the foliage; materials.foliage wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette, such as an autumn foliage or a darker bark; unspecified roles keep the tree defaults.', samples: [{ materials: { wood: '#123456' } }] },
    TRANSFORM_OPTION,
  ],
  states: NO_STATUS('tree'),
  motion: STATIC_MOTION,
  interaction: {
    selectable: 'Decoration: not selectable unless the node sets selectable: true or an entityId.',
    hit: 'Trunk and foliage meshes, only when the node is selectable.',
    anchors: [{ name: 'top', purpose: 'Top of the crown, for a label when the tree marks a place.' }],
    slots: [],
    relationships: 'Place trees around buildings and lots; they never hold items or block routes by themselves.',
  },
  lifecycle: { ownership: 'instance', textures: 'None.', animator: false, update: REBUILD, disposal: 'disposeObject releases every geometry and material; no subscriptions or timers.' },
  evidence: { examples: [`/docs/objects/${asset}`, '/examples/ecommerce'], tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'], limits: ['Size and silhouette vary through scale and the three tree definitions, not through options.'] },
} satisfies ObjectDescriptor);

/** Wave 2, entry 11: the tree family; tree, tree-pine and tree-palm are its silhouette variants. */
export const treeDescriptors: Readonly<Record<'tree' | 'tree-pine' | 'tree-palm', ObjectDescriptor>> = Object.freeze({
  tree: treeDescriptor('tree', 'Tree', 'A quiet low-poly deciduous tree for outdoor boards.', { min: [-.78, 0, -.66], max: [.78, 2.486, .66] }, 'About 1.56 m wide and 2.49 m tall: a trunk under three faceted crown lobes, centred on the pivot.', 'Three crown lobes, as fixed lighter and darker shades of the foliage color', 'Trunk'),
  'tree-pine': treeDescriptor('tree-pine', 'Pine tree', 'A layered evergreen with a compact conical silhouette.', { min: [-.837, 0, -.809], max: [.84, 2.65, .85] }, 'About 1.7 m wide and 2.65 m tall with three faceted foliage tiers; the irregular tier rims leave the bounds within 2 cm of centre.', 'Three foliage tiers', 'Trunk; the root flare is a darker shade of it'),
  'tree-palm': treeDescriptor('tree-palm', 'Palm tree', 'A gently leaning trunk topped with seven curved fronds.', { min: [-1.331, 0, -1.365], max: [1.33, 2.456, 1.365] }, 'About 2.7 m across and 2.46 m tall. The trunk leans toward +x, so its base sits 0.23 m −x of the pivot and the canopy is centred on it.', 'Seven fronds and the crown', 'Trunk segments, alternating with a lighter shade, and the coconuts as a dark shade'),
});

/** Wave 2, entry 12: a freestanding sign for host text or icon artwork. */
export const signDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'sign', name: 'Sign', category: 'Indicators', version: 1,
  purpose: 'A freestanding sign on a post: a place name, a direction or an instruction as host text or icon artwork on its face, without HTML.',
  geometry: { units: 'metres', pivot: 'base-center', forward: '+z', up: '+y', bounds: { min: [-.63, 0, -.16], max: [.63, 2.03, .16] }, note: 'A 1.2 × 0.6 m face in a frame, its bottom at 1.4 m on a post with a 0.32 m base plate.' },
  palette: {
    colorRole: 'surface',
    roles: [
      { role: 'surface', parts: 'Sign face' },
      { role: 'structure', parts: 'Frame, post and base plate' },
      { role: 'text', parts: 'Placeholder lines when no artwork is set' },
    ],
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'surface role', update: 'rebuild', description: 'Compatibility shortcut for the face (surface role); materials.surface wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the sign defaults.', samples: [{ materials: { structure: '#123456' } }] },
    { field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or self-contained SVG icon artwork on the face; it replaces the placeholder lines. Artwork is rasterized by the renderer, never in core.' },
    TRANSFORM_OPTION,
  ],
  states: NO_STATUS('sign'),
  motion: STATIC_MOTION,
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.',
    hit: 'Every visible mesh of the face, frame, post and base.',
    anchors: [
      { name: 'face', purpose: 'Centre of the sign face, where artwork appears.' },
      { name: 'top', purpose: 'Top of the frame, for a floating label or status beacon.' },
    ],
    slots: [],
    relationships: 'Floating HTML labels stay independent and replaceable; the sign is an in-scene alternative for wayfinding text.',
  },
  lifecycle: { ownership: 'instance', textures: 'Face artwork only, owned by the instance.', animator: false, update: REBUILD, disposal: 'disposeObject releases every geometry, material and face texture; no subscriptions or timers.' },
  evidence: { examples: ['/docs/objects/sign'], tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'], limits: ['One post-mounted form; wall-mounted text uses the label surfaces of walls and buildings.'] },
} satisfies ObjectDescriptor);

/** Wave 2, entry 12: the map pin as the location marker with status. */
export const mapPinDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'map-pin', name: 'Map pin', category: 'Indicators', version: 1,
  purpose: 'A location marker for a place, stop or incident, with status on its head and an optional gentle bob.',
  geometry: { units: 'metres', pivot: 'base-center', forward: '+z', up: '+y', bounds: { min: [-.32, 0, -.33], max: [.32, 1.57, .33] }, note: 'A 1.57 m pin on a 0.6 m base disc; the pivot and point anchor are the marked location.' },
  palette: {
    colorRole: 'accent',
    roles: [
      { role: 'accent', parts: 'Pin head' },
      { role: 'surface', parts: 'Base disc' },
      { role: 'structure', parts: 'Stem' },
      { role: 'text', parts: 'Dot on the head' },
      { role: 'warning', parts: 'Pin head', when: { state: 'warning' } },
      { role: 'critical', parts: 'Pin head', when: { state: 'critical' } },
      { role: 'inactive', parts: 'Pin head', when: { state: 'inactive' } },
    ],
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'accent role', update: 'rebuild', description: 'Compatibility shortcut for the head (accent role); materials.accent wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the pin defaults.', samples: [{ materials: { surface: '#123456' } }] },
    { field: 'localMotion', type: 'boolean', default: 'true', update: 'rebuild', description: 'False keeps the head still; it can never re-enable motion that the scene or reduced motion disabled.', samples: [{ localMotion: false }] },
    { field: 'state', type: 'VisualState', default: 'normal', update: 'rebuild', description: 'Visual status; see states.', samples: [{ state: 'warning' }, { state: 'critical' }, { state: 'inactive' }] },
    TRANSFORM_OPTION,
  ],
  states: {
    shown: ['normal', 'warning', 'critical', 'inactive'], unchanged: ['busy'],
    parts: 'Warning, critical and inactive replace the head color; instance colors never hide them. Inactive pins do not bob.',
    alternative: 'Use the node label or the host HTML record view for status text; selection and hover use a separate ring.',
  },
  motion: {
    animation: 'local', staticPose: 'Head at rest at its lowest point; inactive pins and motion-off show this pose.',
    transform: 'The bob moves only the head; a new record position interpolates the root while motion is on.',
    policy: 'Bob follows the scene clock, speed and pause; scene motion-off and reduced motion stop it, and localMotion: false keeps it still.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.',
    hit: 'Every visible mesh of the pin.',
    anchors: [
      { name: 'point', purpose: 'The marked location on the ground, at the pivot.' },
      { name: 'top', purpose: 'Top of the head, for a floating label.' },
    ],
    slots: [],
    relationships: 'Mark a place, stop or incident by the location it stands on; the host owns what the location means.',
  },
  lifecycle: { ownership: 'instance', textures: 'None.', animator: true, update: REBUILD, disposal: 'disposeObject releases every geometry and material and clears the animator; no subscriptions or timers.' },
  evidence: { examples: ['/docs/objects/map-pin'], tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'], limits: ['Busy has no tint.'] },
} satisfies ObjectDescriptor);

/** Wave 2, entry 13: the office chair, extracted from the desk pod and meeting table. */
export const officeChairDescriptor: ObjectDescriptor = Object.freeze({
  asset: 'office-chair', name: 'Office chair', category: 'Office', version: 1,
  purpose: 'The swivel chair of the desk pods and meeting tables as its own definition, for reception, lab or lounge layouts, with a seat for behavior agents.',
  geometry: { units: 'metres', pivot: 'stance', forward: '+z', up: '+y', bounds: { min: [-.295, 0, -.275], max: [.295, 1.08, .31] }, note: 'The pivot is the floor point under the seat post; the backrest sits behind it (−z) and the person faces +z, with the seat top at 0.52 m.' },
  palette: {
    colorRole: 'accent',
    roles: [
      { role: 'accent', parts: 'Seat and backrest' },
      { role: 'structure', parts: 'Five-star base, post, spine and arm posts' },
    ],
    fixed: 'Casters and arm pads are dark rubber.',
  },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'accent role', update: 'rebuild', description: 'Compatibility shortcut for the seat and back (accent role); materials.accent wins over it.', samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the chair defaults.', samples: [{ materials: { structure: '#123456' } }] },
    TRANSFORM_OPTION,
  ],
  states: NO_STATUS('chair'),
  motion: STATIC_MOTION,
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true; desk pods and meeting tables keep their own built-in chairs.',
    hit: 'Every visible mesh of the chair.',
    anchors: [
      { name: 'seat-0', purpose: 'Seat top facing +z, where a seated worker attaches with the shared seat offset.' },
      { name: 'top', purpose: 'Top of the backrest, for a label.' },
    ],
    slots: ['seat-0'],
    relationships: 'One seat interaction slot, reached from the front, lets a behavior agent sit; the desk pod uses the same chair geometry.',
  },
  lifecycle: { ownership: 'instance', textures: 'None.', animator: false, update: REBUILD, disposal: 'disposeObject releases every geometry and material, including the merged base and caster meshes; no subscriptions or timers.' },
  evidence: { examples: ['/docs/objects/office-chair'], tests: ['tests/object-contract.test.ts', 'tests/e2e/object-contract.spec.ts'], limits: ['The chair does not swivel; it faces its node rotation.'] },
} satisfies ObjectDescriptor);

export const assetDescriptors: Readonly<Record<string, ObjectDescriptor>> = Object.freeze({ parcel: parcelDescriptor, 'parcel-base': parcelBaseDescriptor, worker: workerDescriptor, shelf: shelfDescriptor, station: stationDescriptor, pavilion: pavilionDescriptor, bag: bagDescriptor, ...treeDescriptors, sign: signDescriptor, 'map-pin': mapPinDescriptor, 'office-chair': officeChairDescriptor, ...aquaticsDescriptors, ...personDescriptors, ...animalDescriptors, ...farmDescriptors, ...catalogDescriptors });

export interface ContractCheck { name: string; ok: boolean; detail?: string; }
export interface ContractReport { asset: string; ok: boolean; checks: readonly ContractCheck[]; }

const BOUNDS_TOLERANCE = .02;
const colorsOf = (object: THREE.Object3D) => {
  const colors = new Set<string>();
  object.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.Line) for (const material of Array.isArray(child.material) ? child.material : [child.material]) if ('color' in material && material.color instanceof THREE.Color) colors.add(`#${material.color.getHexString()}`); });
  return colors;
};
const anchorsOf = (object: THREE.Object3D) => { const names: string[] = []; object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name.slice(7)); }); return names; };
const boundsOf = (object: THREE.Object3D): Bounds => { const box = new THREE.Box3().setFromObject(object); return { min: box.min.toArray(), max: box.max.toArray() }; };
const near = (a: Bounds, b: Bounds) => [...a.min, ...a.max].every((value, i) => Math.abs(value - [...b.min, ...b.max][i]) <= BOUNDS_TOLERANCE);
const PROBE = '#13579b', OTHER = '#2468ac';

/**
 * Check a descriptor against the model its factory builds: bounds, pivot,
 * anchors, palette roles (scene palette, instance overrides, the `color`
 * mapping and state tints), samples, animation class, instance ownership and
 * disposal. Runs without WebGL; every probe model is disposed.
 */
export function checkAssetDescriptor(descriptor: ObjectDescriptor, factory: AssetFactory): ContractReport {
  const checks: ContractCheck[] = [], check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, ...(ok || !detail ? {} : { detail }) }); };
  const built: THREE.Object3D[] = [];
  const build = (sample: NodeSample = {}, palette?: Partial<Record<MaterialRole, string>>) => {
    const object = factory({ id: `${descriptor.asset}-probe`, kind: 'asset', asset: descriptor.asset, ...sample } as AssetNode, { theme: 'light', ...(palette ? { palette } : {}) });
    built.push(object); return object;
  };
  try {
    try { validateObjectDescriptor(descriptor); check('descriptor is structurally valid', true); } catch (error) { check('descriptor is structurally valid', false, (error as Error).message); }
    const base = build(), bounds = boundsOf(base);
    check('default bounds match', near(bounds, descriptor.geometry.bounds), JSON.stringify(bounds));
    // A stance pivot lets reach or a held load extend forward, but the body still stands on the pivot.
    // Centred means the bounds midpoint is within 2 cm of the pivot, or 1.5 % of the extent for large irregular shapes such as faceted foliage.
    const centred = (axis: 0 | 2) => Math.abs(bounds.min[axis] + bounds.max[axis]) / 2 <= Math.max(BOUNDS_TOLERANCE, .015 * (bounds.max[axis] - bounds.min[axis]));
    const centredX = centred(0), grounded = Math.abs(bounds.min[1]) <= BOUNDS_TOLERANCE;
    if (descriptor.geometry.pivot === 'model-origin') check('pivot preserves the model origin', base.position.lengthSq() === 0, 'Keep the factory root at the documented model origin.');
    else if (descriptor.geometry.pivot === 'stance') check('pivot is the stance point', grounded && centredX && bounds.min[2] < 0 && bounds.max[2] > 0, JSON.stringify(bounds));
    else check('pivot is the base center', grounded && centredX && centred(2), JSON.stringify(bounds));
    if (descriptor.geometry.largest) {
      const largest = boundsOf(build(descriptor.geometry.largest.node));
      check('largest bounds match', near(largest, descriptor.geometry.largest.bounds), JSON.stringify(largest));
      if (descriptor.geometry.pivot !== 'model-origin') check('largest configuration rests on its pivot', Math.abs(largest.min[1]) <= BOUNDS_TOLERANCE, JSON.stringify(largest));
    }
    // Anchors: each declared anchor exists once where declared; the default model has no undeclared anchor.
    const baseAnchors = anchorsOf(base), declared = descriptor.interaction.anchors;
    check('default anchors are declared', baseAnchors.every(name => declared.some(anchor => anchor.name === name)), baseAnchors.join(', '));
    check('default anchors are unique', new Set(baseAnchors).size === baseAnchors.length, baseAnchors.join(', '));
    for (const anchor of declared) for (const sample of anchor.when ?? [{}]) {
      const names = anchorsOf(build(sample)), count = names.filter(name => name === anchor.name).length;
      check(`anchor ${anchor.name} exists once${anchor.when ? ` in ${JSON.stringify(sample)}` : ''}`, count === 1, `found ${count}`);
    }
    // Palette: every declared role reaches a part through the scene palette.
    for (const use of descriptor.palette.roles) {
      check(`role ${use.role} colors a part`, colorsOf(build(use.when, { [use.role]: PROBE })).has(PROBE));
      const override = colorsOf(build({ ...use.when, materials: { [use.role]: OTHER } }, { [use.role]: PROBE }));
      check(`instance role ${use.role} overrides the scene`, override.has(OTHER) && !override.has(PROBE));
    }
    const colorRoles = typeof descriptor.palette.colorRole === 'string' ? [descriptor.palette.colorRole] : descriptor.palette.colorRole ?? [];
    const colorRole = colorRoles[0];
    if (colorRoles.length) {
      const colored = colorsOf(build({ color: PROBE }));
      check('legacy color sets its role', colored.has(PROBE));
      const both = colorsOf(build({ color: PROBE, materials: Object.fromEntries(colorRoles.map(role => [role, OTHER])) }));
      check('instance materials win over legacy color', both.has(OTHER) && !both.has(PROBE));
    }
    const first = descriptor.palette.roles[0].role;
    const inherited = colorsOf(build({ materials: {} }, { [first]: PROBE })), overridden = colorsOf(build({ materials: { [first]: OTHER } }, { [first]: PROBE }));
    check('scene palette is inherited and instance overrides win', inherited.has(PROBE) && overridden.has(OTHER) && !overridden.has(PROBE));
    // States: shown states keep their tint under instance styling; unchanged states look like normal.
    const normal = [...colorsOf(build())].sort().join();
    for (const state of descriptor.states.shown.filter(value => value !== 'normal')) {
      const role = state as MaterialRole, styled = colorsOf(build({ state, color: OTHER, materials: { [colorRole ?? first]: OTHER } }, { [role]: PROBE }));
      check(`state ${state} survives instance styling`, styled.has(PROBE));
    }
    for (const state of descriptor.states.unchanged) check(`state ${state} has no visual change`, [...colorsOf(build({ state }))].sort().join() === normal);
    // Samples build without errors.
    // Samples build without errors, and every unconditional anchor survives each of them once (variants and counts included).
    const always = declared.filter(anchor => !anchor.when).map(anchor => anchor.name);
    for (const option of descriptor.customization) for (const sample of option.samples ?? []) {
      let names: string[];
      try {
        const model = build(sample), bounds = boundsOf(model); names = anchorsOf(model);
        check(`sample ${option.field} ${JSON.stringify(sample)} builds`, true);
        check(`sample ${option.field} ${JSON.stringify(sample)} has finite bounds`, [...bounds.min, ...bounds.max].every(Number.isFinite), JSON.stringify(bounds));
        check(`sample ${option.field} ${JSON.stringify(sample)} has unique declared anchors`, new Set(names).size === names.length && names.every(name => declared.some(anchor => anchor.name === name)), names.join(', '));
      } catch (error) { check(`sample ${option.field} ${JSON.stringify(sample)} builds`, false, (error as Error).message); continue; }
      const broken = always.filter(name => names.filter(found => found === name).length !== 1);
      check(`sample ${option.field} ${JSON.stringify(sample)} keeps its anchors`, !broken.length, broken.join(', '));
    }
    // Interaction slots the model declares for behaviors match the descriptor.
    const slotSource = assetInteractionSlots[descriptor.asset], slotNames = slotSource ? slotSource({ id: 'probe', kind: 'asset', asset: descriptor.asset }).map(slot => slot.name) : [];
    check('interaction slots match', JSON.stringify([...slotNames].sort()) === JSON.stringify([...descriptor.interaction.slots].sort()), slotNames.join(', '));
    check(`animation class is ${descriptor.motion.animation}`, hasAssetAnimator(base) === (descriptor.motion.animation === 'local'));
    if (descriptor.motion.animation === 'local') {
      // Local animation poses parts in place; the root transform belongs to the host, routes and controllers.
      const animated = build(), pose = () => [...animated.position.toArray(), ...animated.quaternion.toArray(), ...animated.scale.toArray()].join(), before = pose();
      for (const time of [.4, 1.3, 2.9]) animateAsset(animated, { time, delta: .016 });
      check('local animation leaves the root transform', pose() === before);
    }
    // Ownership: two instances share no geometry or material; disposal releases all of them.
    const resources = (object: THREE.Object3D) => { const list = new Set<THREE.BufferGeometry | THREE.Material>(); object.traverse(child => { if (child instanceof THREE.Mesh || child instanceof THREE.Line) { list.add(child.geometry); (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => list.add(material)); } }); return list; };
    const a = build(), b = build(), owned = resources(a);
    check('instances own their resources', ![...resources(b)].some(resource => owned.has(resource)));
    let released = 0; owned.forEach(resource => resource.addEventListener('dispose', () => { released++; }));
    disposeObject(a); built.splice(built.indexOf(a), 1);
    check('disposal releases every geometry and material', released === owned.size, `${released} of ${owned.size}`);
  } catch (error) {
    check('factory builds the default model', false, (error as Error).message);
  } finally { built.forEach(disposeObject); }
  return { asset: descriptor.asset, ok: checks.every(item => item.ok), checks };
}
