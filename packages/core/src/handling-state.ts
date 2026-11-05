import type { Attachment } from './attachment';
import type { Vec3 } from './index';
import { HANDLING_FIT_TOLERANCE, acceptsClass, fitOrientation, handlingVocabulary, lengthAlong, railSpan, receptacleAnchors, turnedFootprint, validateAssetHandling, validateHandlingProfile, type AssetHandling, type HandlingClass, type HandlingProfile, type HandlingSize, type Receptacle } from './handling';

/**
 * Handling state (phase H1 of docs/CONTAINMENT.md): which registered unit sits where, and checked
 * moves between compatible places. It tracks physical placement of scene nodes only; records,
 * business rules and commands stay with the host. Nothing here moves a node by itself: a host
 * applies `nodePatches()` to its scene store.
 */

/** A scene node the state tracks: its node ID and asset key, which must have an `assetHandling` entry. `variant` picks a class from `HandlingUnit.variants`. */
export interface HandlingInstance { id: string; asset: string; variant?: string; }

/**
 * Where a unit should go in a receptacle. Omitted fields resolve to the next free place.
 * - `slot`: `position` is an index into the receptacle's anchors.
 * - `stack`: `position` is the pile level, bottom 0; only the next level is valid.
 * - `deck`: `layer` is the load layer, bottom 0. `position` indexes the layer's load pattern, named
 *   by `pattern`; a layer keeps the pattern of its first unit. `free` places a unit by [x, z] metres
 *   from the deck origin instead, for layers no pattern covers.
 * - `rail`: `position` is the first position the unit occupies.
 * - `bulk`: not a target; describe contents with `ContainerContents`.
 */
export interface ReceptacleTarget {
  container: string;
  receptacle: string;
  position?: number;
  layer?: number;
  pattern?: string;
  free?: readonly [x: number, z: number];
  /** Quarter turn about y in degrees. Default: as declared, or 90 when only that fits. A pattern position sets its own turn. */
  turn?: 0 | 90;
}
/** Resting on the floor: world metres and a heading in radians, the same shape as `ItemRest`. */
export interface FloorPlacement { position: Vec3; yaw: number; }
export type HandlingTarget = ReceptacleTarget | FloorPlacement;

/** A resolved place in a receptacle. `offset` is local to `anchor`, in the container's model space; a missing `anchor` means the source named an unknown receptacle. */
export interface ReceptaclePlacement {
  container: string;
  receptacle: string;
  anchor?: string;
  position?: number;
  layer: number;
  pattern?: string;
  free?: readonly [x: number, z: number];
  turn: 0 | 90;
  offset: Vec3;
}
export type UnitPlacement = ReceptaclePlacement | FloorPlacement;

export type HandlingViolationCode =
  /** The ID is not registered, or its asset declares no handling unit. */
  | 'unknown-unit'
  /** The container, receptacle, position or load pattern does not exist, or a deck needs a pattern or `free` position. */
  | 'unknown-target'
  /** The receptacle does not accept the unit's family or class. */
  | 'class-not-accepted'
  /** The unit, or the load it would make, exceeds the clear space, including that of an outer container. */
  | 'does-not-fit'
  /** Another unit holds the position, or the deck layer uses another pattern. */
  | 'position-taken'
  /** No free position remains. */
  | 'receptacle-full'
  /** Nothing holds the unit up: a skipped level or layer, or less than `MIN_DECK_SUPPORT` of its footprint is carried. */
  | 'no-support'
  /** A unit below may not carry this family, or this many levels above it. */
  | 'stack-limit'
  /** Units above block the unit or the layer: only the top of a stack or deck can be taken or loaded. */
  | 'not-accessible'
  /** The unit would end up inside itself. */
  | 'cycle'
  /** The host `rule` refused the move; the message is the host's reason. */
  | 'host-rule';

export interface HandlingViolation {
  code: HandlingViolationCode;
  unit: string;
  /** Names the problem and the fix. */
  message: string;
  /** Units in the way, for `position-taken`, `not-accessible`, `no-support` and `stack-limit`. */
  blocking?: readonly string[];
}

export interface MoveCheck {
  ok: boolean;
  violations: readonly HandlingViolation[];
  /** The resolved place when `ok`. */
  placement?: UnitPlacement;
}

/** A compatible free place for a unit, ready to pass to `move`. `size` is the unit there: turned footprint and height with its load, in real metres. */
export interface ResolvedTarget { target: ReceptacleTarget; placement: ReceptaclePlacement; size: HandlingSize; }

/** A declared place that refuses a unit, with the reasons. */
export interface MoveRefusal { container: string; receptacle: string; violations: readonly HandlingViolation[]; }

export interface HandlingMove { unit: string; to: HandlingTarget; }

export type HandlingEvent =
  /** One unit changed place; units inside it follow through their attachment. */
  | { kind: 'moved'; unit: string; from?: UnitPlacement; to: UnitPlacement }
  /** A unit lost its place because it, or its container, was unregistered. */
  | { kind: 'unplaced'; unit: string; from: UnitPlacement }
  /** `sync` replaced every placement. */
  | { kind: 'synced'; units: number; violations: number };

/** Attachment and transform for one placed unit. Spread over the scene node; `attachment` is undefined on the floor, so it clears a previous one. */
export interface HandlingNodePatch { id: string; attachment: Attachment | undefined; position: Vec3; rotation: Vec3; scale: Vec3; }

