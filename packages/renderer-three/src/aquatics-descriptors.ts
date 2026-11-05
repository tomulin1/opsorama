import type { AnchorDescriptor, Bounds, MaterialRole, NodeSample, ObjectDescriptor, OptionDescriptor, PaletteRoleUse, StateDescriptor } from '@opsorama/core';

/** Descriptors for the aquatics batch; every entry is checked against its factory in tests. */
const EVIDENCE_TESTS = ['tests/aquatics-objects.test.ts', 'tests/object-contract.test.ts', 'tests/e2e/aquatics.spec.ts'];
const REBUILD = 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.';
const TRANSFORM_OPTION: OptionDescriptor = { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; scale resizes the whole model, and a new position is interpolated (see motion).' };
const TRANSFORM_MOTION = 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately. Routes and controllers own the transform when present.';
const STATIC_POLICY = 'No local animation; the scene clock and motion gates apply to transform interpolation only.';
const LOCAL_POLICY = 'The animator follows the scene clock, speed and pause and never moves the root; scene motion-off and reduced motion stop it, and localMotion: false keeps it still.';

const noStatus = (what: string): StateDescriptor => ({
  shown: ['normal'], unchanged: ['busy', 'warning', 'critical', 'inactive'],
  parts: `The ${what} has no status tint.`, alternative: 'Use the node label, a status beacon or map pin nearby, or the host HTML record view.',
});

interface AquaticEntry {
  asset: string; name: string; purpose: string; bounds: Bounds; note: string; largest?: { node: NodeSample; bounds: Bounds };
  pivot?: 'base-center' | 'stance';
  colorRole: MaterialRole; colorParts: string; roles: readonly PaletteRoleUse[]; fixed?: string;
  options?: readonly OptionDescriptor[]; states: StateDescriptor;
  motion: { animation: 'none' | 'local'; staticPose: string };
  anchors: readonly AnchorDescriptor[]; slots?: readonly string[]; relationships: string; hit: string;
  textures?: string; limits: readonly string[];
}
const aquatic = (entry: AquaticEntry): ObjectDescriptor => Object.freeze({
  asset: entry.asset, name: entry.name, category: 'Aquatics', version: 1, purpose: entry.purpose,
  geometry: { units: 'metres', pivot: entry.pivot ?? 'base-center', forward: '+z', up: '+y', bounds: entry.bounds, ...(entry.largest ? { largest: entry.largest } : {}), note: entry.note },
  palette: { colorRole: entry.colorRole, roles: entry.roles, ...(entry.fixed ? { fixed: entry.fixed } : {}) },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: `${entry.colorRole} role`, update: 'rebuild', description: `Compatibility shortcut for ${entry.colorParts} (${entry.colorRole} role); materials.${entry.colorRole} wins over it.`, samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the model defaults.', samples: [{ materials: { [entry.roles[1].role]: '#123456' } }] },
    ...entry.options ?? [],
    TRANSFORM_OPTION,
  ],
  states: entry.states,
  motion: { animation: entry.motion.animation, staticPose: entry.motion.staticPose, transform: TRANSFORM_MOTION, policy: entry.motion.animation === 'local' ? LOCAL_POLICY : STATIC_POLICY },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.', hit: entry.hit,
    anchors: entry.anchors, slots: entry.slots ?? [], relationships: entry.relationships,
  },
  lifecycle: {
    ownership: 'instance', textures: entry.textures ?? 'None.', animator: entry.motion.animation === 'local', update: REBUILD,
    disposal: `disposeObject releases every geometry and material${entry.textures ? ' and label texture' : ''}${entry.motion.animation === 'local' ? ' and clears the animator' : ''}; no subscriptions or timers.`,
  },
  evidence: { examples: [`/docs/objects/${entry.asset}`, '/examples/aquatics'], tests: EVIDENCE_TESTS, limits: entry.limits },
} satisfies ObjectDescriptor);

