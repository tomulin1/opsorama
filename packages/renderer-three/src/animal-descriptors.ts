import { neutralModelStates } from './visual-states';
import type { AnchorDescriptor, Bounds, ObjectDescriptor, OptionDescriptor, PaletteRoleUse } from '@opsorama/core';

/** Descriptors for the animal batch; every entry is checked against its factory in tests. */
const EVIDENCE_TESTS = ['tests/animal-objects.test.ts', 'tests/object-contract.test.ts'];
const ANCHORS: readonly AnchorDescriptor[] = [
  { name: 'top', purpose: 'Above the highest point of the current pose, at the stance point, for a label.' },
  { name: 'head', purpose: 'Tip of the muzzle or beak; it follows the head, so a feeder, trough or bowl can be placed in front of it.' },
];

interface AnimalEntry {
  asset: string; name: string; purpose: string; bounds: Bounds; lyingBounds?: Bounds; note: string;
  roles: readonly PaletteRoleUse[]; fixed: string; tag: string; colorParts: string;
  /** The pose option; ground animals use `groundPose`. */
  variant: OptionDescriptor; staticPose?: string; pivot?: string; relationships?: string; limits: readonly string[];
}
const GROUND_PIVOT = 'The pivot is the ground point under the body, head toward +z.';
const GROUND_STATIC = 'Standing rests with the head forward and the tail down; walking holds the legs straight under the body; lying never animates. A pose never confirms what the real animal is doing.';
const GROUND_RELATIONSHIPS = 'Give a walking animal a looping route or a motion controller; the route owns the root and heading while the gait animates in place. Place each visible animal as its own node: herd, flock and pen counts, identities and health records stay host data.';
const GROUND_LIMITS = ['One look per species; there is no grazing, eating or lying-on-the-side pose.'];
const groundPose = (walking: string, rest: string): OptionDescriptor => ({ field: 'variant', type: "'standing' | 'walking' | 'lying'", default: 'standing', update: 'rebuild', description: `Pose. Standing idles in place; walking ${walking} in place; lying ${rest}.`, samples: [{ variant: 'walking' }, { variant: 'lying' }] });
const animal = (entry: AnimalEntry): ObjectDescriptor => Object.freeze({
  asset: entry.asset, name: entry.name, category: 'Animals', version: 1, purpose: entry.purpose,
  geometry: {
    units: 'metres', pivot: 'stance', forward: '+z', up: '+y', bounds: entry.bounds,
    ...(entry.lyingBounds ? { largest: { node: { variant: 'lying' }, bounds: entry.lyingBounds } } : {}),
    note: `${entry.note} ${entry.pivot ?? GROUND_PIVOT}${entry.lyingBounds ? ' Lying is lower but has the widest footprint, so it is declared as the largest configuration.' : ''}`,
  },
  palette: { colorRole: 'hair', roles: [...entry.roles, { role: 'trim', parts: entry.tag }], fixed: entry.fixed },
  customization: [
    { field: 'color', type: 'CSS #RRGGBB', default: 'hair role', update: 'rebuild', description: `Compatibility shortcut for ${entry.colorParts} (hair role); materials.hair wins over it.`, samples: [{ color: '#aa5533' }] },
    { field: 'materials', type: 'MaterialOverrides', default: 'inherit', update: 'rebuild', description: 'Partial instance roles over the scene palette; unspecified roles keep the species defaults.', samples: [{ materials: { [entry.roles[1].role]: '#123456' } }] },
    entry.variant,
    { field: 'localMotion', type: 'boolean', default: 'true', update: 'rebuild', description: 'False keeps the idle, gait or wingbeat still; it can never re-enable motion that the scene or reduced motion disabled.', samples: [{ localMotion: false }] },
    { field: 'position / rotation / scale', type: 'Vec3', default: 'origin', update: 'transform', description: 'Root transform; scale resizes the whole animal, and a new position is interpolated (see motion).' },
  ],
  states: neutralModelStates('animal'),
  motion: {
    animation: 'local',
    staticPose: entry.staticPose ?? GROUND_STATIC,
    transform: 'A new record position interpolates toward the target while motion is on; paused, motion-off and reduced motion show the target immediately. Routes and controllers own the transform when present.',
    policy: 'The animator follows the scene clock, speed and pause and never moves the root; scene motion-off and reduced motion stop it, and localMotion: false keeps it still.',
  },
  interaction: {
    selectable: 'Selectable when the node has an entityId or selectable: true.', hit: 'Every visible mesh of the animal, including the tag.',
    anchors: ANCHORS, slots: [],
    relationships: entry.relationships ?? GROUND_RELATIONSHIPS,
  },
  lifecycle: {
    ownership: 'instance', textures: 'None.', animator: true,
    update: 'Field changes rebuild the model and keep the root position; transform changes do not rebuild.',
    disposal: 'disposeObject releases every geometry and material and clears the animator; no subscriptions or timers.',
  },
  evidence: { examples: [`/docs/objects/${entry.asset}`, '/examples/farm'], tests: EVIDENCE_TESTS, limits: ['Not countable: one node is one visible animal.', ...entry.limits] },
} satisfies ObjectDescriptor);

