import type { AnchorDescriptor, Bounds, MaterialRole, NodeSample, ObjectDescriptor, OptionDescriptor, PaletteRoleUse, StateDescriptor } from '@opsorama/core';

/** Descriptors for the farm batch; every entry is checked against its factory in tests. */
const EVIDENCE_TESTS = ['tests/farm-objects.test.ts', 'tests/object-contract.test.ts'];
const REBUILD = 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.';
const TRANSFORM_OPTION: OptionDescriptor = { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; scale resizes the whole model, and a new position is interpolated (see motion).' };
const TRANSFORM_MOTION = 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately. Routes and controllers own the transform when present.';
const STATIC_POLICY = 'No local animation; the scene clock and motion gates apply to transform interpolation only.';

const noStatus = (what: string): StateDescriptor => ({
  shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'],
  parts: `The ${what} has no status tint.`, alternative: 'Use the node label, a status beacon or map pin nearby, or the host HTML record view.',
});

interface FarmEntry {
  asset: string; name: string; purpose: string; bounds: Bounds; note: string; largest?: { node: NodeSample; bounds: Bounds };
  colorRole: MaterialRole; colorParts: string; roles: readonly PaletteRoleUse[]; fixed?: string;
  options?: readonly OptionDescriptor[]; states: StateDescriptor; staticPose?: string;
  anchors: readonly AnchorDescriptor[]; relationships: string; hit: string; limits: readonly string[];
}
const farm = (entry: FarmEntry): ObjectDescriptor => Object.freeze({
  asset: entry.asset, name: entry.name, category: 'Farm', version: 1, purpose: entry.purpose,
  geometry: { units: 'metres', pivot: 'base-center', forward: '+z', up: '+y', bounds: entry.bounds, ...(entry.largest ? { largest: entry.largest } : {}), note: entry.note },
  palette: { colorRole: entry.colorRole, roles: entry.roles, ...(entry.fixed ? { fixed: entry.fixed } : {}) },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: `${entry.colorRole} role`, update: 'rebuild', description: `Compatibility shortcut for ${entry.colorParts} (${entry.colorRole} role); materials.${entry.colorRole} wins over it.`, samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the model defaults.', samples: [{ materials: { [entry.roles[1].role]: '#123456' } }] },
    ...entry.options ?? [],
    TRANSFORM_OPTION,
  ],
  states: entry.states,
  motion: { animation: 'none', staticPose: entry.staticPose ?? 'Always static.', transform: TRANSFORM_MOTION, policy: STATIC_POLICY },
  interaction: { selectable: 'Selectable when the node has an entityId or selectable: true.', hit: entry.hit, anchors: entry.anchors, slots: [], relationships: entry.relationships },
  lifecycle: { ownership: 'instance', textures: 'None.', animator: false, update: REBUILD, disposal: 'disposeObject releases every geometry and material; no subscriptions or timers.' },
  evidence: { examples: [`/docs/objects/${entry.asset}`, '/examples/farm'], tests: EVIDENCE_TESTS, limits: entry.limits },
} satisfies ObjectDescriptor);

export const barnDescriptor = farm({
  asset: 'barn', name: 'Barn', purpose: 'A gambrel-roof farm barn with sliding doors and a hayloft, as the landmark of a farmyard board.',
  bounds: { min: [-5.367, 0, -7.3], max: [5.367, 9.434, 7.3] },
  note: 'A 10 × 14 m barn on a plinth, 7.8 m to the ridge and 9.4 m to the cupola; the gable with the 4 × 4 m doorway faces +z.',
  colorRole: 'surface', colorParts: 'the walls and doors',
  roles: [
    { role: 'surface', parts: 'Walls, door leaves and hayloft door' },
    { role: 'structure', parts: 'Roof, door rail and cupola roof' },
    { role: 'trim', parts: 'Corner boards, gable and door trim, door braces and cupola' },
    { role: 'glass', parts: 'Side windows' },
  ],
  fixed: 'The plinth is concrete grey and the open doorway shows a dark interior.',
  options: [{ field: 'variant', type: "'closed' | 'open'", default: 'closed', update: 'rebuild', description: 'Doors shut over the doorway, or slid aside onto a dark interior.', samples: [{ variant: 'open' }] }],
  states: noStatus('barn'),
  anchors: [
    { name: 'door', purpose: 'Ground point in front of the doorway (+z), for animals, people and machinery entering.' },
    { name: 'loft', purpose: 'Centre of the hayloft door.' },
    { name: 'top', purpose: 'Above the cupola, for a label.' },
  ],
  hit: 'Every visible mesh of the barn.',
  relationships: 'Place animals, bales and machinery around the door anchor. The interior is not modelled; use a building node for an inspectable interior. The host owns what is stored inside.',
  limits: ['No inspectable interior.', 'No status tint.'],
});

