import { CARRIERS, DEPARTMENTS, FACINGS_PER_GONDOLA, GOODS_COLORS, GOODS_LABELS, LOCATIONS, SKUS, location, rackGoods, skuGoods, type EcommerceSnapshot, type GoodsType, type LocationId } from '../ecommerce/model';
import type { Move, MoveOption, MoveRefusal } from '../ecommerce/simulation';
import { QUEUE_LIMIT, type ActorChoices, type ActorView, type CarrierStatus, type ShiftEvent } from './rules';

/** The color of each type of goods, shared with the e-commerce scene and the shop's goods. */
export { GOODS_COLORS };
export const GOODS_TYPES = Object.keys(GOODS_LABELS) as GoodsType[];
const RACKS = LOCATIONS.filter(item => item.kind === 'rack');

/** Free and total rack positions of each type of goods, for the legend. */
export function rackRoom(snapshot: EcommerceSnapshot): { goods: GoodsType; label: string; color: string; free: number; total: number }[] {
  return GOODS_TYPES.map(goods => {
    const racks = RACKS.filter(rack => rackGoods(rack.id) === goods), total = racks.reduce((sum, rack) => sum + rack.capacity, 0);
    return { goods, label: GOODS_LABELS[goods], color: GOODS_COLORS[goods], free: total - racks.reduce((sum, rack) => sum + snapshot.occupancy[rack.id], 0), total };
  });
}

/** The scene node of a pick face. */
export const faceNode = (face: LocationId) => `${location(face).kind === 'shelf' ? 'shelf' : 'flow'}:${face}`;
/** The lit point for the staging lane, which has no scene node of its own: the target of unloading. */
export const STAGING_TARGET = 'staging';

/**
 * Something one of the crew can take, lit after a click on that actor: a dock with a truck to unload, a pallet, a pick face or a
 * roll cage, with the moves the actor can make with it (targets best first) and the targets it may not use.
 */
export interface Source { node: string; label: string; options: readonly MoveOption[]; refused: readonly MoveRefusal[]; }

const palletNumber = (id: string) => id.split(':')[1];
/** A short name for a source in the actor's menu, e.g. "Pallet 1038 · TOY-208 · staging". */
function sourceLabel(node: string, snapshot: EcommerceSnapshot, options: readonly MoveOption[]): string {
  const [prefix, name] = node.split(':');
  if (prefix === 'dock') { const dock = snapshot.docks.find(item => item.id === name); return `Dock ${name}${dock?.pallets ? ` · ${dock.pallets.total - dock.pallets.done} pallets left` : ''}`; }
  if (prefix === 'cage') return `Roll cage ${name}`;
  if (prefix === 'pallet') {
    const unit = snapshot.units.find(item => item.id === node), kind = options[0]?.move.kind;
    const where = kind === 'put-away' ? 'staging' : kind === 'replenish' ? unit?.at.replace('Rack ', 'rack ') : kind === 'clear' ? 'empty, behind its face' : 'behind its face';
    return `Pallet ${palletNumber(node)}${unit?.sku ? ` · ${unit.sku}` : ''} · ${where}`;
  }
  return `${name} lanes`;
}

/**
 * What one of the crew can take now: every subject (inbound docks, pallets, pick faces, roll
 * cages) with at least one possible move for the actor, including moves that would wait. A move that two subjects offer (a
 * decant from the pallet behind a face and from the face) appears once, under the first, and material with a queued command
 * of the same kind (`queued`) is left out. The shelf filler takes from pick faces, so for it faces come before pallets.
 */