export interface HandlingStateOptions {
  /** Declarations by asset key, usually `assetHandling` from the renderer package. */
  handling: Readonly<Record<string, AssetHandling>>;
  /** Domain profiles, usually `handlingProfiles` from the renderer package. */
  profiles: readonly HandlingProfile[];
  instances?: readonly HandlingInstance[];
  /** Business veto, run on physically valid moves and targets, never on `sync`. Return the reason to refuse, or undefined to allow. */
  rule?: (request: { unit: string; to: UnitPlacement }) => string | undefined;
}

export interface HandlingState {
  /** Add nodes. Throws on a duplicate ID or an asset without a declaration. */
  register(instances: readonly HandlingInstance[]): void;
  /** Remove a node; it and the units directly inside it lose their place. Returns the units that were unplaced. */
  unregister(id: string): readonly string[];
  /** Check a move without changing anything. */
  check(unit: string, to: HandlingTarget): MoveCheck;
  /** Apply moves in order, each seeing the ones before it. All or nothing: on the first failure nothing changes and the checks so far are returned, the last one failed. */
  move(moves: readonly HandlingMove[]): readonly MoveCheck[];
  /** Compatible free places, one per free slot, next pile level, or deck pattern. `rank` sorts lowest first and is stable; `limit` applies after it. */
  targets(unit: string, options?: { containers?: readonly string[]; rank?: (target: ResolvedTarget) => number; limit?: number }): readonly ResolvedTarget[];
  /** Declared receptacles that refuse the unit, with the reasons, e.g. to explain missing targets in HTML. Places inside the unit itself are left out. */
  refusals(unit: string, options?: { containers?: readonly string[] }): readonly MoveRefusal[];
  /**
   * Replace every placement with a host-authoritative snapshot; units it does not list become
   * unplaced. Impossible data is kept where the source says and reported, because a source can
   * be wrong or ahead of the model. Only a containment cycle is not applied, since attachments
   * cannot express it.
   */
  sync(placements: ReadonlyMap<string, HandlingTarget>): readonly HandlingViolation[];
  placement(unit: string): UnitPlacement | undefined;
  /** Every placed unit, oldest arrival first. A `move` or `sync` counts as an arrival. */
  placements(): ReadonlyMap<string, UnitPlacement>;
  /** Name of the receptacle at a container's anchor, e.g. to find the stack behind a carry rule. */
  receptacleAt(container: string, anchor: string): string | undefined;
  /** Units in a container, by receptacle, layer and position; `deep` includes units inside those units. */
  contents(container: string, options?: { deep?: boolean }): readonly string[];
  /** Containment chain from the unit up to its top-level container, unit first. */
  path(unit: string): readonly string[];
  /** Attachment and transform for every placed unit, or for the given IDs. Assumes containers sit at their handling scale. */
  nodePatches(ids?: readonly string[]): readonly HandlingNodePatch[];
  /** Events arrive after a whole `move` or `sync` is applied. Returns the unsubscribe function. */
  subscribe(listener: (event: HandlingEvent) => void): () => void;
}

/** Share of a deck unit's footprint that the layer below must carry. */
export const MIN_DECK_SUPPORT = .6;