const localMotionOption = (what: string): OptionDescriptor => ({ field: 'localMotion', type: 'boolean', default: 'true', update: 'rebuild', description: `False keeps ${what} still; it can never re-enable motion that the scene or reduced motion disabled.`, samples: [{ localMotion: false }] });
const LANES = [0, 1, 2, 3, 4, 5];

export const lapPoolDescriptor = aquatic({
  asset: 'lap-pool', name: 'Lap pool', purpose: 'A 25 m six-lane pool for leisure centres, clubs and schools: lane ropes, markings and backstroke flags, with lane anchors for starting blocks and a water anchor for swimmers. Lane use and swimmer counts stay host data.',
  bounds: { min: [-13.5, 0, -6.79], max: [13.5, 1.8, 6.79] },
  note: 'A 25 × 12.5 m basin along x inside a 0.14 m coping (1 m end decks, 0.3 m sides), water at 0.1 m: a low-relief basin on the floor, not an excavated one. Lanes are 2 m wide; lane 0 is at +z. Backstroke flag posts stand 5 m from each end, just outside the sides.',
  colorRole: 'liquid', colorParts: 'the water',
  roles: [
    { role: 'liquid', parts: 'Translucent water surface' },
    { role: 'surface', parts: 'Tiled basin floor' },
    { role: 'structure', parts: 'Coping and backstroke flag posts' },
    { role: 'screen', parts: 'Lane lines and waterline tiles' },
    { role: 'accent', parts: 'Lane-rope floats and every second pennant; the thermal cover when covered' },
    { role: 'trim', parts: 'Alternate lane-rope floats, pennants and the flag line; cover seams when covered' },
  ],
  fixed: 'The last 5 m of each lane rope are red, and ripple highlights are white.',
  options: [{ field: 'variant', type: "'open' | 'covered'", default: 'open', update: 'rebuild', description: 'Open water with seven lane ropes, or a thermal cover with seams over the water and no ropes.', samples: [{ variant: 'covered' }] }, localMotionOption('the ripples')],
  states: noStatus('pool'),
  motion: { animation: 'local', staticPose: 'Ripple highlights rest at their built positions; the covered pool never animates.' },
  anchors: [
    ...LANES.map(i => ({ name: `lane-${i}-start`, purpose: `End-deck point of lane ${i + 1} at −x, facing along the lane (+x): a starting block attaches here.` })),
    ...LANES.map(i => ({ name: `lane-${i}-end`, purpose: `End-deck point of lane ${i + 1} at +x, facing back along the lane.` })),
    ...[0, 1, 2, 3].map(i => ({ name: `ladder-${i}`, purpose: `Side coping ${i < 2 ? 'at +z' : 'at −z'}, ${i % 2 ? '+x' : '−x'} end, facing into the water: a pool ladder attaches here.` })),
    { name: 'water', purpose: 'Centre of the water surface; swimmers move at this height.' },
  ],
  hit: 'Every visible mesh of the basin, water, ropes and flags.',
  relationships: 'Attach starting blocks to the lane-start anchors and ladders to the ladder anchors; place swimmers at the water height, with lapPoolLaneZ(lane) for the lane centre. The host owns lane bookings, occupancy and water quality.',
  limits: ['Fixed size and six lanes.', 'The basin is a low relief; there is no depth profile or deep end.', 'No status tint; lane status belongs to starting blocks or labels.'],
});

