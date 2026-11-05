import type { Vec3 } from './index';
import type { NodeSample } from './descriptor';

/**
 * Handling compatibility (phase H0 of docs/CONTAINMENT.md): declared data that says which
 * movable units fit into which places. It describes physical fit only: no inventory and no
 * business rules; `createHandlingState` tracks placements and checks moves against it. All sizes
 * are metres; width runs along model x and depth along model z.
 */

/**
 * Generic groups of handling classes. Receptacles accept families (optionally narrowed to
 * classes), never asset keys, so a new asset with a known class fits every existing receptacle.
 * Domain profiles add classes inside these families; they never add families.
 */
export const HANDLING_FAMILIES = ['item', 'case', 'soft-pack', 'tray', 'unit-load', 'wheeled', 'module'] as const;
export type HandlingFamily = typeof HANDLING_FAMILIES[number];
/** Reader-facing family names, e.g. for catalog tags. */
export const HANDLING_FAMILY_LABELS: Readonly<Record<HandlingFamily, string>> = Object.freeze({
  /** Single goods without their own container: a product, a flask, a plate. */
  item: 'item',
  /** Rigid box carried by hand or conveyed: carton, tote, crate. */
  case: 'case',
  /** Flexible pack: shopping bag, poly mailer, mail sack. */
  'soft-pack': 'soft pack',
  /** Flat carrier of items: lab tray, food tray. */
  tray: 'tray',
  /** Moved by forks or a pallet jack: loaded pallet, drum pallet, IBC, bulk bag. */
  'unit-load': 'unit load',
  /** Rolled, not lifted: roll cage, picking cart. */
  wheeled: 'wheeled carrier',
  /** Mounted equipment on rails: rack server, switch. */
  module: 'mounted module',
});

/** A box size in metres: `footprint` is [width along x, depth along z]. */
export interface HandlingSize { footprint: readonly [width: number, depth: number]; height: number; }

/** One kind of handling unit within a domain profile, with its nominal real size. */
export interface HandlingClass {
  /** `${profile id}/${name}`, e.g. `logistics/carton-m`. */
  id: string;
  family: HandlingFamily;
  /** Reader-facing name, e.g. `Medium carton`. */
  name: string;
  /** Nominal size of one unit, unloaded. A unit that carries a deck (a pallet) measures to its deck top. */
  size: HandlingSize;
  /** What may rest directly on top of one unit: up to `maxAbove` units (0–64) of these families. */
  stacking: { maxAbove: number; families: readonly HandlingFamily[] };
  /** Whether the unit may be turned 90° about y to fit a place or a load pattern. */
  turnable: boolean;
}

/** One unit position in a load pattern, relative to the deck origin (anchor plus envelope offset). */
export interface PatternPosition { offset: readonly [x: number, z: number]; /** 90 swaps the footprint's width and depth. */ yaw: 0 | 90; }

/**
 * A named, declared layout of one class on a deck, one layer high. Layers of a mixed load each
 * use one pattern; the toolkit does not search for packings.
 */
export interface LoadPattern {
  /** `${profile id}/${name}`, e.g. `logistics/carton-m-3x2`. */
  id: string;
  /** The class every position holds. */
  class: string;
  name: string;
  positions: readonly PatternPosition[];
}

/** A domain profile: the shared vocabulary of unit classes and load patterns for one domain. */
export interface HandlingProfile {
  /** Lowercase key, e.g. `logistics`; prefixes every class and pattern ID. */
  id: string;
  name: string;
  classes: readonly HandlingClass[];
  patterns: readonly LoadPattern[];
}

/** What a receptacle accepts: every class of `families`, or only `classes` when given (each must belong to one of the families). */
export interface HandlingAccepts { families: readonly HandlingFamily[]; classes?: readonly string[]; }