export const paddockFenceDescriptor = farm({
  asset: 'paddock-fence', name: 'Paddock fence', purpose: 'A wooden post-and-rail fence segment with an optional field gate, chained to enclose pastures, pens and paddocks.',
  bounds: { min: [-1.567, 0, -.067], max: [1.567, 1.4, .09] },
  largest: { node: { variant: 'gate-open' }, bounds: { min: [-1.567, 0, -.067], max: [1.567, 1.4, 2.66] } },
  note: 'Spans x −1.5…1.5 m between two 1.3 m posts; rails or the gate sit on the +z face. An open gate swings 2.6 m toward +z.',
  colorRole: 'wood', colorParts: 'the posts, rails and gate',
  roles: [
    { role: 'wood', parts: 'Posts, rails and gate bars' },
    { role: 'structure', parts: 'Gate hinges and latch', when: { variant: 'gate' } },
  ],
  options: [{ field: 'variant', type: "'rail' | 'gate' | 'gate-open'", default: 'rail', update: 'rebuild', description: 'Three rails, a closed five-bar gate hinged at −x, or that gate swung open 90° toward +z.', samples: [{ variant: 'gate' }, { variant: 'gate-open' }] }],
  states: noStatus('fence'),
  anchors: [
    { name: 'start', purpose: 'Centre of the −x post; the end anchor of the previous segment attaches here.' },
    { name: 'end', purpose: 'Centre of the +x post, for the next segment.' },
    { name: 'opening', purpose: 'Centre of the gateway, where animals and vehicles pass.', when: [{ variant: 'gate' }, { variant: 'gate-open' }] },
  ],
  hit: 'Posts, rails and the gate.',
  relationships: 'Chain segments end to start, turning 90° at corners, to enclose a pasture; use a gate segment where animals or vehicles pass. Whether a gate is open is host data that picks the variant.',
  limits: ['Fixed 3 m span; corners reuse the end posts.', 'The gate is static; there is no swing animation.'],
});

export const hayBaleDescriptor = farm({
  asset: 'hay-bale', name: 'Hay bale', purpose: 'A round or large square bale of hay or straw, for feed stores, fields after harvest and feeding points.',
  bounds: { min: [-.614, -.006, -.756], max: [.614, 1.506, .756] },
  largest: { node: { variant: 'square' }, bounds: { min: [-.613, 0, -1.2], max: [.613, .914, 1.2] } },
  note: 'Round: 1.5 m across and 1.2 m wide, lying on its side with the axis along x. Square: 1.2 × 0.9 × 2.4 m, long side along z.',
  colorRole: 'surface', colorParts: 'the hay',
  roles: [
    { role: 'surface', parts: 'Hay or straw' },
    { role: 'trim', parts: 'Net wrap bands or twine' },
  ],
  fixed: 'The spiral rings on the round ends are a darker shade of the hay.',
  options: [{ field: 'variant', type: "'round' | 'square'", default: 'round', update: 'rebuild', description: 'A net-wrapped round bale or a twine-tied large square bale.', samples: [{ variant: 'square' }] }],
  states: noStatus('bale'),
  anchors: [{ name: 'top', purpose: 'Top of the bale, where a label sits or another square bale stacks.' }],
  hit: 'Every visible mesh of the bale.',
  relationships: 'Stack square bales with their top anchor; line round bales along a field edge or feeding point. Bale counts and stock are host data: each visible bale is one node.',
  limits: ['Not countable; there is no stack count.', 'No status tint.'],
});

export const troughDescriptor = farm({
  asset: 'trough', name: 'Trough', purpose: 'A livestock water tank or feed trough with an explicit visible fill fraction, for watering and feeding points on a farm board.',
  bounds: { min: [-1.348, 0, -.515], max: [1.348, .7, .515] },
  note: '2.4 m along x; animals drink or eat from either long side (±z). The water tank is an oval galvanised tank with a float-valve box; the feed trough stands on legs with an end post at one end. The pivot is the centre of the footprint, including the valve box or post.',
  colorRole: 'structure', colorParts: 'the tank or trough body',
  roles: [
    { role: 'structure', parts: 'Tank walls and floor, or trough body and sides' },
    { role: 'trim', parts: 'Rim, ribs and valve box, or trough ends, legs and end post' },
    { role: 'liquid', parts: 'Water surface' },
    { role: 'surface', parts: 'Feed in the trough', when: { variant: 'feed' } },
  ],
  options: [{ field: 'variant', type: "'water' | 'feed'", default: 'water', update: 'rebuild', description: 'An oval water tank, or a wooden feed trough on legs.', samples: [{ variant: 'feed' }] }, { field: 'fillLevel', type: 'number 0–1', default: '1', update: 'rebuild', description: 'Visible fill fraction; zero removes water or feed. Independent of alerts.', samples: [{ fillLevel: 0 }, { fillLevel: .25 }, { variant: 'feed', fillLevel: .5 }] }],
  states: noStatus('trough'),
  anchors: [
    { name: 'front', purpose: 'Ground point at the +z side, where an animal stands to drink or eat facing −z.' },
    { name: 'back', purpose: 'Ground point at the −z side.' },
    { name: 'top', purpose: 'Above the trough, for a label.' },
  ],
  hit: 'Every visible mesh of the trough, including the water or feed.',
  relationships: 'Place animals at the front and back anchors facing the trough. Levels, refill schedules and float-valve faults are host data; fillLevel controls contents and host markers carry alerts.',
  limits: ['fillLevel is a visual fraction, not a measured volume or feeding recommendation.'],
});