/** What a move takes, whatever its target: the same kind from the same truck, pallet, face, department or cage. */
const takes = (move: Move) => {
  switch (move.kind) {
    case 'unload': return `unload:${move.dock}`;
    case 'put-away': case 'replenish': return `${move.kind}:${move.pallet}`;
    case 'clear': case 'decant': return `${move.kind}:${move.face}`;
    case 'restock': return `restock:${move.department}:${move.source}`;
    case 'ship': return `ship:${move.cage}`;
  }
};
export function actorSources(actor: string, snapshot: EcommerceSnapshot, options: (subject: string, actor: string) => readonly ActorChoices[], queued: readonly Move[] = []): Source[] {
  const docks = snapshot.docks.filter(dock => dock.direction === 'inbound').map(dock => `dock:${dock.id}`);
  const pallets = snapshot.units.filter(unit => unit.kind === 'pallet').map(unit => unit.id);
  const faces = LOCATIONS.filter(item => item.kind !== 'rack').map(item => faceNode(item.id));
  const cages = CARRIERS.flatMap(item => item.cages).map(cage => `cage:${cage}`);
  const subjects = actor === 'shelf-filler' ? [...faces, ...pallets] : [...docks, ...pallets, ...faces, ...cages];
  // Material that already has a command of the same kind (in any queue) is not offered again.
  const busy = new Set(queued.map(takes)), seen = new Set<string>(), sources: Source[] = [];
  for (const node of subjects) {
    const [choice] = options(node, actor);
    const fresh = choice?.options.filter(option => !seen.has(JSON.stringify(option.move)) && !busy.has(takes(option.move))) ?? [];
    if (!fresh.length) continue;
    for (const option of fresh) seen.add(JSON.stringify(option.move));
    sources.push({ node, label: sourceLabel(node, snapshot, fresh), options: fresh, refused: choice!.refused });
  }
  // The menu lists the most useful first (the scene lights them all): pallets to put away, then reserve pallets of SKUs below
  // their minimum on the pick face, then the rest in scene order.
  const low = new Set(snapshot.alerts.map(alert => alert.sku));
  const rank = (source: Source) => {
    const move = source.options[0].move;
    if (move.kind === 'put-away') return 0;
    if (move.kind === 'replenish') return low.has(snapshot.units.find(unit => unit.id === move.pallet)?.sku ?? '') ? 1 : 2;
    return 2;
  };
  return sources.map((source, index) => ({ source, index })).sort((a, b) => rank(a.source) - rank(b.source) || a.index - b.index).map(item => item.source);
}

/**
 * The sources an actor's menu lists: like `actorSources`, but one reserve pallet per SKU to replenish (the first, which the
 * ranking puts the SKUs below their minimum ahead of), so a handful of buttons covers the choices. The scene lights them all.
 */
export function menuSources(sources: readonly Source[], snapshot: EcommerceSnapshot): Source[] {
  const seen = new Set<string>();
  return sources.filter(source => {
    const move = source.options[0].move;
    if (move.kind !== 'replenish') return true;
    const sku = snapshot.units.find(unit => unit.id === move.pallet)?.sku ?? source.node;
    if (seen.has(sku)) return false;
    seen.add(sku); return true;
  });
}

/**
 * The scene nodes a move takes its material to, lit once its source is chosen: a rack, the staging lane, the pick face behind
 * which a pallet goes, the pick face whose lanes fill, the empty-pallet stack, a department's gondolas or the outbound dock.
 */
export function targetNodes(move: Move, snapshot?: EcommerceSnapshot): string[] {
  switch (move.kind) {
    case 'unload': return [STAGING_TARGET];
    case 'put-away': return [`rack:${move.rack}`];
    case 'replenish': { const sku = snapshot?.units.find(unit => unit.id === move.pallet)?.sku; return sku ? [faceNode(SKUS[sku].pick)] : []; }
    case 'clear': return ['pallet-stack'];
    case 'decant': return [faceNode(move.face)];
    case 'restock': return Array.from({ length: DEPARTMENTS.find(item => item.id === move.department)!.gondolas }, (_, i) => `gondola:${move.department}:${i}`);
    case 'ship': return ['dock:D3'];
  }
}

/** The name a refusal's target starts with for a scene node: the rack ID or the department. */
function targetName(nodeId: string): string | undefined {
  const [prefix, name] = nodeId.split(':');
  if (prefix === 'rack') return name;
  if (prefix === 'gondola') return DEPARTMENTS.find(item => item.id === name)?.label;
  return undefined;
}
/** The nodes a click stands for: the node, its containers and, for a pallet in a rack, the rack. A light marker stands for its node. */
export function clickedNodes(nodeId: string, ancestors: readonly string[], snapshot: EcommerceSnapshot): string[] {
  const id = nodeId.replace(/^(target|source):/, ''), rack = snapshot.units.find(unit => unit.id === id)?.at.match(/^Rack (R\d+)$/)?.[1];
  return [id, ...ancestors, ...(rack ? [`rack:${rack}`] : [])];
}
/** What a click on scene nodes means once a source is chosen: a move to queue, a refused target with its reason, or nothing. */
export function pickTarget(source: Pick<Source, 'options' | 'refused'>, nodes: readonly string[], snapshot?: EcommerceSnapshot): { option: MoveOption; node: string } | { refused: MoveRefusal } | undefined {
  for (const node of nodes) {
    const option = source.options.find(item => targetNodes(item.move, snapshot).includes(node));
    if (option) return { option, node };
  }
  for (const node of nodes) {
    const name = targetName(node), refused = name ? source.refused.find(item => item.target.split(' · ')[0] === name) : undefined;
    if (refused) return { refused };
  }
  return undefined;
}
/** A lit point: a source the actor can take or a target for the chosen source, over its node (or the staging lane). */
export interface LitMark { key: string; kind: 'source' | 'target'; label: string; }
/** Light marks for the sources of an actor. */
export const sourceMarks = (sources: readonly Source[]): LitMark[] => sources.map(source => ({ key: source.node, kind: 'source', label: source.label }));
/** Light marks for the targets of a chosen source: one per node that takes a valid target, with the target's name. */
export function targetMarks(source: Pick<Source, 'options'>, snapshot?: EcommerceSnapshot): LitMark[] {
  const marks = new Map<string, string>();
  for (const option of source.options) for (const node of targetNodes(option.move, snapshot)) if (!marks.has(node)) marks.set(node, option.target);
  return [...marks].map(([key, label]) => ({ key, kind: 'target', label }));
}