interface Rect { minX: number; maxX: number; minZ: number; maxZ: number; }
const isReceptacleTarget = (to: HandlingTarget): to is ReceptacleTarget => 'container' in to;
const isPlaced = (placement: UnitPlacement): placement is ReceptaclePlacement => 'container' in placement;
const rectOf = ([x, z]: readonly [number, number], [width, depth]: readonly [number, number]): Rect => ({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
const areaOf = (rect: Rect) => (rect.maxX - rect.minX) * (rect.maxZ - rect.minZ);
const metres = (value: number) => `${Number(value.toFixed(3))} m`;
const list = (units: readonly string[]) => units.join(', ');

/** Create handling state. Validates the profiles and declarations; throws with the fix when one is wrong. */
export function createHandlingState({ handling, profiles, instances = [], rule }: HandlingStateOptions): HandlingState {
  for (const profile of profiles) validateHandlingProfile(profile);
  for (const [asset, declaration] of Object.entries(handling)) validateAssetHandling(asset, declaration, profiles);
  const { classes, patterns } = handlingVocabulary(profiles);
  const assets = new Map<string, string>(), variants = new Map<string, string>(), placements = new Map<string, UnitPlacement>(), children = new Map<string, Set<string>>(), listeners = new Set<(event: HandlingEvent) => void>();
  const arrivals = new Map<string, number>();
  let arrival = 0;

  const declarationOf = (id: string) => { const asset = assets.get(id); return asset === undefined ? undefined : handling[asset]; };
  const classOf = (id: string): HandlingClass | undefined => { const unit = declarationOf(id)?.unit; return unit && classes.get(unit.variants?.[variants.get(id) ?? ''] ?? unit.class); };
  /** Container model metres per real metre is 1 / this: envelopes and pattern offsets scale with the container. */
  const scaleOf = (id: string) => declarationOf(id)?.unit?.scale ?? 1;
  const receptacleOf = (id: string, name: string) => declarationOf(id)?.receptacles.find(entry => entry.name === name);
  const envelopeOf = (container: string, receptacle: Receptacle): HandlingSize => { const scale = scaleOf(container); return { footprint: [receptacle.envelope.footprint[0] * scale, receptacle.envelope.footprint[1] * scale], height: receptacle.envelope.height * scale }; };

  function setPlacement(unit: string, placement: UnitPlacement | undefined) {
    const previous = placements.get(unit);
    if (previous && isPlaced(previous)) { const siblings = children.get(previous.container); siblings?.delete(unit); if (!siblings?.size) children.delete(previous.container); }
    if (!placement) { placements.delete(unit); return; }
    placements.set(unit, placement);
    if (isPlaced(placement)) { if (!children.has(placement.container)) children.set(placement.container, new Set()); children.get(placement.container)!.add(unit); }
  }
  const occupants = (container: string, receptacle: string, except?: string) => [...children.get(container) ?? []].flatMap(unit => { const placed = placements.get(unit); return unit !== except && placed && isPlaced(placed) && placed.receptacle === receptacle ? [{ unit, placed }] : []; });

  /** Height of a unit with everything on its decks. */
  function effectiveHeight(unit: string): number {
    const decks = declarationOf(unit)?.receptacles.filter(entry => entry.arrangement === 'deck') ?? [];
    return (classOf(unit)?.size.height ?? 0) + Math.max(0, ...decks.map(deck => [...layerHeights(unit, deck.name).values()].reduce((sum, height) => sum + height, 0)));
  }
  function layerHeights(container: string, receptacle: string, except?: string) {
    const heights = new Map<number, number>();
    for (const { unit, placed } of occupants(container, receptacle, except)) heights.set(placed.layer, Math.max(heights.get(placed.layer) ?? 0, effectiveHeight(unit)));
    return heights;
  }
  function layerBase(container: string, receptacle: string, layer: number, except?: string) {
    let base = 0;
    for (const [index, height] of layerHeights(container, receptacle, except)) if (index < layer) base += height;
    return base;
  }
  function deckRect(unit: string, placed: ReceptaclePlacement): Rect {
    const footprint = turnedFootprint(classOf(unit)?.size.footprint ?? [0, 0], placed.turn);
    const pattern = placed.pattern ? patterns.get(placed.pattern) : undefined;
    return rectOf(placed.free ?? pattern?.positions[placed.position ?? 0]?.offset ?? [0, 0], footprint);
  }
  /** Length of a unit along a rail, as placed, in real metres; on a rail this is its size in positions times the pitch. */
  function railLength(unit: string, turn: 0 | 90, receptacle: Extract<Receptacle, { arrangement: 'rail' }>) {
    return lengthAlong(receptacle.axis, turnedFootprint(classOf(unit)?.size.footprint ?? [0, 0], turn), effectiveHeight(unit));
  }
  /** Local offset of a resolved place: the receptacle offset, plus the unit's place in container model metres. */
  function offsetOf(unit: string, placed: Omit<ReceptaclePlacement, 'offset'>): Vec3 {
    const receptacle = receptacleOf(placed.container, placed.receptacle), [ox, oy, oz] = receptacle?.offset ?? [0, 0, 0], scale = scaleOf(placed.container);
    if (receptacle?.arrangement === 'stack') {
      const height = occupants(placed.container, placed.receptacle, unit).reduce((sum, entry) => (entry.placed.position ?? 0) < (placed.position ?? 0) ? sum + effectiveHeight(entry.unit) : sum, 0);
      return [ox, oy + height / scale, oz];
    }
    if (receptacle?.arrangement === 'rail') {
      const start = (placed.position ?? 0) * receptacle.pitch, along = receptacle.axis === 'y' ? start : start + railLength(unit, placed.turn, receptacle) / scale / 2;
      return [ox + (receptacle.axis === 'x' ? along : 0), oy + (receptacle.axis === 'y' ? along : 0), oz + (receptacle.axis === 'z' ? along : 0)];
    }
    if (receptacle?.arrangement === 'deck') {
      const pattern = placed.pattern ? patterns.get(placed.pattern) : undefined, [x, z] = placed.free ?? pattern?.positions[placed.position ?? 0]?.offset ?? [0, 0];
      return [ox + x / scale, oy + layerBase(placed.container, placed.receptacle, placed.layer, unit) / scale, oz + z / scale];
    }
    return [ox, oy, oz];
  }

  /** Units a taken unit is blocked by: higher in its stack or deck. */
  function blockedBy(unit: string, placed: ReceptaclePlacement): string[] {
    const receptacle = receptacleOf(placed.container, placed.receptacle), others = occupants(placed.container, placed.receptacle, unit);
    if (receptacle?.arrangement === 'stack') return others.filter(({ placed: other }) => (other.position ?? 0) > (placed.position ?? 0)).map(entry => entry.unit);
    if (receptacle?.arrangement === 'deck') return others.filter(({ placed: other }) => other.layer > placed.layer).map(entry => entry.unit);
    return [];
  }
  const insideItself = (unit: string, container: string) => { for (let current: string | undefined = container; current !== undefined;) { if (current === unit) return true; const placed: UnitPlacement | undefined = placements.get(current); current = placed && isPlaced(placed) ? placed.container : undefined; } return false; };

  type Draft = { placement: Omit<ReceptaclePlacement, 'offset'>; violations: HandlingViolation[] };
  const violation = (code: HandlingViolationCode, unit: string, message: string, blocking?: readonly string[]): HandlingViolation => ({ code, unit, message, ...(blocking?.length ? { blocking } : {}) });

  /** Orientation of a unit in a position with one envelope, honouring a requested turn. */
  function orient(unit: string, unitClass: HandlingClass, envelope: HandlingSize, turn: 0 | 90 | undefined): 0 | 90 | null {
    const size: HandlingSize = { footprint: unitClass.size.footprint, height: effectiveHeight(unit) };
    if (turn === undefined) { const fit = fitOrientation(size, envelope, unitClass.turnable); return fit === null ? null : fit === 'turned' ? 90 : 0; }
    if (turn === 90 && !unitClass.turnable) return null;
    return fitOrientation({ ...size, footprint: turnedFootprint(size.footprint, turn) }, envelope, false) ? turn : null;
  }
  const tooLarge = (unit: string, unitClass: HandlingClass, where: string, envelope: HandlingSize) => violation('does-not-fit', unit, `${unit} (${metres(unitClass.size.footprint[0])} × ${metres(unitClass.size.footprint[1])}, ${metres(effectiveHeight(unit))} high with its load) is larger than the ${metres(envelope.footprint[0])} × ${metres(envelope.footprint[1])} × ${metres(envelope.height)} clear space of ${where}. Use a larger place or a lower load.`);

  function resolveSlot(unit: string, unitClass: HandlingClass, to: ReceptacleTarget, receptacle: Extract<Receptacle, { arrangement: 'slot' }>): Draft {
    const where = `${to.container} ${to.receptacle}`, others = occupants(to.container, to.receptacle, unit), taken = new Map(others.map(entry => [entry.placed.position, entry.unit]));
    const position = to.position ?? receptacle.anchors.findIndex((_, index) => !taken.has(index)), violations: HandlingViolation[] = [];
    const base = { container: to.container, receptacle: to.receptacle, layer: 0 };
    if (position < 0) return { placement: { ...base, anchor: receptacle.anchors[0], position: 0, turn: to.turn ?? 0 }, violations: [violation('receptacle-full', unit, `${where} has no free slot. Move a unit out or choose another place.`, others.map(entry => entry.unit))] };
    if (!receptacle.anchors[position]) return { placement: { ...base, position, turn: to.turn ?? 0 }, violations: [violation('unknown-target', unit, `${where} has no position ${position}; use 0 to ${receptacle.anchors.length - 1}.`)] };
    if (taken.has(position)) violations.push(violation('position-taken', unit, `Position ${position} of ${where} holds ${taken.get(position)}. Move it first or choose a free position.`, [taken.get(position)!]));
    const envelope = envelopeOf(to.container, receptacle), turn = orient(unit, unitClass, envelope, to.turn);
    if (turn === null) violations.push(tooLarge(unit, unitClass, where, envelope));
    return { placement: { ...base, anchor: receptacle.anchors[position], position, turn: turn ?? to.turn ?? 0 }, violations };
  }

  function resolveRail(unit: string, unitClass: HandlingClass, to: ReceptacleTarget, receptacle: Extract<Receptacle, { arrangement: 'rail' }>): Draft {
    const where = `${to.container} ${to.receptacle}`, base = { container: to.container, receptacle: to.receptacle, anchor: receptacle.anchor, layer: 0 }, pitch = receptacle.pitch * scaleOf(to.container);
    const envelope = envelopeOf(to.container, receptacle), turn = orient(unit, unitClass, envelope, to.turn);
    if (turn === null) return { placement: { ...base, position: to.position ?? 0, turn: to.turn ?? 0 }, violations: [tooLarge(unit, unitClass, where, envelope)] };
    const span = railSpan(railLength(unit, turn, receptacle), pitch);
    const others = occupants(to.container, to.receptacle, unit).map(entry => ({ unit: entry.unit, from: entry.placed.position ?? 0, to: (entry.placed.position ?? 0) + railSpan(railLength(entry.unit, entry.placed.turn, receptacle), pitch) }));
    const clashes = (position: number) => others.filter(other => position < other.to && other.from < position + span).map(other => other.unit);
    let position = to.position;
    if (position === undefined) { for (let index = 0; index + span <= receptacle.positions && position === undefined; index++) if (!clashes(index).length) position = index; }
    if (position === undefined) return { placement: { ...base, position: 0, turn }, violations: [violation('receptacle-full', unit, `${where} has no ${span} free positions in a row. Move a unit or choose another place.`, others.map(other => other.unit))] };
    if (!Number.isSafeInteger(position) || position < 0 || position + span > receptacle.positions) return { placement: { ...base, position: 0, turn }, violations: [violation('unknown-target', unit, `${unit} spans ${span} of the ${receptacle.positions} positions of ${where}, so it cannot start at ${position}; use 0 to ${receptacle.positions - span}.`)] };
    const blocking = clashes(position);
    return { placement: { ...base, position, turn }, violations: blocking.length ? [violation('position-taken', unit, `Positions ${position} to ${position + span - 1} of ${where} overlap ${list(blocking)}. Choose free positions.`, blocking)] : [] };
  }

  /** Units below a stacked unit that may not carry it. */
  function stackingConflicts(unit: string, unitClass: HandlingClass, below: readonly { unit: string; levels: number }[]) {
    const refused = below.filter(entry => { const rule = classOf(entry.unit)?.stacking; return !rule || !rule.families.includes(unitClass.family) || entry.levels > rule.maxAbove; }).map(entry => entry.unit);
    return refused.length ? [violation('stack-limit', unit, `${list(refused)} cannot carry ${unit} at this height: their stacking rule limits the family or the levels above. Choose a lower level or another place.`, refused)] : [];
  }

  function resolveStack(unit: string, unitClass: HandlingClass, to: ReceptacleTarget, receptacle: Extract<Receptacle, { arrangement: 'stack' }>): Draft {
    const where = `${to.container} ${to.receptacle}`, others = occupants(to.container, to.receptacle, unit), violations: HandlingViolation[] = [];
    // Levels can have gaps once a host unregisters a unit in the pile; the rest stays on top of what remains.
    const level = Math.max(-1, ...others.map(entry => entry.placed.position ?? 0)) + 1, position = to.position ?? level;
    if (others.length >= receptacle.capacity) violations.push(violation('receptacle-full', unit, `${where} already holds ${receptacle.capacity}, its capacity. Take a unit off first.`, others.map(entry => entry.unit)));
    if (position < level) violations.push(violation('position-taken', unit, `Level ${position} of ${where} is taken; only the next level, ${level}, is free.`, others.filter(entry => entry.placed.position === position).map(entry => entry.unit)));
    if (position > level) violations.push(violation('no-support', unit, `Level ${position} of ${where} has nothing under it; the next level is ${level}.`));
    const envelope = envelopeOf(to.container, receptacle), turn = orient(unit, unitClass, envelope, to.turn);
    if (turn === null) violations.push(tooLarge(unit, unitClass, where, envelope));
    violations.push(...stackingConflicts(unit, unitClass, others.filter(entry => (entry.placed.position ?? 0) < position).map(entry => ({ unit: entry.unit, levels: position - (entry.placed.position ?? 0) }))));
    return { placement: { container: to.container, receptacle: to.receptacle, anchor: receptacle.anchor, position, layer: 0, turn: turn ?? to.turn ?? 0 }, violations };
  }

  function resolveDeckLayer(unit: string, unitClass: HandlingClass, to: ReceptacleTarget, receptacle: Extract<Receptacle, { arrangement: 'deck' }>, layer: number, pattern: string | undefined): Draft {
    const where = `${to.container} ${to.receptacle}`, envelope = envelopeOf(to.container, receptacle), base = { container: to.container, receptacle: to.receptacle, anchor: receptacle.anchor, layer };
    const others = occupants(to.container, to.receptacle, unit), inLayer = others.filter(entry => entry.placed.layer === layer), violations: HandlingViolation[] = [];
    let placement: Draft['placement'];
    if (to.free) {
      const turn = to.turn ?? 0;
      if (turn === 90 && !unitClass.turnable) violations.push(violation('does-not-fit', unit, `${unit} is not turnable; use turn 0.`));
      placement = { ...base, free: to.free, turn };
      const rect = rectOf(to.free, turnedFootprint(unitClass.size.footprint, turn)), [width, depth] = envelope.footprint;
      if (rect.minX < -width / 2 - HANDLING_FIT_TOLERANCE || rect.maxX > width / 2 + HANDLING_FIT_TOLERANCE || rect.minZ < -depth / 2 - HANDLING_FIT_TOLERANCE || rect.maxZ > depth / 2 + HANDLING_FIT_TOLERANCE) violations.push(violation('does-not-fit', unit, `${unit} at [${to.free.join(', ')}] reaches outside the ${metres(width)} × ${metres(depth)} deck of ${where}. Move it inward.`));
    } else {
      const layerPattern = inLayer.find(entry => entry.placed.pattern)?.placed.pattern;
      const chosen = pattern ?? (layerPattern && patterns.get(layerPattern)?.class === unitClass.id ? layerPattern : receptacle.patterns.find(id => patterns.get(id)?.class === unitClass.id));
      const load = chosen ? patterns.get(chosen) : undefined;
      if (!chosen || !load || !receptacle.patterns.includes(chosen)) return { placement: { ...base, turn: to.turn ?? 0 }, violations: [violation('unknown-target', unit, chosen ? `${where} does not list load pattern ${chosen}; use one of: ${receptacle.patterns.join(', ') || 'none'}.` : `${where} has no load pattern for ${unitClass.id}. Name a pattern or give a free [x, z] position.`)] };
      if (load.class !== unitClass.id) return { placement: { ...base, turn: to.turn ?? 0 }, violations: [violation('class-not-accepted', unit, `Load pattern ${chosen} holds ${load.class}, not ${unitClass.id}. Choose a pattern for this class.`)] };
      if (layerPattern && layerPattern !== chosen) return { placement: { ...base, pattern: chosen, position: 0, turn: load.positions[0].yaw }, violations: [violation('position-taken', unit, `Layer ${layer} of ${where} uses pattern ${layerPattern}. Use it, or start the next layer.`, inLayer.map(entry => entry.unit))] };
      const rectAt = (index: number) => rectOf(load.positions[index].offset, turnedFootprint(unitClass.size.footprint, load.positions[index].yaw));
      const clashes = (index: number) => inLayer.filter(entry => overlap(rectAt(index), deckRect(entry.unit, entry.placed)) > HANDLING_FIT_TOLERANCE * HANDLING_FIT_TOLERANCE).map(entry => entry.unit);
      const position = to.position ?? load.positions.findIndex((_, index) => !clashes(index).length);
      if (position < 0) return { placement: { ...base, pattern: chosen, position: 0, turn: load.positions[0].yaw }, violations: [violation('receptacle-full', unit, `Layer ${layer} of ${where} is full. Start the next layer.`, inLayer.map(entry => entry.unit))] };
      if (!load.positions[position]) return { placement: { ...base, pattern: chosen, position, turn: to.turn ?? 0 }, violations: [violation('unknown-target', unit, `Pattern ${chosen} has no position ${position}; use 0 to ${load.positions.length - 1}.`)] };
      placement = { ...base, pattern: chosen, position, turn: load.positions[position].yaw };
      const blocking = clashes(position);
      if (blocking.length) violations.push(violation('position-taken', unit, `Position ${position} of layer ${layer} on ${where} holds ${list(blocking)}. Choose a free position.`, blocking));
    }
    const rect = deckRect(unit, { ...placement, offset: [0, 0, 0] });
    if (to.free) { const blocking = inLayer.filter(entry => overlap(rect, deckRect(entry.unit, entry.placed)) > HANDLING_FIT_TOLERANCE * HANDLING_FIT_TOLERANCE).map(entry => entry.unit); if (blocking.length) violations.push(violation('position-taken', unit, `${unit} would overlap ${list(blocking)} in layer ${layer} of ${where}. Choose a free spot.`, blocking)); }
    const top = layerBase(to.container, to.receptacle, layer, unit) + effectiveHeight(unit);
    if (top > envelope.height + HANDLING_FIT_TOLERANCE) violations.push(violation('does-not-fit', unit, `Layer ${layer} would reach ${metres(top)}, above the ${metres(envelope.height)} load limit of ${where}. Use a lower load.`));
    if (layer > 0) {
      const heights = layerHeights(to.container, to.receptacle, unit), below = heights.get(layer - 1) ?? 0;
      const carriers = others.filter(entry => entry.placed.layer === layer - 1 && effectiveHeight(entry.unit) >= below - HANDLING_FIT_TOLERANCE);
      const carried = carriers.reduce((sum, entry) => sum + overlap(rect, deckRect(entry.unit, entry.placed)), 0);
      if (carried < areaOf(rect) * MIN_DECK_SUPPORT - HANDLING_FIT_TOLERANCE) violations.push(violation('no-support', unit, `Layer ${layer - 1} of ${where} carries ${Math.round(carried / areaOf(rect) * 100)} % of ${unit}; at least ${MIN_DECK_SUPPORT * 100} % is needed. Complete the layer below or choose another position.`, carriers.map(entry => entry.unit)));
      violations.push(...stackingConflicts(unit, unitClass, others.filter(entry => entry.placed.layer < layer && overlap(rect, deckRect(entry.unit, entry.placed)) > 0).map(entry => ({ unit: entry.unit, levels: layer - entry.placed.layer }))));
    }
    return { placement, violations };
  }

  function resolveDeck(unit: string, unitClass: HandlingClass, to: ReceptacleTarget, receptacle: Extract<Receptacle, { arrangement: 'deck' }>, audit: boolean): Draft {
    const where = `${to.container} ${to.receptacle}`, others = occupants(to.container, to.receptacle, unit), top = Math.max(-1, ...others.map(entry => entry.placed.layer));
    if (to.layer !== undefined) {
      if (!Number.isSafeInteger(to.layer) || to.layer < 0) return { placement: { container: to.container, receptacle: to.receptacle, anchor: receptacle.anchor, layer: 0, turn: to.turn ?? 0 }, violations: [violation('unknown-target', unit, `Layer ${String(to.layer)} of ${where} is invalid; use a whole number from 0.`)] };
      const draft = resolveDeckLayer(unit, unitClass, to, receptacle, to.layer, to.pattern);
      if (to.layer > top + 1) return { ...draft, violations: [violation('no-support', unit, `Layer ${to.layer} of ${where} skips a layer; the next layer is ${top + 1}.`), ...draft.violations.filter(entry => entry.code !== 'no-support')] };
      if (!audit && to.layer < top) { const blocking = others.filter(entry => entry.placed.layer > to.layer!).map(entry => entry.unit); return { ...draft, violations: [violation('not-accessible', unit, `Layer ${to.layer} of ${where} is under ${list(blocking)}; only the top layer can be loaded. Take those units off first.`, blocking), ...draft.violations] }; }
      return draft;
    }
    // Without a layer, fill the top layer, then start the next one; report why the last try failed.
    let draft = resolveDeckLayer(unit, unitClass, to, receptacle, Math.max(top, 0), to.pattern);
    if (draft.violations.length && top >= 0) draft = resolveDeckLayer(unit, unitClass, to, receptacle, top + 1, to.pattern);
    return draft;
  }

  /** Resolve a target. A draft placement exists even with violations, so `sync` can keep impossible data; it is undefined only when the unit is unknown or the target would be a cycle. */
  function evaluate(unit: string, to: HandlingTarget, audit: boolean): { violations: HandlingViolation[]; placement?: UnitPlacement } {
    const unitClass = classOf(unit);
    if (!assets.has(unit)) return { violations: [violation('unknown-unit', unit, `${unit} is not registered. Register the node first.`)] };
    if (!unitClass) return { violations: [violation('unknown-unit', unit, `${unit} (${assets.get(unit)}) declares no handling unit, so it cannot be moved. Declare a unit in assetHandling.`)] };
    const violations: HandlingViolation[] = [], current = placements.get(unit);
    if (!audit && current && isPlaced(current)) { const blocking = blockedBy(unit, current); if (blocking.length) violations.push(violation('not-accessible', unit, `${unit} is under ${list(blocking)}; only the top of a stack or deck can be taken. Take those units off first.`, blocking)); }
    if (!isReceptacleTarget(to)) {
      if (!Array.isArray(to.position) || to.position.length !== 3 || !to.position.every(Number.isFinite) || !Number.isFinite(to.yaw)) return { violations: [...violations, violation('unknown-target', unit, 'A floor placement needs a finite position and yaw.')] };
      return { violations, placement: { position: to.position, yaw: to.yaw } };
    }
    if (insideItself(unit, to.container)) return { violations: [...violations, violation('cycle', unit, `${to.container} is ${to.container === unit ? 'the unit itself' : `inside ${unit}`}. Choose a place outside it.`)] };
    const fallback = { container: to.container, receptacle: to.receptacle, layer: to.layer ?? 0, position: to.position, turn: to.turn ?? 0 } as const;
    const receptacle = receptacleOf(to.container, to.receptacle);
    if (!assets.has(to.container)) return { violations: [...violations, violation('unknown-target', unit, `Container ${to.container} is not registered. Register the node first.`)], placement: { ...fallback, offset: [0, 0, 0] } };
    if (!receptacle) return { violations: [...violations, violation('unknown-target', unit, `${to.container} (${assets.get(to.container)}) has no receptacle ${to.receptacle}; use one of: ${declarationOf(to.container)!.receptacles.map(entry => entry.name).join(', ') || 'none'}.`)], placement: { ...fallback, offset: [0, 0, 0] } };
    if (!acceptsClass(receptacle.accepts, unitClass)) {
      violations.push(violation('class-not-accepted', unit, `${to.container} ${to.receptacle} accepts ${receptacle.accepts.classes?.join(', ') ?? receptacle.accepts.families.join(', ')}, not ${unitClass.id} (${unitClass.family}). Choose a compatible place.`));
      if (!audit) return { violations };
    }
    if (receptacle.arrangement === 'bulk') return { violations: [...violations, violation('unknown-target', unit, `${to.container} ${to.receptacle} holds host contents lines, not placed units. Use ContainerContents, or choose a place with positions.`)], placement: { ...fallback, anchor: receptacle.anchor, offset: [0, 0, 0] } };
    const draft = receptacle.arrangement === 'slot' ? resolveSlot(unit, unitClass, to, receptacle) : receptacle.arrangement === 'stack' ? resolveStack(unit, unitClass, to, receptacle) : receptacle.arrangement === 'rail' ? resolveRail(unit, unitClass, to, receptacle) : resolveDeck(unit, unitClass, to, receptacle, audit);
    violations.push(...draft.violations);
    // With the unit tentatively placed, outer containers must still fit: a load can outgrow a rack bay.
    const previous = placements.get(unit);
    setPlacement(unit, { ...draft.placement, offset: [0, 0, 0] });
    for (let inner = to.container, placed = placements.get(inner); placed && isPlaced(placed); placed = placements.get(inner)) {
      const outer = receptacleOf(placed.container, placed.receptacle);
      if (!outer) { inner = placed.container; continue; }
      const used = effectiveHeight(inner) + (outer.arrangement === 'deck' ? layerBase(placed.container, placed.receptacle, placed.layer, inner) : 0), limit = envelopeOf(placed.container, outer).height;
      if (used > limit + HANDLING_FIT_TOLERANCE) violations.push(violation('does-not-fit', unit, `With ${unit}, ${inner} reaches ${metres(used)}, above the ${metres(limit)} clear height of ${placed.container} ${placed.receptacle}. Use a lower load or move ${inner} first.`, [inner]));
      inner = placed.container;
    }
    const offset = offsetOf(unit, draft.placement);
    setPlacement(unit, previous);
    return { violations, placement: { ...draft.placement, offset } };
  }

  /** A physically resolved move plus the host rule; `placement` is set only when the move is allowed. */
  function checkMove(unit: string, to: HandlingTarget): MoveCheck {
    const { violations, placement } = evaluate(unit, to, false);
    if (!violations.length && placement && rule) { const reason = rule({ unit, to: placement }); if (reason) violations.push(violation('host-rule', unit, reason)); }
    return Object.freeze({ ok: !violations.length, violations: Object.freeze(violations), ...(!violations.length && placement ? { placement } : {}) });
  }
  const emit = (events: readonly HandlingEvent[]) => { for (const event of events) for (const listener of [...listeners]) listener(event); };
  const orderOf = (receptacles: readonly Receptacle[], placed: ReceptaclePlacement) => [receptacles.findIndex(entry => entry.name === placed.receptacle), placed.layer, placed.position ?? 0];

  const state: HandlingState = {
    register(entries) {
      for (const { id, asset, variant } of entries) {
        if (typeof id !== 'string' || !id) throw new Error('Handling instances need a node ID.');
        if (assets.has(id)) throw new Error(`Handling instance ${id} is already registered; unregister it first.`);
        if (!Object.hasOwn(handling, asset)) throw new Error(`Handling instance ${id} uses asset ${String(asset)}, which has no handling declaration; add one or leave the node out.`);
        assets.set(id, asset);
        if (variant !== undefined) variants.set(id, variant);
      }
    },
    unregister(id) {
      const events: HandlingEvent[] = [], unplaced: string[] = [];
      for (const unit of [id, ...children.get(id) ?? []]) {
        const from = placements.get(unit);
        if (from) { setPlacement(unit, undefined); arrivals.delete(unit); unplaced.push(unit); events.push({ kind: 'unplaced', unit, from }); }
      }
      assets.delete(id); variants.delete(id);
      emit(events);
      return Object.freeze(unplaced);
    },
    check: checkMove,
    move(moves) {
      const checks: MoveCheck[] = [], undo: [string, UnitPlacement | undefined, number | undefined][] = [], events: HandlingEvent[] = [];
      for (const { unit, to } of moves) {
        const result = checkMove(unit, to);
        checks.push(result);
        if (!result.ok) {
          for (const [id, placement, previous] of undo.reverse()) { setPlacement(id, placement); if (previous === undefined) arrivals.delete(id); else arrivals.set(id, previous); }
          return Object.freeze(checks);
        }
        const from = placements.get(unit);
        undo.push([unit, from, arrivals.get(unit)]); setPlacement(unit, result.placement); arrivals.set(unit, ++arrival); events.push({ kind: 'moved', unit, ...(from ? { from } : {}), to: result.placement! });
      }
      emit(events);
      return Object.freeze(checks);
    },
    targets(unit, { containers, rank, limit } = {}) {
      const unitClass = classOf(unit), found: ResolvedTarget[] = [];
      if (!unitClass) return found;
      const current = placements.get(unit);
      const offer = (target: ReceptacleTarget) => {
        const result = checkMove(unit, target);
        if (!result.ok || !result.placement || !isPlaced(result.placement)) return;
        const { container, receptacle, position, layer, pattern } = result.placement;
        if (current && isPlaced(current) && current.container === container && current.receptacle === receptacle && current.position === position && current.layer === layer) return;
        const size = { footprint: turnedFootprint(unitClass.size.footprint, result.placement.turn), height: effectiveHeight(unit) };
        found.push({ target: { container, receptacle, layer, ...(position !== undefined ? { position } : {}), ...(pattern ? { pattern } : {}) }, placement: result.placement, size });
      };
      for (const container of containers ?? assets.keys()) {
        for (const receptacle of declarationOf(container)?.receptacles ?? []) {
          if (!acceptsClass(receptacle.accepts, unitClass)) continue;
          if (receptacle.arrangement === 'slot') receptacle.anchors.forEach((_, position) => offer({ container, receptacle: receptacle.name, position }));
          else if (receptacle.arrangement === 'stack' || receptacle.arrangement === 'rail') offer({ container, receptacle: receptacle.name });
          else if (receptacle.arrangement === 'deck') for (const pattern of receptacle.patterns) if (patterns.get(pattern)?.class === unitClass.id) offer({ container, receptacle: receptacle.name, pattern });
        }
      }
      if (rank) { const ranks = new Map(found.map(entry => [entry, rank(entry)])); found.sort((a, b) => ranks.get(a)! - ranks.get(b)!); }
      return Object.freeze(limit === undefined ? found : found.slice(0, limit));
    },
    refusals(unit, { containers } = {}) {
      if (!classOf(unit)) return [];
      return Object.freeze([...containers ?? assets.keys()].flatMap(container => (declarationOf(container)?.receptacles ?? []).filter(receptacle => receptacle.arrangement !== 'bulk').flatMap(receptacle => {
        const { violations } = checkMove(unit, { container, receptacle: receptacle.name });
        return violations.length && !violations.some(entry => entry.code === 'cycle') ? [{ container, receptacle: receptacle.name, violations }] : [];
      })));
    },
    sync(source) {
      for (const unit of [...placements.keys()]) setPlacement(unit, undefined);
      arrivals.clear();
      const violations: HandlingViolation[] = [];
      // Lower layers and levels first, so a unit is judged on what lies under it, whatever order the source lists.
      const level = (to: HandlingTarget) => isReceptacleTarget(to) ? [to.layer ?? 0, to.position ?? 0] : [0, 0];
      const ordered = [...source].map(([unit, to], index) => ({ unit, to, index })).sort((a, b) => level(a.to)[0] - level(b.to)[0] || level(a.to)[1] - level(b.to)[1] || a.index - b.index);
      for (const { unit, to } of ordered) {
        const result = evaluate(unit, to, true);
        violations.push(...result.violations);
        if (result.placement) { setPlacement(unit, result.placement); arrivals.set(unit, ++arrival); }
      }
      emit([{ kind: 'synced', units: placements.size, violations: violations.length }]);
      return Object.freeze(violations);
    },
    placement(unit) {
      const placed = placements.get(unit);
      return placed && isPlaced(placed) ? { ...placed, offset: offsetOf(unit, placed) } : placed;
    },
    placements() {
      const ordered = [...placements.keys()].sort((a, b) => (arrivals.get(a) ?? 0) - (arrivals.get(b) ?? 0));
      return new Map(ordered.map(unit => [unit, state.placement(unit)!]));
    },
    receptacleAt(container, anchor) {
      return declarationOf(container)?.receptacles.find(entry => receptacleAnchors(entry).includes(anchor))?.name;
    },
    contents(container, { deep = false } = {}) {
      const receptacles = declarationOf(container)?.receptacles ?? [], rankOf = (unit: string) => orderOf(receptacles, placements.get(unit) as ReceptaclePlacement);
      const direct = [...children.get(container) ?? []].sort((a, b) => { const [x, y] = [rankOf(a), rankOf(b)]; return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
      return Object.freeze(deep ? direct.flatMap(unit => [unit, ...state.contents(unit, { deep })]) : direct);
    },
    path(unit) {
      const chain = [unit];
      for (let placed = placements.get(unit); placed && isPlaced(placed); placed = placements.get(placed.container)) chain.push(placed.container);
      return Object.freeze(chain);
    },
    nodePatches(ids) {
      return Object.freeze((ids ?? [...placements.keys()]).flatMap<HandlingNodePatch>(id => {
        const placed = state.placement(id), scale = scaleOf(id);
        if (!placed) return [];
        if (!isPlaced(placed)) return [{ id, attachment: undefined, position: placed.position, rotation: [0, placed.yaw, 0] as Vec3, scale: [scale, scale, scale] as Vec3 }];
        const local = scale / scaleOf(placed.container);
        return [{ id, attachment: { nodeId: placed.container, ...(placed.anchor ? { anchor: placed.anchor } : {}) }, position: placed.offset, rotation: [0, placed.turn * Math.PI / 180, 0] as Vec3, scale: [local, local, local] as Vec3 }];
      }));
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  state.register(instances);
  return state;
}
