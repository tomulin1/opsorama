import { HANDLING_FAMILIES, HANDLING_FAMILY_LABELS } from '@opsorama/core';
import { assetHandling, handlingProfiles } from '@opsorama/objects';
import type { DocArticle } from './content';
import { assetName, sizeText } from './object-handling';

const FAMILY_EXAMPLES: Readonly<Record<string, string>> = { item: 'A product, a lab flask, a plate', case: 'Carton, tote, crate', 'soft-pack': 'Shopping bag, poly mailer, mail sack', tray: 'Lab tray, food tray', 'unit-load': 'Loaded pallet, drum pallet, IBC tank, bulk bag', wheeled: 'Roll cage, picking cart', module: 'Rack server, network switch' };

export const handlingArticle: DocArticle = {
  slug: 'handling', title: 'Handling compatibility', category: 'FOUNDATIONS', description: 'Declared data that says which movable units fit into which shelves, racks, pallets, hands and forks.',
  sections: [
    { id: 'scope', title: 'What is implemented', paragraphs: [
      'Phases H0 to H3 of the handling proposal (docs/CONTAINMENT.md). H0 is a typed vocabulary of unit classes and load patterns, handling declarations for catalog objects, a check against the built models, and derived compatibility on every object page. H1 is createHandlingState: placements of registered nodes and checked moves between compatible places. Both describe physical fit only.',
      'H2 connects agents: a behavior runner created with the handling option moves units through these checks, and /examples/motion runs that way (see Motion & routes).',
      'H3 adds optional move mode for viewers. Nothing stops a host from setting an incompatible attachment directly.',
    ] },
    { id: 'families', title: 'Unit families', paragraphs: ['HANDLING_FAMILIES (core) is a closed list. Receptacles accept families, optionally narrowed to classes, never asset keys, so a new asset with a known class fits every existing receptacle.'], headers: ['Family', 'Name', 'Examples'], rows: HANDLING_FAMILIES.map(family => [family, HANDLING_FAMILY_LABELS[family], FAMILY_EXAMPLES[family]]) },
    { id: 'profile', title: 'Domain profiles', paragraphs: ['A HandlingProfile is the vocabulary of one domain: classes with nominal real sizes, stacking rules and whether a unit may be turned 90°, plus named load patterns for decks. handlingProfiles (@opsorama/objects) lists logisticsProfile, retailProfile, datacenterProfile and laboratoryProfile. A profile only adds classes and patterns, inside the fixed families.'], headers: ['Class', 'Name', 'Family', 'Nominal size', 'Stacking', 'Turnable'], rows: handlingProfiles.flatMap(profile => profile.classes).map(entry => [entry.id, entry.name, entry.family, sizeText(entry.size), entry.stacking.maxAbove ? `${entry.stacking.maxAbove} × ${entry.stacking.families.join(', ')}` : 'none', entry.turnable ? 'yes' : 'no']) },
    { id: 'patterns', title: 'Load patterns', paragraphs: ['A load pattern is a declared layout of one class on a deck, one layer high, with an [x, z] offset from the deck origin and a yaw of 0 or 90 per position. A mixed pallet uses one pattern per layer; the toolkit does not search for packings. validateHandlingProfile rejects overlapping positions, and validateAssetHandling rejects a pattern that reaches outside its deck.'], headers: ['Pattern', 'Name', 'Class', 'Units per layer'], rows: handlingProfiles.flatMap(profile => profile.patterns).map(pattern => [pattern.id, pattern.name, pattern.class, String(pattern.positions.length)]) },
    { id: 'declarations', title: 'Declaring units and receptacles', paragraphs: [
      'assetHandling (@opsorama/objects) maps an asset key to an AssetHandling: an optional unit (class and the uniform node scale at which the model has the class size), receptacles, and an optional empty configuration without decorative contents. A pallet is both: a unit load with a deck.',
      'Receptacles sit at existing model anchors. slot holds one unit per anchor and any unit can be taken; stack is a pile of up to capacity units at one anchor with only the top one reachable; deck is a load surface whose layers use the listed load patterns, limited by the envelope height. rail has integer positions of a pitch along an axis, and a unit spans as many as its length needs, such as a 2U server on a 42-unit cabinet rail. bulk has no positions: the host describes contents as ContainerContents lines, so units are not placed there. The envelope is the clear space in model metres, centred on the anchor plus offset; reachedFrom names the interaction-slot group agents use.',
      `Declared today: ${Object.keys(assetHandling).map(assetName).join(', ')}.`,
    ], code: `import type { AssetHandling } from '@opsorama/core';

// The shared pallet declaration (assetHandling.pallet).
const pallet: AssetHandling = {
  unit: { class: 'logistics/industrial-pallet', scale: 1 },
  receptacles: [{
    name: 'deck', arrangement: 'deck', anchor: 'load',
    accepts: { families: ['case', 'soft-pack'] },
    envelope: { footprint: [1.2, 1], height: 1.6 },
    patterns: ['logistics/carton-m-3x2', 'logistics/tote-2x2'],
  }],
};`, language: 'typescript' },
    { id: 'check', title: 'Checking a declaration', paragraphs: ['checkAssetHandling(asset, handling, factory) builds the empty configuration and returns a ContractReport: the declaration is structurally valid, each receptacle anchor exists once, the unit footprint and height match the class within 3 cm at the unit scale (a unit with a deck measures to its deck top), slot and deck envelopes lie within the model footprint plus 0.1 m overhang, slot envelopes are clear of non-decorative model triangles and of each other, and reachedFrom names an existing slot group. Use it in tests for your own declarations.'], code: `import { assetHandling, catalogAssets, checkAssetHandling } from '@opsorama/objects';

const report = checkAssetHandling('shelf', assetHandling.shelf, catalogAssets.shelf);
expect(report.checks.filter(check => !check.ok)).toEqual([]);`, language: 'typescript' },
    { id: 'fits', title: 'Deriving compatibility', paragraphs: ['handlingFits(handling, profiles) (core) lists every receptacle that accepts each unit by family and class, with verdict fits or too-large, whether the unit is turned, the matching load patterns and, for a unit with its own deck, the highest load that still fits when the receptacle limits it. Receptacles that do not accept the family are omitted. The object pages and the matrix below use this result directly, so they cannot disagree with the declarations.'], code: `import { handlingFits } from '@opsorama/core';
import { assetHandling, handlingProfiles } from '@opsorama/objects';

const fits = handlingFits(assetHandling, handlingProfiles);
fits.filter(fit => fit.unit === 'tote' && fit.verdict === 'fits')
  .map(fit => \`\${fit.container} \${fit.receptacle}\`);
// ['pallet deck', 'shelf level-0', 'shelf level-1', 'shelf level-2', 'worker carry']`, language: 'typescript' },
    { id: 'state', title: 'Tracking placements and moving units', paragraphs: [
      'createHandlingState({ handling, profiles, instances, rule }) (core) tracks which registered node sits where. check(unit, to) tests a move without changing anything; move(moves) applies a list in order, each step seeing the ones before, and changes nothing if one fails. A target names a container and a receptacle, and omitted fields resolve to the next free place; a floor placement takes a world position and a heading in radians.',
      'On a deck each layer keeps the pattern of its first unit, so a unit of another pattern starts the next layer, and free: [x, z] places a unit by metres from the deck origin. A layer rests on the tallest unit below it, and at least 60 % of a unit\'s footprint must lie on units that reach that height (MIN_DECK_SUPPORT). Only the top of a stack or deck can be taken or loaded. A load is checked against its deck and every outer container, so a pallet in a rack bay cannot be loaded above the bay.',
      'The state moves nothing by itself. nodePatches() returns attachment, position, rotation and scale to spread over your scene nodes; units inside a moved container follow through their attachment. A check on floor placements only tests that the unit can be taken. Patches assume containers sit at their handling scale.',
    ], code: `import { createHandlingState } from '@opsorama/core';
import { assetHandling, handlingProfiles } from '@opsorama/objects';

const handling = createHandlingState({
  handling: assetHandling, profiles: handlingProfiles,
  instances: [
    { id: 'pallet-7', asset: 'pallet' }, { id: 'carton-1', asset: 'parcel' },
    { id: 'rack-2', asset: 'pallet-rack' }, { id: 'shelf-1', asset: 'shelf' },
  ],
});

// All or nothing: the carton takes the first free deck position, then the pallet goes into a bay.
handling.move([
  { unit: 'carton-1', to: { container: 'pallet-7', receptacle: 'deck' } },
  { unit: 'pallet-7', to: { container: 'rack-2', receptacle: 'level-0' } },
]);

const refused = handling.check('pallet-7', { container: 'shelf-1', receptacle: 'level-0' });
// refused.ok === false, refused.violations[0].code === 'class-not-accepted'

for (const patch of handling.nodePatches()) {
  const node = store.getSnapshot().nodes.find(entry => entry.id === patch.id);
  if (node) store.upsert({ ...node, ...patch, transfer: { seconds: .6 } });
}`, language: 'typescript' },
    { id: 'violations', title: 'Violations', paragraphs: ['Every failed check lists violations with a code, the unit, a message that names the fix and, where it applies, the blocking units.'], headers: ['Code', 'Meaning'], rows: [
      ['unknown-unit', 'The ID is not registered, or its asset declares no handling unit.'],
      ['unknown-target', 'The container, receptacle, position or pattern does not exist, or a deck needs a pattern or a free position.'],
      ['class-not-accepted', 'The receptacle does not accept the family or class.'],
      ['does-not-fit', 'The unit or the resulting load exceeds the clear space, including that of an outer container.'],
      ['position-taken', 'Another unit holds the position, or the deck layer uses another pattern.'],
      ['receptacle-full', 'No free position remains.'],
      ['no-support', 'A skipped level or layer, or too little of the unit is carried.'],
      ['stack-limit', 'A unit below may not carry this family, or this many levels above it.'],
      ['not-accessible', 'Units above block the unit or the layer.'],
      ['cycle', 'The unit would end up inside itself.'],
      ['host-rule', 'The host rule refused the move; the message is its reason.'],
    ] },
    { id: 'targets', title: 'Finding compatible places', paragraphs: ['targets(unit, { containers, rank, limit }) lists compatible free places, one per free slot, next pile level or deck pattern, without the current place. Each result holds a target to pass to move and the resolved placement. The state does not know world positions, so rank is yours: return a number per target, lowest first. The host rule applies here too.'], code: `const nearest = handling.targets('carton-1', {
  rank: ({ target }) => distanceToNode(target.container),
  limit: 3,
});
if (nearest.length) handling.move([{ unit: 'carton-1', to: nearest[0].target }]);`, language: 'typescript' },
    { id: 'sync', title: 'Following a source of record', paragraphs: ['sync(placements) replaces every placement with a snapshot from your system. A source can be wrong or ahead of the model, so impossible data stays where the source says and comes back as violations for your UI: a pallet recorded in a shelf slot is shown there and reported. Units the snapshot omits become unplaced, and lower layers are processed first, so list order does not matter. A containment cycle is the one thing not applied, because attachments cannot express it. The host rule does not run on sync.'], code: `const violations = handling.sync(new Map([
  ['carton-1', { container: 'pallet-7', receptacle: 'deck', layer: 0, position: 0 }],
  ['pallet-7', { container: 'shelf-1', receptacle: 'level-0' }],
]));
// violations report pallet-7 as class-not-accepted and does-not-fit; it stays on the shelf.`, language: 'typescript' },
    { id: 'move-mode', title: 'Move mode', paragraphs: [
      'Move mode is an optional way to let a viewer move units in the scene. Most dashboards will not need it, and the domain examples leave it out; /examples/move-mode shows it on its own through native React, Vue and plain JavaScript.',
      'createMoveMode({ handling, onRequest, containers, rank, limit }) (core) holds the unit in progress: begin(unit), cancel() and request(target), with a getSnapshot and subscribe store of the unit, its targets and the refusals. It follows the handling state while a unit is in progress. It moves nothing: onRequest receives the unit, the target, where the unit came from and a current check, also when that check failed. Run your own command, then call handling.move.',
      'bindMoveMode(renderer, mode) (renderer) draws a translucent box for each target and turns a click on one into mode.request; it returns a function that stops and clears them. It uses setMoveTargets(targets, onPick) on the renderer, which React and Vue hosts reach through onReady or @ready. Markers sit where the anchors are at that moment, and they are static, so they need no motion setting.',
      'Offer the same targets in HTML, so the choice works with a keyboard and a screen reader, and use refusals(unit) to explain why other places are not offered. See the runnable sample for a complete list, a cancel button and Escape.',
    ], code: `import { createMoveMode } from '@opsorama/core';
import { bindMoveMode } from '@opsorama/three';

const mode = createMoveMode({
  handling,
  onRequest: ({ unit, target, check }) => {
    if (!check.ok) return showReason(check.violations[0].message);
    handling.move([{ unit, to: target.target }]);
    applyPatches(handling.nodePatches());
    mode.cancel();
  },
});

// In onReady or @ready, or after createSceneRenderer:
const stop = bindMoveMode(renderer, mode);

// When the viewer selects a unit:
mode.begin('carton-1');

// On teardown:
stop(); mode.dispose();`, language: 'typescript' },
    { id: 'limits', title: 'Known limits', list: [
      'The pallet is an industrial pallet (1.2 × 1.0 m), the size of the pallet-rack loads; it fits a rack position either way round, and the matrix shows how high its load may be on each level. EUR pallets (1.2 × 0.8 m) are not modelled.',
      'The single parcel is about 1.03 m wide at scale 1; its class size applies at scale 0.4, the tote (600 × 400 mm) at 0.475. The placement scale is a transform, never a quantity.',
      'There is no restaurant profile: plates and trays are decoration of their models, so restaurant scenes have no movable unit yet. Retail products stay host contents lines for the same reason.',
      'Many catalog objects still have no declaration, because their positions have no anchors: put-wall cells, locker compartments, flow-rack lanes and the delivery van bed. Mass limits are planned.',
      'Rails do not model flow: a conveyor position holds a unit until moved, with no first-in, first-out rule.',
      'Accepts cannot be narrowed per instance; use the host rule. The toolkit does not search for packings: decks use declared patterns or free positions.',
    ] },
  ],
};