/** The scene node an event concerns, for its menu and its marker. */
export function eventNode(snapshot: EcommerceSnapshot, event: ShiftEvent): string | undefined {
  switch (event.kind) {
    case 'robot-breakdown': return event.subject;
    case 'late-truck': return `dock:${event.subject}`;
    case 'store-rush': return 'checkout:C2';
    case 'vip-order': return 'dock:D3';
    case 'short-pick': {
      const order = snapshot.orders.find(item => item.id === event.subject), short = order?.lines.find(line => snapshot.alerts.some(alert => alert.sku === line.sku)) ?? order?.lines[0];
      return short ? faceNode(SKUS[short.sku].pick) : undefined;
    }
  }
}

/** The short detail of a selected object for the right panel. */
export interface Detail { title: string; eyebrow: string; color?: string; lines: { label: string; value: string }[]; }
export interface DetailContext {
  snapshot: EcommerceSnapshot; actors: readonly ActorView[]; carriers: readonly CarrierStatus[];
  /** The moves every actor can make with the node. */
  choices: readonly ActorChoices[];
  /** The `count` of a scene node: cartons on a pallet, parcels in a cage. */
  count(nodeId: string): number | undefined;
}
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
/** A summary of where a material may go: the best target and how many more, or why it may go nowhere. */
function mayGo(choices: readonly ActorChoices[]): string {
  const options = choices.flatMap(choice => choice.options), refused = choices.flatMap(choice => choice.refused);
  if (options.length) return `${options[0].target}${options.length > 1 ? ` (+${options.length - 1} more)` : ''}`;
  return refused[0]?.reason ?? 'Nowhere now';
}
const kinds = (choices: readonly ActorChoices[]) => new Set(choices.flatMap(choice => [...choice.options.map(option => option.move.kind), ...choice.refused.map(item => item.kind)]));