const QUADRUPED_WALK = 'trots (diagonal legs swing together, the head nods, the tail swings)';
const QUADRUPED_LIE = 'rests on the belly with the legs folded and never animates';

export const cowDescriptor = animal({
  asset: 'cow', name: 'Cow', purpose: 'A dairy cow for farm, dairy and livestock boards: a patched coat, horns, an udder and an ear tag for identification.',
  bounds: { min: [-.392, 0, -.943], max: [.38, 1.374, 1.367] }, lyingBounds: { min: [-.549, -.003, -1.49], max: [.549, .744, 1.367] },
  note: 'About 1.37 m at the back and 2.3 m from the tail to the muzzle; the tail hangs at the back (−z).',
  colorParts: 'the coat',
  roles: [
    { role: 'hair', parts: 'Coat: body, neck, head, legs and tail' },
    { role: 'trim', parts: 'Patches, ears and tail tuft' },
    { role: 'skin', parts: 'Muzzle and udder' },
  ],
  fixed: 'Hooves, horns, eyes and nostrils are natural tones.', tag: 'Ear tag on the left (+x) ear', variant: groundPose(QUADRUPED_WALK, `${QUADRUPED_LIE}; the udder is hidden`), limits: GROUND_LIMITS,
});

export const horseDescriptor = animal({
  asset: 'horse', name: 'Horse', purpose: 'A riding horse for stables, equestrian centres and farm boards, with a halter with a neutral identification tag.',
  bounds: { min: [-.32, 0, -1.028], max: [.32, 2.173, 1.494] }, lyingBounds: { min: [-.578, -.015, -1.509], max: [.578, 1.313, 1.494] },
  note: 'About 1.6 m at the withers, 2.17 m to the ears and 2.5 m long; the neck rises forward and the head hangs from it.',
  colorParts: 'the coat',
  roles: [
    { role: 'hair', parts: 'Coat: body, neck, head, ears and legs' },
    { role: 'trim', parts: 'Mane and tail' },
    { role: 'skin', parts: 'Muzzle' },
    { role: 'accent', parts: 'Halter' },
  ],
  fixed: 'Hooves, eyes and nostrils are natural tones.', tag: 'Tag on the left (+x) cheek of the halter', variant: groundPose(QUADRUPED_WALK, QUADRUPED_LIE), limits: [...GROUND_LIMITS, 'No saddle or rider pose.'],
});

export const sheepDescriptor = animal({
  asset: 'sheep', name: 'Sheep', purpose: 'A woolly sheep for farm and pasture boards, with an ear tag for identification.',
  bounds: { min: [-.37, 0, -.578], max: [.37, .959, .748] },
  note: 'About 0.96 m to the top of the head and 1.33 m long; mirrored wool puffs cover the back and sides.',
  colorParts: 'the wool',
  roles: [
    { role: 'hair', parts: 'Wool, wool cap and tail' },
    { role: 'trim', parts: 'Face, ears and legs' },
  ],
  fixed: 'Hooves and eyes are natural tones.', tag: 'Ear tag on the left (+x) ear', variant: groundPose(QUADRUPED_WALK, QUADRUPED_LIE), limits: GROUND_LIMITS,
});

export const pigDescriptor = animal({
  asset: 'pig', name: 'Pig', purpose: 'A pig for farm and livestock boards, with an ear tag for identification.',
  bounds: { min: [-.28, 0, -.605], max: [.28, .77, .814] }, lyingBounds: { min: [-.31, 0, -.605], max: [.31, .54, .814] },
  note: 'About 0.77 m tall and 1.42 m long, with a curly tail at the back.',
  colorParts: 'the coat',
  roles: [
    { role: 'hair', parts: 'Coat: body, head, legs and tail' },
    { role: 'skin', parts: 'Snout and ears' },
  ],
  fixed: 'Hooves, eyes and nostrils are natural tones.', tag: 'Ear tag on the left (+x) ear', variant: groundPose(QUADRUPED_WALK, QUADRUPED_LIE), limits: GROUND_LIMITS,
});