export const wadingPoolDescriptor = aquatic({
  asset: 'wading-pool', name: 'Wading pool', purpose: 'A round shallow pool with a mushroom fountain for family and leisure areas.',
  bounds: { min: [-2.9, 0, -2.9], max: [2.9, 1.27, 2.9] },
  note: 'A 5.2 m round basin inside a 0.3 m coping at 0.14 m, water at 0.09 m, and a 1.24 m mushroom at the centre with a 1.2 m cap.',
  colorRole: 'liquid', colorParts: 'the water',
  roles: [
    { role: 'liquid', parts: 'Water surface; the fountain curtain and droplets are a lighter shade of it' },
    { role: 'surface', parts: 'Basin floor' },
    { role: 'structure', parts: 'Coping and mushroom stem' },
    { role: 'accent', parts: 'Mushroom cap and floor rings' },
    { role: 'trim', parts: 'Cap rim, spout and collar' },
  ],
  options: [{ field: 'variant', type: "'fountain' | 'still'", default: 'fountain', update: 'rebuild', description: 'A water curtain falls from the mushroom cap, or the mushroom stays dry.', samples: [{ variant: 'still' }] }, localMotionOption('the curtain and droplets')],
  states: noStatus('wading pool'),
  motion: { animation: 'local', staticPose: 'The curtain stands at its built shape with droplets at rest; the still variant has no curtain and never animates.' },
  anchors: [
    { name: 'water', purpose: 'Centre of the water surface.' },
    { name: 'entry', purpose: 'Deck point in front of the coping at +z, for approach.' },
    { name: 'top', purpose: 'Above the mushroom cap, for a label.' },
  ],
  hit: 'Every visible mesh of the basin, water and fountain.',
  relationships: 'Place people standing in the water (scaled workers or floating swimmers); the host owns bather counts and water quality.',
  limits: ['Fixed size and depth.', 'The fountain is decorative and encodes no flow or schedule.'],
});

export const swimmerDescriptor = aquatic({
  asset: 'swimmer', name: 'Swimmer', purpose: 'A low-poly swimmer at the water line, swimming freestyle or floating face up, for lane occupancy and leisure scenes.',
  pivot: 'stance', bounds: { min: [-.262, 0, -1.256], max: [.262, .322, .949] },
  largest: { node: { variant: 'floating' }, bounds: { min: [-.855, .014, -1.249], max: [.855, .277, .702] } },
  note: 'About 2.2 m from toes to the reaching hand, head toward +z. The pivot is the water-line point under the chest: place it at the pool water height minus about 0.08 m so the body is half submerged.',
  colorRole: 'accent', colorParts: 'the swim cap',
  roles: [
    { role: 'accent', parts: 'Swim cap' },
    { role: 'skin', parts: 'Head, torso, arms, hands, legs and feet' },
    { role: 'structure', parts: 'Swimsuit' },
    { role: 'screen', parts: 'Goggles' },
  ],
  fixed: 'Kick foam is translucent white.',
  options: [{ field: 'variant', type: "'freestyle' | 'floating'", default: 'freestyle', update: 'rebuild', description: 'Freestyle with one arm reaching forward, or floating face up with arms and legs spread.', samples: [{ variant: 'floating' }] }, localMotionOption('the stroke')],
  states: noStatus('swimmer'),
  motion: { animation: 'local', staticPose: 'Freestyle holds one arm forward and one back; floating never animates. A pose never confirms that someone is swimming.' },
  anchors: [{ name: 'top', purpose: 'Above the head, for a floating label.' }],
  hit: 'Every visible mesh of the figure.',
  relationships: 'Give a swimmer a looping route along a lane at the pool water height; the route owns the root and heading while the stroke animates in place. The host owns who is in the water.',
  limits: ['One stroke; no turns, dives or breathing.', 'No status tint.'],
});

