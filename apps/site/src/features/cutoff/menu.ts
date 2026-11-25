import { CARRIERS, DEPARTMENTS, FACINGS_PER_GONDOLA, GOODS_LABELS, LOCATIONS, SKUS, location, rackGoods, skuGoods, type EcommerceSnapshot, type GoodsType, type LocationId } from '../ecommerce/model';
import type { ActorRef, Move, MoveKind, MoveOption, MoveRefusal } from '../ecommerce/simulation';
import { QUEUE_LIMIT, type ActorChoices, type ActorView, type CarrierStatus, type ShiftEvent } from './rules';

/** The color of each type of goods: pallet loads, rack uprights and the legend use it. */
export const GOODS_COLORS: Readonly<Record<GoodsType, string>> = { kitchen: '#e08a2e', home: '#8a64c4', outdoor: '#3f9a57', toys: '#d6453d', tech: '#2f7fc4', sport: '#159a9c' };
export const GOODS_TYPES = Object.keys(GOODS_LABELS) as GoodsType[];
const RACKS = LOCATIONS.filter(item => item.kind === 'rack');

/** Free and total rack positions of each type of goods, for the legend. */
export function rackRoom(snapshot: EcommerceSnapshot): { goods: GoodsType; label: string; color: string; free: number; total: number }[] {
  return GOODS_TYPES.map(goods => {
    const racks = RACKS.filter(rack => rackGoods(rack.id) === goods), total = racks.reduce((sum, rack) => sum + rack.capacity, 0);
    return { goods, label: GOODS_LABELS[goods], color: GOODS_COLORS[goods], free: total - racks.reduce((sum, rack) => sum + snapshot.occupancy[rack.id], 0), total };
  });
}

/** What a menu entry does, by move kind. */
const VERBS: Readonly<Record<MoveKind, string>> = {
  unload: 'Unload the truck', 'put-away': 'Put away', replenish: 'Bring behind its pick face', clear: 'Take the empty pallet to the stack',
  decant: 'Fill the lanes from the pallet', restock: 'Restock the shop', ship: 'Load onto the truck',
};
/** One line of a context menu: what one actor can do with the subject, with its targets best first and the refused ones. */
export interface MenuEntry { key: string; actor: ActorRef; kind: MoveKind; label: string; options: readonly MoveOption[]; refused: readonly MoveRefusal[]; }

/**
 * The entries of a material's context menu: one per actor and kind of move. With an active actor that can do something with
 * the subject, only its entries; otherwise every actor's, each named by its actor.
 */
export function menuEntries(choices: readonly ActorChoices[], active?: string | null): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const choice of choices) {
    const kinds = [...new Set([...choice.options.map(option => option.move.kind), ...choice.refused.map(item => item.kind)])];
    for (const kind of kinds) entries.push({
      key: `${choice.actor.id}:${kind}`, actor: choice.actor, kind, label: VERBS[kind],
      options: choice.options.filter(option => option.move.kind === kind), refused: choice.refused.filter(item => item.kind === kind),
    });
  }
  const own = active ? entries.filter(entry => entry.actor.id === active) : [];
  return own.length ? own : entries;
}
/** Reserve pallets a pick face's menu offers to bring, at most. */
const FACE_PALLETS = 3;
/** The subjects whose moves a node's menu lists: the node, the pallets in a rack, or a pick face and reserve pallets of its SKUs. */
export function menuSubjects(node: string, snapshot: EcommerceSnapshot): string[] {
  const [prefix, name] = node.split(':');
  if (prefix === 'rack') return snapshot.units.filter(unit => unit.at === `Rack ${name}` && unit.sku).map(unit => unit.id);
  if (prefix === 'flow' || prefix === 'shelf') return [node, ...snapshot.units.filter(unit => unit.at.startsWith('Rack ') && unit.sku && SKUS[unit.sku].pick === name).slice(0, FACE_PALLETS).map(unit => unit.id)];
  return [node];
}
/**
 * The entries of a node's menu with the subject each belongs to. The node lists all its entries; the reserve pallets a rack
 * or pick face adds list only bringing them to their pick face, because a pallet already on its way to a face would repeat
 * the face's own decant, clear and restock.
 */