export const chickenCoopDescriptor = farm({
  asset: 'chicken-coop', name: 'Chicken coop', purpose: 'A raised hen house with a ramp and nest box, for poultry and backyard boards.',
  bounds: { min: [-1.094, 0, -1.228], max: [1.094, 2.055, 1.228] },
  note: 'A 1.6 × 1.2 m house on 0.55 m legs, 2.06 m to the ridge. The pop hole faces +z with a 1 m ramp to the ground; the nest box is on the +x side. The pivot is the centre of the footprint, including the ramp and nest box.',
  colorRole: 'surface', colorParts: 'the walls',
  roles: [
    { role: 'surface', parts: 'Walls, gables and nest box' },
    { role: 'structure', parts: 'Roof and nest-box lid' },
    { role: 'wood', parts: 'Legs, corner boards, ramp and cleats' },
    { role: 'accent', parts: 'Pop-hole door' },
  ],
  fixed: 'The window is pale glass and the pop hole is dark.',
  options: [{ field: 'variant', type: "'open' | 'closed'", default: 'open', update: 'rebuild', description: 'Pop-hole door lowered onto a dark opening, or shut.', samples: [{ variant: 'closed' }] }],
  states: noStatus('coop'),
  anchors: [
    { name: 'entrance', purpose: 'Ground point at the foot of the ramp, where hens go in and out.' },
    { name: 'top', purpose: 'Above the ridge, for a label.' },
  ],
  hit: 'Every visible mesh of the coop.',
  relationships: 'Place chickens around the entrance anchor and enclose a run with paddock fences. Flock counts, egg collection and door schedules are host data.',
  limits: ['No status tint.', 'No interior.'],
});

export const cropFieldDescriptor = farm({
  asset: 'crop-field', name: 'Crop field', purpose: 'A sized field of soil and crop rows whose stage shows the season, for field and harvest boards.',
  bounds: { min: [-8, 0, -5], max: [8, .679, 5] },
  largest: { node: { variant: 'ripe', footprint: [60, 60] }, bounds: { min: [-30, 0, -30], max: [30, 1.115, 30] } },
  note: 'Footprint width along x and depth along z, 4–60 m each (default 16 × 10 m). Rows run along x every 0.75 m with plants every 0.5 m; a larger footprint adds rows and plants instead of stretching them. Plants are up to 1.1 m tall when ripe.',
  colorRole: 'foliage', colorParts: 'the green crop',
  roles: [
    { role: 'foliage', parts: 'Green shoots and plants (sprouting and growing)' },
    { role: 'surface', parts: 'Soil; furrows are a darker shade of it' },
  ],
  fixed: 'Ripe grain is golden and harvested stubble is straw-coloured.',
  options: [
    { field: 'variant', type: "'plowed' | 'sprouting' | 'growing' | 'ripe' | 'harvested'", default: 'growing', update: 'rebuild', description: 'Growth stage: bare furrows, green shoots, green plants, golden ripe grain or straw stubble.', samples: [{ variant: 'plowed' }, { variant: 'sprouting' }, { variant: 'ripe' }, { variant: 'harvested' }] },
    { field: 'footprint', type: '[width, depth]', default: '[16, 10]', update: 'rebuild', description: 'Field size in metres along local x and z, each 4–60 m; sizes outside the range are rejected.', samples: [{ footprint: [6, 4] }, { footprint: [30, 20] }] },
  ],
  states: noStatus('field'),
  staticPose: 'Always static; the crop does not sway.',
  anchors: [
    { name: 'entrance', purpose: 'Ground point 0.5 m outside the +z edge centre, where machinery enters.' },
    { name: 'top', purpose: 'Above the field centre, for a label.' },
  ],
  hit: 'The soil, furrows and plants.',
  relationships: 'Lay fields on terrain and border them with paddock fences; a tractor route can run along the rows. Crop type, area, yield and tasks are host data; the stage is a coarse visual season, not an agronomic measurement.',
  limits: ['One generic grain crop look.', 'A 60 × 60 m field has about 70,000 triangles.', 'No status tint.'],
});

export const farmDescriptors: Readonly<Record<string, ObjectDescriptor>> = Object.freeze(Object.fromEntries([
  barnDescriptor, paddockFenceDescriptor, hayBaleDescriptor, troughDescriptor, chickenCoopDescriptor, cropFieldDescriptor,
].map(descriptor => [descriptor.asset, descriptor])));