export const startingBlockDescriptor = aquatic({
  asset: 'starting-block', name: 'Starting block', purpose: 'A competition starting block with a lane number plate and a status lamp, standing for one lane on a pool board.',
  bounds: { min: [-.26, 0, -.358], max: [.26, .877, .363] },
  note: 'A 0.5 m body with a 0.72 m platform at about 0.7 m, tilted 0.1 rad toward +z (the water). Attach it to a lap-pool lane-start anchor.',
  colorRole: 'accent', colorParts: 'the platform',
  roles: [
    { role: 'accent', parts: 'Platform' },
    { role: 'structure', parts: 'Body and backstroke grips' },
    { role: 'trim', parts: 'Foot plate, grip strips and kick wedge' },
    { role: 'text', parts: 'Number plate' },
    { role: 'screen', parts: 'Placeholder number without label artwork' },
  ],
  options: [{ field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the front number plate, such as the lane number; it replaces the placeholder number.' }],
  states: noStatus('starting block'),
  motion: { animation: 'none', staticPose: 'Always static.' },
  anchors: [
    { name: 'stand', purpose: 'Centre of the platform top, where a swimmer stands before a start.' },
    { name: 'plate', purpose: 'Centre of the front number plate.' },
  ],
  hit: 'Every visible mesh of the block.',
  relationships: 'Attach to a lap-pool lane-start anchor so the platform overhangs the water; the recipe may attach a separate lane-status marker. The host owns lane status.',
  textures: 'Number plate artwork only, owned by the instance.',
  limits: ['No timing touchpad or start signal.'],
});

export const lifeguardChairDescriptor = aquatic({
  asset: 'lifeguard-chair', name: 'Lifeguard chair', purpose: 'An elevated lifeguard post with a shade canopy and rescue tube; staffing is host data.',
  bounds: { min: [-.6, 0, -.584], max: [.6, 2.605, .584] },
  note: 'About 1.2 × 2.61 × 1.17 m; the seat is at 1.6 m and faces +z, the footrest at 1.08 m. Rungs on the rear legs act as the ladder.',
  colorRole: 'accent', colorParts: 'the seat, backrest and canopy',
  roles: [
    { role: 'accent', parts: 'Seat, backrest and canopy' },
    { role: 'structure', parts: 'Frame, rungs, footrest and platform' },
  ],
  fixed: 'The rescue tube is safety orange.',
  states: noStatus('lifeguard chair'),
  motion: { animation: 'none', staticPose: 'Always static.' },
  anchors: [
    { name: 'seat', purpose: 'Seat top facing +z; a seated worker attaches here with the shared [0, −0.52, 0] offset and rests on the footrest.' },
    { name: 'ladder', purpose: 'Floor point behind the chair where the lifeguard climbs up.' },
    { name: 'top', purpose: 'Top of the canopy, for a label or separate host alert.' },
  ],
  hit: 'Every visible mesh of the chair.',
  relationships: 'Seat a lifeguard (worker, seated) at the seat anchor when the post is staffed; a separate host marker carries post status. The host owns rotas and alerts.',
  limits: ['Staffing and beach-flag codes remain host data.'],
});

export const poolLadderDescriptor = aquatic({
  asset: 'pool-ladder', name: 'Pool ladder', purpose: 'A stainless grab-rail ladder over the pool edge, for entry points on a pool board.',
  bounds: { min: [-.295, 0, -.365], max: [.295, 1.008, .35] },
  note: 'Rails rise from the deck at −z, arch over the coping at about 1 m and drop into the water at +z, with one step under the water line. Attach it to a lap-pool ladder anchor.',
  colorRole: 'structure', colorParts: 'the rails',
  roles: [
    { role: 'structure', parts: 'Grab rails' },
    { role: 'trim', parts: 'Step and deck escutcheons' },
  ],
  states: noStatus('ladder'),
  motion: { animation: 'none', staticPose: 'Always static.' },
  anchors: [
    { name: 'deck', purpose: 'Deck point behind the rails, for approach.' },
    { name: 'top', purpose: 'Top of the rail arch, for a label.' },
  ],
  hit: 'Rails, step and escutcheons.',
  relationships: 'Attach to a lap-pool ladder anchor; the +z side then faces the water.',
  limits: ['One step, matching the low-relief basin.'],
});

export const sunLoungerDescriptor = aquatic({
  asset: 'sun-lounger', name: 'Sun lounger', purpose: 'A poolside lounger with cushions and a towel, reclined or flat, for deck layouts.',
  bounds: { min: [-.375, 0, -1], max: [.375, .871, .975] },
  note: 'About 0.75 × 2 m with the head at −z on two wheels; the seat is at 0.39 m. Reclined lifts the backrest to about 0.87 m.',
  colorRole: 'accent', colorParts: 'the cushions',
  roles: [
    { role: 'accent', parts: 'Seat and backrest cushions' },
    { role: 'structure', parts: 'Frame, legs and backrest props' },
    { role: 'trim', parts: 'Rolled towel' },
  ],
  fixed: 'Wheels are dark rubber.',
  options: [{ field: 'variant', type: "'reclined' | 'flat'", default: 'reclined', update: 'rebuild', description: 'Backrest raised on props, or flat.', samples: [{ variant: 'flat' }] }],
  states: noStatus('lounger'),
  motion: { animation: 'none', staticPose: 'Always static.' },
  anchors: [{ name: 'surface', purpose: 'Seat cushion top, where a towel, bag or other item rests.' }],
  hit: 'Every visible mesh of the lounger.',
  relationships: 'Line loungers along a deck; the host owns rentals and reservations. People do not lie on it: there is no lying pose.',
  limits: ['No lying person pose.', 'No status tint.'],
});

export const deckShowerDescriptor = aquatic({
  asset: 'deck-shower', name: 'Deck shower', purpose: 'A poolside shower column on a drain tray, with explicit running water.',
  bounds: { min: [-.4, 0, -.4], max: [.4, 2.29, .4] },
  note: 'An 0.8 m tray with a 2.2 m column at the back (−z) and the rose over the tray centre.',
  colorRole: 'structure', colorParts: 'the column and arm',
  roles: [
    { role: 'structure', parts: 'Column, arm, foot tap and push button' },
    { role: 'trim', parts: 'Drain tray, rose and button panel' },
    { role: 'liquid', parts: 'Water stream and droplets' },
  ],
  states: noStatus('shower'),
  options: [localMotionOption('the droplets'), { field: 'waterRunning', type: 'boolean', default: 'true', update: 'rebuild', description: 'Visible water on/off; false removes water and its animator. Independent of status.', samples: [{ waterRunning: false }] }],
  motion: { animation: 'local', staticPose: 'The stream stands still with droplets at rest; waterRunning: false shows no water and never animates.' },
  anchors: [
    { name: 'stand', purpose: 'Tray point under the rose, where a person stands.' },
    { name: 'top', purpose: 'Top of the arm, for a label.' },
  ],
  slots: ['shower'],
  hit: 'Every visible mesh of the shower, including the water.',
  relationships: 'One shower interaction slot lets a behavior agent use it; the host owns whether it is out of service.',
  limits: ['Water is decorative and encodes no flow or temperature.'],
});

export const lifeRingPostDescriptor = aquatic({
  asset: 'life-ring-post', name: 'Life ring post', purpose: 'A rescue point with a life ring and throw line under a sign plate, for safety equipment on a pool or waterfront board.',
  bounds: { min: [-.37, 0, -.2], max: [.37, 1.7, .2] },
  note: 'A 1.7 m post on a 0.4 m base; the 0.74 m ring hangs on the +z face at 1 m.',
  colorRole: 'accent', colorParts: 'the ring',
  roles: [
    { role: 'accent', parts: 'Life ring' },
    { role: 'trim', parts: 'Ring bands' },
    { role: 'structure', parts: 'Post, base and hook' },
    { role: 'text', parts: 'Sign plate' },
    { role: 'screen', parts: 'Placeholder ring mark without label artwork' },
  ],
  fixed: 'The throw line is natural rope.',
  options: [{ field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the sign plate, such as a rescue point number; it replaces the placeholder mark.' }],
  states: noStatus('life ring post'),
  motion: { animation: 'none', staticPose: 'Always static.' },
  anchors: [
    { name: 'ring', purpose: 'Centre of the hanging ring.' },
    { name: 'top', purpose: 'Top of the post, for a label.' },
  ],
  hit: 'Every visible mesh of the post, ring and sign.',
  relationships: 'Place at pool corners or along a waterfront; the host owns inspection records.',
  textures: 'Sign artwork only, owned by the instance.',
  limits: ['The ring is always present; a missing ring is host data.'],
});

export const dosingStationDescriptor = aquatic({
  asset: 'dosing-station', name: 'Dosing station', purpose: 'A water-treatment controller with a reading display, flow cell, dosing pumps and canisters, for pool plant rooms and other water treatment.',
  bounds: { min: [-.65, 0, -.3], max: [.65, 1.96, .3] },
  note: 'A 1.3 × 0.6 m spill base with a 1.96 m back board; the controller display is at 1.6 m on the left, facing +z.',
  colorRole: 'surface', colorParts: 'the back board',
  roles: [
    { role: 'surface', parts: 'Back board' },
    { role: 'structure', parts: 'Base, posts and probes' },
    { role: 'trim', parts: 'Spill tray, pumps, keys and bracket' },
    { role: 'screen', parts: 'Controller housing and pump heads' },
    { role: 'text', parts: 'Placeholder digits without label artwork' },
    { role: 'glass', parts: 'Sample flow cell' },
    { role: 'accent', parts: 'Chemical canisters' },
  ],
  fixed: 'The display background is dark, tubing is pale, and the two cap tones are decorative: they do not identify chemicals.',
  options: [{ field: 'surfaceLabel', type: 'SurfaceLabel', default: 'none', update: 'rebuild', description: 'Text or SVG artwork on the controller display, such as host-supplied pH and chlorine readings; it replaces the placeholder digits.' }],
  states: noStatus('dosing station'),
  motion: { animation: 'none', staticPose: 'Always static.' },
  anchors: [
    { name: 'display', purpose: 'Centre of the controller display.' },
    { name: 'operator', purpose: 'Floor point in front of the station.' },
    { name: 'top', purpose: 'Top of the back board, for a label.' },
  ],
  slots: ['service'],
  hit: 'Every visible mesh of the station.',
  relationships: 'One service slot in front; the display shows host readings. The host owns sensor data, limits and dosing commands.',
  textures: 'Display artwork only, owned by the instance.',
  limits: ['No reading, limit or dosing logic in the model.'],
});

export const sandFilterDescriptor = aquatic({
  asset: 'sand-filter', name: 'Sand filter', purpose: 'A pool sand filter vessel with a six-way valve, pipes and a neutral pressure gauge, for plant rooms.',
  bounds: { min: [-.55, 0, -.55], max: [.55, 1.618, .55] },
  note: 'A 0.9 m vessel on a 1.1 m plinth, about 1.62 m tall with the valve handle; pipes run down both sides.',
  colorRole: 'accent', colorParts: 'the vessel',
  roles: [
    { role: 'accent', parts: 'Vessel shell and domes' },
    { role: 'structure', parts: 'Stand, valve body, pipes and drain' },
    { role: 'trim', parts: 'Plinth, bands, valve cap, flanges and gauge bezel' },
    { role: 'screen', parts: 'Valve handle and gauge needle' },
    { role: 'glass', parts: 'Sight glass' },
  ],
  fixed: 'The gauge face is white.',
  states: noStatus('sand filter'),
  motion: { animation: 'none', staticPose: 'Always static; the needle is fixed and is not a reading.' },
  anchors: [
    { name: 'top', purpose: 'Above the valve handle, for a label.' },
    { name: 'service', purpose: 'Floor point in front of the filter.' },
  ],
  slots: ['service'],
  hit: 'Every visible mesh of the filter.',
  relationships: 'Group filters with pumps and dosing stations in a plant room; the host owns pressure, backwash schedules and alarms.',
  limits: ['The gauge needle is not a reading.'],
});

export const aquaticsDescriptors: Readonly<Record<string, ObjectDescriptor>> = Object.freeze(Object.fromEntries([
  lapPoolDescriptor, wadingPoolDescriptor, swimmerDescriptor, startingBlockDescriptor, lifeguardChairDescriptor, poolLadderDescriptor,
  sunLoungerDescriptor, deckShowerDescriptor, lifeRingPostDescriptor, dosingStationDescriptor, sandFilterDescriptor,
].map(descriptor => [descriptor.asset, descriptor])));