interface ReceptacleBase {
  /** Unique within the asset, e.g. `level-0`, `deck`, `carry`. */
  name: string;
  accepts: HandlingAccepts;
  /**
   * Clear space for one position (`slot`), one unit of a pile (`stack`), the whole load (`deck`) or
   * the whole rail (`rail`), in model metres: the footprint is centred on the envelope origin and
   * the height rises from it. A `rail` along x or z starts at the anchor and runs along that axis.
   */
  envelope: HandlingSize;
  /** Envelope origin relative to each anchor, in model axes, where a unit's pivot rests. Default [0, 0, 0]. */
  offset?: Vec3;
  /** Interaction-slot group from which agents reach the receptacle, e.g. the shelf's `pick`. */
  reachedFrom?: string;
}

/**
 * A place on a container that holds units, at existing model anchors.
 * - `slot`: one unit per anchor; any unit can be taken.
 * - `stack`: a pile of up to `capacity` units at one anchor, bottom first; only the top unit can be taken.
 * - `deck`: a load surface at one anchor; layers use the listed load patterns, and the envelope height limits the load; only the top layer can be taken.
 * - `rail`: `positions` integer places of `pitch` metres along `axis`, from one anchor; a unit spans as many as its length needs, and any unit can be taken.
 * - `bulk`: no positions; the host describes contents as `ContainerContents` lines, so units are not placed here.
 */
export type Receptacle = ReceptacleBase & (
  | { arrangement: 'slot'; anchors: readonly string[] }
  | { arrangement: 'stack'; anchor: string; capacity: number }
  | { arrangement: 'deck'; anchor: string; patterns: readonly string[] }
  | { arrangement: 'rail'; anchor: string; positions: number; pitch: number; axis: HandlingAxis }
  | { arrangement: 'bulk'; anchor: string }
);
export type ReceptacleArrangement = Receptacle['arrangement'];

/** Model axis a `rail` runs along. */
export type HandlingAxis = 'x' | 'y' | 'z';

/** A movable asset: its class, and the uniform node scale at which the model has the class's nominal size. */
export interface HandlingUnit {
  class: string;
  /** Other classes by `AssetNode.variant`, when a variant changes the unit, e.g. a 1U or 2U server. Instances name their variant. */
  variants?: Readonly<Record<string, string>>;
  /** Uniform `AssetNode.scale` for placing the unit in receptacles, 0 < scale ≤ 10. Placement scale is never a quantity. */
  scale: number;
}

/** Handling declaration of one asset: a unit, receptacles, or both (a pallet is a unit with a deck). */
export interface AssetHandling {
  unit?: HandlingUnit;
  receptacles: readonly Receptacle[];
  /**
   * Configuration without decorative contents, e.g. `{ count: 0 }` for an empty shelf or tote.
   * The unit is measured and slot clearance is checked in it. Default: the default configuration.
   */
  empty?: NodeSample;
}

export const MAX_STACK_CAPACITY = 64;
export const MAX_RAIL_POSITIONS = 512;
export const MAX_HANDLING_SCALE = 10;
/** Tolerance in metres for touching pattern positions and envelope edges. */
export const HANDLING_FIT_TOLERANCE = .001;

const NAME = /^[a-z0-9][a-z0-9-]*$/;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validSize = (size: HandlingSize | undefined) => !!size && Array.isArray(size.footprint) && size.footprint.length === 2 && size.footprint.every(positive) && positive(size.height);
const isFamily = (value: unknown): value is HandlingFamily => (HANDLING_FAMILIES as readonly unknown[]).includes(value);

/** Footprint of a pattern position or a turned unit. */
export function turnedFootprint(footprint: HandlingSize['footprint'], yaw: 0 | 90): readonly [number, number] { return yaw === 90 ? [footprint[1], footprint[0]] : footprint; }

/** All classes and patterns of the given profiles, by ID. Throws on duplicate IDs across profiles. */
export function handlingVocabulary(profiles: readonly HandlingProfile[]) {
  const classes = new Map<string, HandlingClass>(), patterns = new Map<string, LoadPattern>();
  for (const profile of profiles) {
    for (const entry of profile.classes) { if (classes.has(entry.id)) throw new Error(`Handling class ${entry.id} is declared by more than one profile; give each class one owner.`); classes.set(entry.id, entry); }
    for (const entry of profile.patterns) { if (patterns.has(entry.id)) throw new Error(`Load pattern ${entry.id} is declared by more than one profile; give each pattern one owner.`); patterns.set(entry.id, entry); }
  }
  return { classes, patterns };
}