export function nodeEntries(node: string, snapshot: EcommerceSnapshot, options: (subject: string) => readonly ActorChoices[], active?: string | null): { subject: string; entry: MenuEntry }[] {
  return menuSubjects(node, snapshot).flatMap(subject => menuEntries(options(subject), active).filter(entry => subject === node || entry.kind === 'replenish').map(entry => ({ subject, entry })));
}
/** Whether an entry needs a target submenu: more than one target, or targets that may not be used and should be explained. */
export const needsTargets = (entry: MenuEntry) => entry.options.length !== 1 || entry.refused.length > 0;

/** The scene node of a pick face. */
export const faceNode = (face: LocationId) => `${location(face).kind === 'shelf' ? 'shelf' : 'flow'}:${face}`;
/** The scene nodes a move takes its material to, which "Choose in the scene…" lights up; empty when the target is implied. */
export function targetNodes(move: Move): string[] {
  switch (move.kind) {
    case 'put-away': return [`rack:${move.rack}`];
    case 'restock': return Array.from({ length: DEPARTMENTS.find(item => item.id === move.department)!.gondolas }, (_, i) => `gondola:${move.department}:${i}`);
    case 'clear': case 'decant': return [faceNode(move.face)];
    case 'ship': return ['dock:D3'];
    default: return [];
  }
}
/** Whether "Choose in the scene…" helps: at least two targets that stand in the scene. */
export const choosesInScene = (entry: MenuEntry) => new Set(entry.options.flatMap(option => targetNodes(option.move))).size > 1;

/** The name a refusal's target starts with for a scene node: the rack ID or the department. */
function targetName(nodeId: string): string | undefined {
  const [prefix, name] = nodeId.split(':');
  if (prefix === 'rack') return name;
  if (prefix === 'gondola') return DEPARTMENTS.find(item => item.id === name)?.label;
  return undefined;
}
/** The nodes a click stands for: the node, its containers and, for a pallet in a rack, the rack. A light marker stands for its node. */
export function clickedNodes(nodeId: string, ancestors: readonly string[], snapshot: EcommerceSnapshot): string[] {
  const id = nodeId.startsWith('target:') ? nodeId.slice('target:'.length) : nodeId, rack = snapshot.units.find(unit => unit.id === id)?.at.match(/^Rack (R\d+)$/)?.[1];
  return [id, ...ancestors, ...(rack ? [`rack:${rack}`] : [])];
}
/** What a click on scene nodes means while choosing a target in the scene: a move to confirm, a refused target, or nothing. */
export function pickTarget(entry: MenuEntry, nodes: readonly string[]): { option: MoveOption; node: string } | { refused: MoveRefusal } | undefined {
  for (const node of nodes) {
    const option = entry.options.find(item => targetNodes(item.move).includes(node));
    if (option) return { option, node };
  }
  for (const node of nodes) {
    const name = targetName(node), refused = name ? entry.refused.find(item => item.target.split(' · ')[0] === name) : undefined;
    if (refused) return { refused };
  }
  return undefined;
}
/** Light markers for "Choose in the scene…": one per node that takes a valid target, with the target's name. */
export function targetMarks(entry: MenuEntry): { nodeId: string; label: string }[] {
  const marks = new Map<string, string>();
  for (const option of entry.options) for (const node of targetNodes(option.move)) if (!marks.has(node)) marks.set(node, option.target);
  return [...marks].map(([nodeId, label]) => ({ nodeId, label }));
}

/** The scene node an event concerns, for its menu and its marker. */
export function eventNode(snapshot: EcommerceSnapshot, event: ShiftEvent): string | undefined {
  switch (event.kind) {
    case 'robot-breakdown': return event.subject;
    case 'late-truck': return `dock:${event.subject}`;
    case 'store-rush': return 'pin:shop';
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
