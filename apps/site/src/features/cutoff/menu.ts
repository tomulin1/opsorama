import { CARRIERS, DEPARTMENTS, GOODS_COLORS, GOODS_LABELS, LOCATIONS, OUTLETS, SKUS, cageOutlet, location, type EcommerceSnapshot, type GoodsType, type LocationId } from '../ecommerce/model';
import type { Move, MoveOption, MoveRefusal } from '../ecommerce/simulation';
import type { NodeHighlight } from '@opsorama/three';
import { CHANNELS, type ActorChoices } from './rules';

/** The color of each type of goods, shared with the e-commerce scene and the shop's goods. */
export { GOODS_COLORS };
export const GOODS_TYPES = Object.keys(GOODS_LABELS) as GoodsType[];
const RACKS = LOCATIONS.filter(item => item.kind === 'rack');

/** Free and total positions of the reserve racks; any pallet may take any of them. */
export function rackRoom(snapshot: EcommerceSnapshot): { free: number; total: number } {
  const total = RACKS.reduce((sum, rack) => sum + rack.capacity, 0);
  return { free: total - RACKS.reduce((sum, rack) => sum + snapshot.occupancy[rack.id], 0), total };
}
/** The colors of the pallets' cartons, one per type of goods, for the legend. */
export const goodsLegend = (): { goods: GoodsType; label: string; color: string }[] => GOODS_TYPES.map(goods => ({ goods, label: GOODS_LABELS[goods], color: GOODS_COLORS[goods] }));

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
  if (prefix === 'cage') { const outlet = cageOutlet(name); return outlet ? `${outlet.label} cage` : `Roll cage ${name}`; }
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
  const cages = [...CARRIERS.flatMap(item => item.cages), ...OUTLETS.map(item => item.cage)].map(cage => `cage:${cage}`);
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
 * The scene nodes a move takes its material to, lit once its source is chosen: a rack, the staging lane, the pick face behind
 * which a pallet goes, the pick face whose lanes fill, the empty-pallet stack, a department's gondolas, the outbound dock, or the
 * outlet of an outlet cage (the counter, the lockers or the bike).
 */
export function targetNodes(move: Move, snapshot?: EcommerceSnapshot): string[] {
  switch (move.kind) {
    case 'unload': return [STAGING_TARGET];
    case 'put-away': return [`rack:${move.rack}`];
    case 'replenish': { const sku = snapshot?.units.find(unit => unit.id === move.pallet)?.sku; return sku ? [faceNode(SKUS[sku].pick)] : []; }
    case 'clear': return ['pallet-stack'];
    case 'decant': return [faceNode(move.face)];
    case 'restock': return Array.from({ length: DEPARTMENTS.find(item => item.id === move.department)!.gondolas }, (_, i) => `gondola:${move.department}:${i}`);
    case 'ship': { const outlet = cageOutlet(move.cage); return [outlet ? CHANNELS.find(item => item.id === outlet.id)!.node : 'dock:D3']; }
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
/** The scene node a lit point stands over: its own node, or for the staging lane the receiving check beside it. */
export const markAnchor = (key: string) => key === STAGING_TARGET ? 'qa:station' : key;
/** Light marks for the sources of an actor. */
export const sourceMarks = (sources: readonly Source[]): LitMark[] => sources.map(source => ({ key: source.node, kind: 'source', label: source.label }));
/** Light marks for the targets of a chosen source: one per node that takes a valid target, with the target's name. */
export function targetMarks(source: Pick<Source, 'options'>, snapshot?: EcommerceSnapshot): LitMark[] {
  const marks = new Map<string, string>();
  for (const option of source.options) for (const node of targetNodes(option.move, snapshot)) if (!marks.has(node)) marks.set(node, option.target);
  return [...marks].map(([key, label]) => ({ key, kind: 'target', label }));
}

/** Glow of what the commanded actor can take, a cyan light that stands apart from every goods color, and color of the ghosts and tinted targets where it can bring it. */
export const SOURCE_TINT = '#3fc8ff', TARGET_TINT = '#1f9d63';
/** The scene nodes a source tints: its node, and for a dock the truck standing at it. */
const tintedNodes = (node: string) => node.startsWith('dock:') ? [node, `truck:${node.slice(5)}`] : [node];
/** Tints while a source is chosen: every source the actor can take. */
export const sourceTints = (sources: readonly Pick<Source, 'node'>[]): NodeHighlight[] => sources.flatMap(source => tintedNodes(source.node)).map(node => ({ node, color: SOURCE_TINT }));
/**
 * Tints once a source is taken: the source itself, and the target nodes of moves that show no ghost because they would wait
 * (a full pick face, a busy spot). The other targets show ghosts of the material instead.
 */
export function targetTints(source: Pick<Source, 'node' | 'options'>, snapshot?: EcommerceSnapshot): NodeHighlight[] {
  const waiting = new Set(source.options.filter(option => !option.previews?.length).flatMap(option => targetNodes(option.move, snapshot)).filter(node => node !== STAGING_TARGET));
  return [...tintedNodes(source.node).map(node => ({ node, color: SOURCE_TINT })), ...[...waiting].map(node => ({ node, color: TARGET_TINT }))];
}