/** Structural checks of a domain profile: IDs, families, sizes, stacking, and patterns that do not overlap. */
export function validateHandlingProfile(profile: HandlingProfile): void {
  if (!profile || typeof profile.id !== 'string' || !NAME.test(profile.id)) throw new Error(`Handling profile ID ${String(profile?.id)} must be lowercase letters, digits and hyphens.`);
  const label = `Handling profile ${profile.id}`, prefix = `${profile.id}/`;
  if (typeof profile.name !== 'string' || !profile.name.trim()) throw new Error(`${label} needs a name.`);
  const classes = new Map<string, HandlingClass>();
  for (const entry of profile.classes) {
    if (typeof entry.id !== 'string' || !entry.id.startsWith(prefix) || !NAME.test(entry.id.slice(prefix.length))) throw new Error(`${label}: class ID ${String(entry.id)} must be ${prefix}<lowercase-name>.`);
    if (classes.has(entry.id)) throw new Error(`${label}: class ${entry.id} is declared twice.`);
    if (!isFamily(entry.family)) throw new Error(`${label}: class ${entry.id} has unknown family ${String(entry.family)}; use one of ${HANDLING_FAMILIES.join(', ')}.`);
    if (typeof entry.name !== 'string' || !entry.name.trim()) throw new Error(`${label}: class ${entry.id} needs a name.`);
    if (!validSize(entry.size)) throw new Error(`${label}: class ${entry.id} needs a positive finite footprint and height in metres.`);
    if (!entry.stacking || !(Number.isSafeInteger(entry.stacking.maxAbove) && entry.stacking.maxAbove >= 0 && entry.stacking.maxAbove <= MAX_STACK_CAPACITY) || !Array.isArray(entry.stacking.families) || !entry.stacking.families.every(isFamily)) throw new Error(`${label}: class ${entry.id} stacking needs maxAbove from 0 to ${MAX_STACK_CAPACITY} and known families.`);
    if (entry.stacking.maxAbove > 0 && !entry.stacking.families.length) throw new Error(`${label}: class ${entry.id} allows units above but lists no families; list them or set maxAbove to 0.`);
    if (typeof entry.turnable !== 'boolean') throw new Error(`${label}: class ${entry.id} must declare turnable as a boolean.`);
    classes.set(entry.id, entry);
  }
  const patterns = new Set<string>();
  for (const pattern of profile.patterns) {
    if (typeof pattern.id !== 'string' || !pattern.id.startsWith(prefix) || !NAME.test(pattern.id.slice(prefix.length))) throw new Error(`${label}: load pattern ID ${String(pattern.id)} must be ${prefix}<lowercase-name>.`);
    if (patterns.has(pattern.id)) throw new Error(`${label}: load pattern ${pattern.id} is declared twice.`);
    patterns.add(pattern.id);
    const unit = classes.get(pattern.class);
    if (!unit) throw new Error(`${label}: load pattern ${pattern.id} uses class ${String(pattern.class)}, which this profile does not declare.`);
    if (typeof pattern.name !== 'string' || !pattern.name.trim() || !pattern.positions?.length) throw new Error(`${label}: load pattern ${pattern.id} needs a name and at least one position.`);
    const boxes = pattern.positions.map((position, index) => {
      if (!Array.isArray(position.offset) || position.offset.length !== 2 || !position.offset.every(Number.isFinite) || (position.yaw !== 0 && position.yaw !== 90)) throw new Error(`${label}: load pattern ${pattern.id} position ${index} needs a finite [x, z] offset and yaw 0 or 90.`);
      if (position.yaw === 90 && !unit.turnable) throw new Error(`${label}: load pattern ${pattern.id} turns ${unit.id}, which is not turnable.`);
      return patternBox(unit, position);
    });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j])) throw new Error(`${label}: load pattern ${pattern.id} positions ${i} and ${j} overlap; move them apart by at least the unit footprint.`);
  }
}

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number; }
function patternBox(unit: HandlingClass, position: PatternPosition): Rect {
  const [width, depth] = turnedFootprint(unit.size.footprint, position.yaw), [x, z] = position.offset;
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX - HANDLING_FIT_TOLERANCE && b.minX < a.maxX - HANDLING_FIT_TOLERANCE && a.minZ < b.maxZ - HANDLING_FIT_TOLERANCE && b.minZ < a.maxZ - HANDLING_FIT_TOLERANCE;

/** Length of a box along a rail axis, for a footprint already turned to its place. */
export function lengthAlong(axis: HandlingAxis, footprint: HandlingSize['footprint'], height: number): number { return axis === 'y' ? height : axis === 'x' ? footprint[0] : footprint[1]; }
/** Rail positions a length occupies. */
export function railSpan(length: number, pitch: number): number { return Math.max(1, Math.ceil((length - HANDLING_FIT_TOLERANCE) / pitch)); }

/** Anchors a receptacle uses: every slot anchor, or its single anchor. */
export function receptacleAnchors(receptacle: Receptacle): readonly string[] { return receptacle.arrangement === 'slot' ? receptacle.anchors : [receptacle.anchor]; }

/** Whether a class is accepted by family and optional class narrowing; size is checked separately. */
export function acceptsClass(accepts: HandlingAccepts, unit: HandlingClass): boolean {
  return accepts.families.includes(unit.family) && (!accepts.classes || accepts.classes.includes(unit.id));
}

/**
 * How a footprint and height fit an envelope: as declared, turned 90° (only when `turnable`),
 * or not at all. Prefers the declared orientation.
 */
export function fitOrientation(size: HandlingSize, envelope: HandlingSize, turnable: boolean): 'as-is' | 'turned' | null {
  if (size.height > envelope.height + HANDLING_FIT_TOLERANCE) return null;
  const fits = ([width, depth]: readonly [number, number]) => width <= envelope.footprint[0] + HANDLING_FIT_TOLERANCE && depth <= envelope.footprint[1] + HANDLING_FIT_TOLERANCE;
  if (fits(size.footprint)) return 'as-is';
  return turnable && fits(turnedFootprint(size.footprint, 90)) ? 'turned' : null;
}

/**
 * Structural checks of one asset's declaration against the profiles' vocabulary: names, anchors,
 * known classes, accepted families, capacities and load patterns that fit inside their deck.
 * `checkAssetHandling` in the renderer package checks the declaration against the built model.
 */
export function validateAssetHandling(asset: string, handling: AssetHandling, profiles: readonly HandlingProfile[]): void {
  const label = `Handling of ${asset}`, { classes, patterns } = handlingVocabulary(profiles);
  if (!handling || !Array.isArray(handling.receptacles)) throw new Error(`${label} needs a receptacles array; use [] for a unit that holds nothing.`);
  if (!handling.unit && !handling.receptacles.length) throw new Error(`${label} declares neither a unit nor a receptacle; remove the entry instead.`);
  if (handling.unit) {
    for (const id of [handling.unit.class, ...Object.values(handling.unit.variants ?? {})]) if (!classes.has(id)) throw new Error(`${label}: unknown class ${String(id)}; declare it in a domain profile first.`);
    if (!(positive(handling.unit.scale) && handling.unit.scale <= MAX_HANDLING_SCALE)) throw new Error(`${label}: unit scale must be greater than 0 and at most ${MAX_HANDLING_SCALE}.`);
  }
  const names = new Set<string>(), used = new Set<string>();
  for (const receptacle of handling.receptacles) {
    const where = `${label}: receptacle ${String(receptacle.name)}`;
    if (typeof receptacle.name !== 'string' || !NAME.test(receptacle.name) || names.has(receptacle.name)) throw new Error(`${where} needs a unique lowercase name.`);
    names.add(receptacle.name);
    if (!['slot', 'stack', 'deck', 'rail', 'bulk'].includes(receptacle.arrangement)) throw new Error(`${where} has unknown arrangement ${String(receptacle.arrangement)}; use slot, stack, deck, rail or bulk.`);
    const anchors = receptacleAnchors(receptacle);
    if (!Array.isArray(anchors) || !anchors.length || !anchors.every(name => typeof name === 'string' && NAME.test(name))) throw new Error(`${where} needs model anchor names.`);
    for (const name of anchors) { if (used.has(name)) throw new Error(`${where} reuses anchor ${name}; each anchor belongs to one receptacle position.`); used.add(name); }
    if (!receptacle.accepts || !Array.isArray(receptacle.accepts.families) || !receptacle.accepts.families.length || !receptacle.accepts.families.every(isFamily)) throw new Error(`${where} must accept at least one known family (${HANDLING_FAMILIES.join(', ')}).`);
    for (const id of receptacle.accepts.classes ?? []) {
      const entry = classes.get(id);
      if (!entry) throw new Error(`${where} accepts unknown class ${id}.`);
      if (!receptacle.accepts.families.includes(entry.family)) throw new Error(`${where} accepts class ${id} of family ${entry.family}, which it does not list in families.`);
    }
    if (!validSize(receptacle.envelope)) throw new Error(`${where} needs a positive finite envelope footprint and height in metres.`);
    if (receptacle.offset !== undefined && !(Array.isArray(receptacle.offset) && receptacle.offset.length === 3 && receptacle.offset.every(Number.isFinite))) throw new Error(`${where} offset must be a finite [x, y, z] value.`);
    if (receptacle.reachedFrom !== undefined && !(typeof receptacle.reachedFrom === 'string' && receptacle.reachedFrom.trim())) throw new Error(`${where} reachedFrom must name an interaction-slot group.`);
    if (receptacle.arrangement === 'stack' && !(Number.isSafeInteger(receptacle.capacity) && receptacle.capacity >= 1 && receptacle.capacity <= MAX_STACK_CAPACITY)) throw new Error(`${where} capacity must be an integer from 1 to ${MAX_STACK_CAPACITY}.`);
    if (receptacle.arrangement === 'rail') {
      if (!(Number.isSafeInteger(receptacle.positions) && receptacle.positions >= 1 && receptacle.positions <= MAX_RAIL_POSITIONS)) throw new Error(`${where} positions must be an integer from 1 to ${MAX_RAIL_POSITIONS}.`);
      if (!positive(receptacle.pitch)) throw new Error(`${where} pitch must be a positive number of metres.`);
      if (!['x', 'y', 'z'].includes(receptacle.axis)) throw new Error(`${where} axis must be x, y or z.`);
      const length = lengthAlong(receptacle.axis, receptacle.envelope.footprint, receptacle.envelope.height), expected = receptacle.positions * receptacle.pitch;
      if (Math.abs(length - expected) > HANDLING_FIT_TOLERANCE) throw new Error(`${where} envelope is ${length} m along ${receptacle.axis}, but ${receptacle.positions} positions of ${receptacle.pitch} m make ${expected} m. Make them agree.`);
    }
    if (receptacle.arrangement === 'deck') {
      if (!Array.isArray(receptacle.patterns)) throw new Error(`${where} needs a patterns array; use [] for free layers only.`);
      // Pattern offsets and class sizes are real metres; the envelope scales with the container.
      const scale = handling.unit?.scale ?? 1, width = receptacle.envelope.footprint[0] * scale, depth = receptacle.envelope.footprint[1] * scale;
      for (const id of receptacle.patterns) {
        const pattern = patterns.get(id), unit = pattern && classes.get(pattern.class);
        if (!pattern || !unit) throw new Error(`${where} lists unknown load pattern ${id}.`);
        if (!acceptsClass(receptacle.accepts, unit)) throw new Error(`${where} lists pattern ${id} for ${unit.id}, which the deck does not accept.`);
        if (unit.size.height > receptacle.envelope.height * scale + HANDLING_FIT_TOLERANCE) throw new Error(`${where} lists pattern ${id}, but one ${unit.id} layer is taller than the ${receptacle.envelope.height * scale} m envelope.`);
        for (const position of pattern.positions) {
          const box = patternBox(unit, position);
          if (box.minX < -width / 2 - HANDLING_FIT_TOLERANCE || box.maxX > width / 2 + HANDLING_FIT_TOLERANCE || box.minZ < -depth / 2 - HANDLING_FIT_TOLERANCE || box.maxZ > depth / 2 + HANDLING_FIT_TOLERANCE) throw new Error(`${where}: pattern ${id} reaches outside the ${width} × ${depth} m deck; use a pattern made for this deck size.`);
        }
      }
    }
  }
}

/** One declared fit of a unit asset into a receptacle of a container asset. */
export interface HandlingFit {
  unit: string;
  container: string;
  receptacle: string;
  arrangement: ReceptacleArrangement;
  /** `fits`: the family is accepted and the unit fits the envelope. `too-large`: accepted, but the unit is bigger than the envelope. */
  verdict: 'fits' | 'too-large';
  /** The unit has to be turned 90° to fit. */
  turned: boolean;
  /** For a unit with its own deck: the highest load in metres above that deck that still fits, when the receptacle limits it below the deck's own envelope. */
  maxLoadHeight?: number;
  /** Load patterns of the container's deck for this unit's class. */
  patterns: readonly string[];
  /** Reader-facing sentence; for `too-large`, it names both sizes. */
  message: string;
}

const metres = (value: number) => `${Number(value.toFixed(3))}`;
const sizeText = (size: HandlingSize) => `${metres(size.footprint[0])} × ${metres(size.footprint[1])} × ${metres(size.height)} m`;

/**
 * Every declared fit between unit assets and receptacles, derived from the declarations and the
 * profiles: receptacles that accept the unit's family and class, with `fits` or `too-large`.
 * Receptacles that do not accept the family are omitted. A container's envelope is scaled by its
 * own unit scale when the container is also a unit. Sorted by unit, container and receptacle.
 * This is declared compatibility: it does not track placements or check moves.
 */
export function handlingFits(handling: Readonly<Record<string, AssetHandling>>, profiles: readonly HandlingProfile[]): HandlingFit[] {
  const { classes, patterns } = handlingVocabulary(profiles), fits: HandlingFit[] = [];
  const assets = Object.keys(handling).sort();
  for (const unitAsset of assets) {
    const unit = handling[unitAsset].unit, unitClass = unit && classes.get(unit.class);
    if (!unit || !unitClass) continue;
    const ownDeck = handling[unitAsset].receptacles.find(receptacle => receptacle.arrangement === 'deck');
    for (const container of assets) {
      const containerScale = handling[container].unit?.scale ?? 1;
      for (const receptacle of handling[container].receptacles) {
        // Bulk receptacles hold host contents lines, so no unit is ever placed there.
        if (receptacle.arrangement === 'bulk' || !acceptsClass(receptacle.accepts, unitClass)) continue;
        const envelope: HandlingSize = { footprint: [receptacle.envelope.footprint[0] * containerScale, receptacle.envelope.footprint[1] * containerScale], height: receptacle.envelope.height * containerScale };
        const orientation = fitOrientation(unitClass.size, envelope, unitClass.turnable);
        const deckPatterns = receptacle.arrangement === 'deck' ? receptacle.patterns.filter(id => patterns.get(id)?.class === unitClass.id) : [];
        let maxLoadHeight: number | undefined;
        if (orientation && ownDeck) {
          const room = envelope.height - unitClass.size.height, own = ownDeck.envelope.height * unit.scale;
          if (room < own - HANDLING_FIT_TOLERANCE) maxLoadHeight = Number(room.toFixed(3));
        }
        const where = `${container} ${receptacle.name}`;
        fits.push({
          unit: unitAsset, container, receptacle: receptacle.name, arrangement: receptacle.arrangement,
          verdict: orientation ? 'fits' : 'too-large', turned: orientation === 'turned', ...(maxLoadHeight !== undefined ? { maxLoadHeight } : {}), patterns: deckPatterns,
          message: orientation
            ? `${unitClass.name} (${sizeText(unitClass.size)}) fits ${where}${orientation === 'turned' ? ' turned 90°' : ''}${maxLoadHeight !== undefined ? ` with a load up to ${metres(maxLoadHeight)} m high` : ''}.`
            : `${unitClass.name} (${sizeText(unitClass.size)}) is larger than the ${sizeText(envelope)} clear space of ${where}${unitClass.turnable ? ' in either orientation' : ''}.`,
        });
      }
    }
  }
  return fits;
}