/** The detail of a scene node, or null for nodes the game has nothing to say about. */
export function detailOf(nodeId: string, context: DetailContext): Detail | null {
  const { snapshot } = context, [prefix, name] = nodeId.split(':');
  const actor = context.actors.find(item => item.id === nodeId);
  if (actor) return {
    title: actor.label, eyebrow: 'CREW', lines: [
      { label: 'Now', value: actor.waiting ?? actor.task ?? (actor.assist ? 'Works by itself' : 'Idle') },
      { label: 'Commands', value: `${actor.queue.length} of ${QUEUE_LIMIT}` },
      { label: 'Works by itself', value: actor.assist ? 'On, without a command' : 'Off' },
    ],
  };
  if (prefix === 'pallet') {
    const unit = snapshot.units.find(item => item.id === nodeId);
    if (!unit?.sku) return { title: `Pallet ${name}`, eyebrow: 'PALLET', lines: [{ label: 'Load', value: 'Empty' }] };
    const goods = skuGoods(unit.sku), found = kinds(context.choices), cartons = context.count(nodeId);
    const where = found.has('put-away') ? 'In staging' : found.has('replenish') ? unit.at : found.has('decant') || found.has('clear') ? `Behind ${SKUS[unit.sku].pick}` : unit.at;
    return {
      title: `Pallet ${name}`, eyebrow: 'PALLET', color: GOODS_COLORS[goods], lines: [
        { label: 'SKU', value: `${unit.sku} · ${SKUS[unit.sku].name}` }, { label: 'Goods', value: GOODS_LABELS[goods] },
        ...(cartons !== undefined ? [{ label: 'Cartons', value: String(cartons) }] : []), { label: 'Stands', value: where }, { label: 'May go', value: mayGo(context.choices) },
      ],
    };
  }
  if (prefix === 'dock') {
    const dock = snapshot.docks.find(item => item.id === name);
    if (!dock) return null;
    const carrier = context.carriers.find(item => item.name === dock.partner);
    return {
      title: `Dock ${dock.id}`, eyebrow: dock.direction === 'inbound' ? 'INBOUND DOCK' : 'OUTBOUND DOCK', lines: [
        { label: dock.direction === 'inbound' ? 'Supplier' : 'Carrier', value: dock.partner }, { label: 'Reference', value: dock.reference }, { label: 'Status', value: dock.status },
        ...(dock.pallets ? [{ label: 'Pallets', value: `${dock.pallets.total - dock.pallets.done} of ${dock.pallets.total} left` }] : []),
        ...(carrier ? [{ label: 'Cut-off', value: `${carrier.cutoff}${carrier.remaining !== null ? ` · ${Math.ceil(carrier.remaining)} min left` : ''} · ${plural(carrier.open, 'order')} in the building` }] : []),
      ],
    };
  }
  if (prefix === 'rack') {
    const rack = location(name as LocationId), goods = rackGoods(rack.id), held = snapshot.units.filter(unit => unit.at === `Rack ${rack.id}` && unit.sku);
    return {
      title: rack.id, eyebrow: 'RESERVE RACK', color: GOODS_COLORS[goods], lines: [
        { label: 'Goods', value: `${GOODS_LABELS[goods]} only` }, { label: 'Pallets', value: `${snapshot.occupancy[rack.id]} of ${rack.capacity} positions` },
        ...(held.length ? [{ label: 'Holds', value: [...new Set(held.map(unit => unit.sku!))].join(', ') }] : []),
      ],
    };
  }
  if ((prefix === 'flow' || prefix === 'shelf') && LOCATIONS.some(item => item.id === name)) {
    const face = location(name as LocationId), skus = Object.entries(SKUS).filter(([, sku]) => sku.pick === face.id).map(([id]) => id), low = snapshot.alerts.filter(alert => skus.includes(alert.sku));
    const pallet = context.choices.flatMap(choice => [...choice.options.filter(option => option.move.kind === 'decant').map(option => option.waits ?? 'Stands behind it'), ...choice.refused.filter(item => item.kind === 'decant').map(item => item.reason)])[0];
    return {
      title: face.id, eyebrow: 'PICK FACE', lines: [
        { label: 'SKUs', value: skus.join(', ') }, { label: face.kind === 'flow' ? 'Lanes' : 'Bins', value: `${snapshot.occupancy[face.id]} of ${face.capacity} filled` },
        { label: 'Below minimum', value: low.length ? low.map(alert => `${alert.sku} ${alert.onHand}/${alert.min}`).join(', ') : 'None' },
        ...(pallet ? [{ label: 'Pallet', value: pallet }] : []),
      ],
    };
  }
  if (prefix === 'gondola') {
    const department = DEPARTMENTS.find(item => item.id === name);
    if (!department) return null;
    const source = context.choices.flatMap(choice => choice.options).map(option => option.target);
    return {
      title: department.label, eyebrow: 'SHOP DEPARTMENT', lines: [
        { label: 'Facings', value: `${snapshot.shop.facings[department.id]} of ${department.gondolas * FACINGS_PER_GONDOLA}` },
        { label: 'Restock', value: source.length ? source.join(' · ') : mayGo(context.choices) },
      ],
    };
  }
  if (prefix === 'cage') {
    const owner = CARRIERS.find(item => item.cages.includes(name));
    if (!owner) return null;
    const status = context.carriers.find(item => item.carrier === owner.id);
    return {
      title: `Roll cage ${name}`, eyebrow: 'DISPATCH', lines: [
        { label: 'Carrier', value: owner.name }, { label: 'Parcels', value: String(context.count(nodeId) ?? 0) },
        { label: 'Truck', value: status?.loading ? 'Loading at D3' : 'Not docked' },
        ...(status ? [{ label: 'Cut-off', value: `${status.cutoff}${status.remaining !== null ? ` · ${Math.ceil(status.remaining)} min left` : ''}` }] : []),
      ],
    };
  }
  return null;
}