export const chickenDescriptor = animal({
  asset: 'chicken', name: 'Chicken', purpose: 'A hen for poultry, farm and backyard boards, with a wing tag for identification.',
  bounds: { min: [-.14, 0, -.262], max: [.146, .598, .23] },
  note: 'About 0.6 m to the comb and 0.5 m long, standing on two legs.',
  colorParts: 'the plumage',
  roles: [
    { role: 'hair', parts: 'Plumage: body, neck and head' },
    { role: 'trim', parts: 'Wings and tail feathers' },
  ],
  fixed: 'Beak, comb, wattle, legs and eyes are natural tones.', tag: 'Tag on the left (+x) wing',
  variant: groundPose('alternates the legs and nods the head', 'sits brooding on the ground with the legs tucked away and never animates'), limits: GROUND_LIMITS,
});

export const dogDescriptor = animal({
  asset: 'dog', name: 'Dog', purpose: 'A medium dog for kennels, shelters, veterinary clinics and farm boards, with a collar with a neutral identification tag.',
  bounds: { min: [-.16, 0, -.599], max: [.16, .82, .61] }, lyingBounds: { min: [-.26, 0, -.599], max: [.26, .54, .61] },
  note: 'About 0.62 m at the back, 0.82 m to the top of the head and 1.21 m long including the raised tail.',
  colorParts: 'the coat',
  roles: [
    { role: 'hair', parts: 'Coat: body, neck, head, legs, paws and tail' },
    { role: 'trim', parts: 'Ears' },
    { role: 'accent', parts: 'Collar' },
  ],
  fixed: 'Nose and eyes are natural tones.', tag: 'Tag hanging from the collar', variant: groundPose(QUADRUPED_WALK, 'rests on the belly with the front legs stretched forward and never animates'), limits: GROUND_LIMITS,
});

export const catDescriptor = animal({
  asset: 'cat', name: 'Cat', purpose: 'A house cat for shelters, veterinary clinics and home boards, with a collar with a neutral identification tag.',
  bounds: { min: [-.085, 0, -.393], max: [.085, .535, .301] }, lyingBounds: { min: [-.125, 0, -.393], max: [.125, .415, .301] },
  note: 'About 0.32 m at the back, 0.54 m to the raised tail tip and 0.69 m long.',
  colorParts: 'the coat',
  roles: [
    { role: 'hair', parts: 'Coat: body, head, ears, legs and tail' },
    { role: 'trim', parts: 'Chest, muzzle, paws and tail tip' },
    { role: 'skin', parts: 'Nose and inner ears' },
    { role: 'accent', parts: 'Collar' },
  ],
  fixed: 'Eyes are a natural amber tone.', tag: 'Tag hanging from the collar', variant: groundPose(QUADRUPED_WALK, 'rests on the belly with the front legs stretched forward and never animates'), limits: GROUND_LIMITS,
});

export const birdDescriptor = animal({
  asset: 'bird', name: 'Small bird', purpose: 'A small songbird that is usually shown in flight, for gardens, farms, parks and wildlife boards, with a leg band for identification.',
  bounds: { min: [-.143, -.001, -.135], max: [.143, .097, .115] },
  note: 'About 0.25 m from beak to tail with a 0.29 m wingspan. In flight the wings are spread and the legs folded back under the belly.',
  pivot: 'The pivot is the point under the belly (under the feet when perched), head toward +z. The model contains no flight height: set it with the node position y or 3D route points.',
  colorParts: 'the back and head',
  roles: [
    { role: 'hair', parts: 'Plumage: back and head' },
    { role: 'trim', parts: 'Wings and tail' },
    { role: 'accent', parts: 'Breast' },
  ],
  fixed: 'Beak, legs, feet and eyes are natural tones.', tag: 'Band on the left (+x) leg',
  variant: { field: 'variant', type: "'flying' | 'perched'", default: 'flying', update: 'rebuild', description: 'Pose. Flying spreads the wings and flaps them in bursts with short glides, with a light body bob; perched stands with folded wings, turning the head and flicking the tail.', samples: [{ variant: 'perched' }] },
  staticPose: 'Flying holds the wings level and the legs tucked; perched stands with folded wings and the head forward. A pose never confirms what the real bird is doing.',
  relationships: 'Give a flying bird a looping route with points above the ground (route points carry y); the route owns the root and heading while the wings beat in place. Perch it on a fence, roof or branch by setting the position y. Flocks, species and sightings stay host data.',
  limits: ['One generic songbird look; no landing, take-off or hopping animation.', 'At real scale the bird is small in an overview; scale it up for symbolic use.'],
});

export const animalDescriptors: Readonly<Record<string, ObjectDescriptor>> = Object.freeze(Object.fromEntries([
  cowDescriptor, horseDescriptor, sheepDescriptor, pigDescriptor, chickenDescriptor, dogDescriptor, catDescriptor, birdDescriptor,
].map(descriptor => [descriptor.asset, descriptor])));
