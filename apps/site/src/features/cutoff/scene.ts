import type { LightingPreset, MarkerNode, MarkerTone, SceneNode, TextNode } from '@opsorama/core';
import { DEPARTMENTS, GOODS_COLORS, faceGoods, minutesOf, rackGoods, skuGoods, type DepartmentId, type EcommerceSnapshot, type LocationId } from '../ecommerce/model';
import { DOCK_WAITING_NOTE, type Move } from '../ecommerce/simulation';
import { eventNode } from './menu';
import type { ActorView, CarrierStatus, ShiftDecisions, ShiftEvent, ShiftGame, ShiftLevel } from './rules';

const palletNumber = (pallet: string) => pallet.split(':')[1];
const departmentLabel = (id: string) => DEPARTMENTS.find(item => item.id === id)?.label ?? id;
/** A command in words, for the menus and the shift log. */
export function moveLabel(move: Move): string {
  switch (move.kind) {
    case 'unload': return `Unload the truck at ${move.dock}`;
    case 'put-away': return `Put pallet ${palletNumber(move.pallet)} away to ${move.rack}${move.level === undefined ? '' : ` level ${move.level + 1}`}`;
    case 'replenish': return `Bring pallet ${palletNumber(move.pallet)} behind its pick face`;
    case 'clear': return `Take the empty pallet from ${move.face} to the stack`;
    case 'decant': return `Fill ${move.face} from its pallet`;
    case 'restock': return move.source === 'transfer' ? `Take the shop transfer to ${departmentLabel(move.department)}` : `Restock ${departmentLabel(move.department)}`;
    case 'ship': return `Load ${move.cage} onto the truck`;
  }
}

/** Time of day from the existing presets: studio light by day, dusk from 16:00 and night light on the night shift. */
export function lightingAt(level: ShiftLevel, clock: string): LightingPreset {
  if (level.scenario === 'night') return 'night';
  return minutesOf(clock) >= DUSK ? 'dusk' : 'studio';
}
const DUSK = 16 * 60;

/** What the markers read from the game. */
export interface ProblemState { snapshot: EcommerceSnapshot; events: readonly ShiftEvent[]; decisions: ShiftDecisions; carriers: readonly CarrierStatus[]; actors: readonly ActorView[]; time: number; }
/** Height above the carrying node's origin where a marker or floating text starts, in metres. */
const MARKER_HEIGHT = 2.6, FLOAT_HEIGHT = 2, FLOAT_RISE = .9;
/** Customers queuing at one lane when it gets a warning; the game's walk-outs start here. */
const LONG_QUEUE = 3;
/** Minutes before a cut-off when its open orders get a critical marker. */
const CUTOFF_WARNING = 30;

/**
 * Scene markers for the problems of the moment, attached to the object they concern: open events, stopped machines,
 * a near cut-off, empty departments, long queues, trucks waiting to unload and actors waiting with a command. One marker per
 * object, the most urgent first.
 */
export function problemMarkers(state: ProblemState, present: ReadonlySet<string>): MarkerNode[] {
  const markers = new Map<string, MarkerNode>();
  const add = (nodeId: string, tone: MarkerTone, eyebrow: string, label: string, detail?: string) => {
    if (!present.has(nodeId) || markers.has(nodeId)) return;
    markers.set(nodeId, { id: `marker:${nodeId}`, kind: 'marker', attachment: { nodeId }, position: [0, MARKER_HEIGHT, 0], tone, eyebrow, label, ...(detail ? { detail } : {}) });
  };
  const { snapshot } = state;
  for (const event of state.events) {
    const node = eventNode(snapshot, event);
    if (node) add(node, event.kind === 'robot-breakdown' ? 'critical' : event.kind === 'vip-order' ? 'info' : 'warning', 'EVENT', event.title, `${Math.max(0, Math.ceil(event.deadline - state.time))} min to decide`);
  }
  for (const [machine, until] of Object.entries(state.decisions.stopped)) add(machine, 'critical', 'STOPPED', 'Machine stopped', Number.isFinite(until) ? `Back in ${Math.ceil(until - state.time)} min` : 'Waiting for your decision');
  const cutoff = state.carriers.filter(item => item.remaining !== null && item.remaining <= CUTOFF_WARNING && item.open).sort((a, b) => a.remaining! - b.remaining!)[0];
  if (cutoff) add('dock:D3', 'critical', 'CUT-OFF', `${cutoff.name} ${cutoff.cutoff}`, `${cutoff.open} ${cutoff.open === 1 ? 'order' : 'orders'} still in the building · ${Math.ceil(cutoff.remaining!)} min left`);
  if (snapshot.shopOpen) {
    for (const department of DEPARTMENTS) if (snapshot.shop.facings[department.id] === 0) add(`gondola:${department.id}:0`, 'critical', 'SHELVES', `${department.label} is empty`);
    for (const lane of snapshot.shop.checkouts) if (lane.open && lane.queue >= LONG_QUEUE) add(`checkout:${lane.id}`, 'warning', 'QUEUE', `Checkout ${lane.id.slice(1)}: ${lane.queue} waiting`, 'Customers leave a queue this long');
  }
  for (const dock of snapshot.docks) if (dock.status === 'expected' && dock.note === DOCK_WAITING_NOTE) add(`dock:${dock.id}`, 'info', 'DOCK', `${dock.reference} waits to unload`, `Command the forklift to unload dock ${dock.id}`);
  for (const actor of state.actors) if (actor.waiting) add(actor.id, 'info', 'WAITS', actor.label, actor.waiting);
  return [...markers.values()];
}

/** A point change shown over the scene: it rises from its object and is removed after `FLOAT_SECONDS` of play. */
export interface Floating { id: number; points: number; at: string; start: number; }
/** Seconds of play a floating point change stays; removing it stands in for a fade. */
export const FLOAT_SECONDS = 2.5;
/** Billboard text nodes for the point changes still showing, rising over their objects. */
export function floatingNodes(floats: readonly Floating[], present: ReadonlySet<string>, time: number): TextNode[] {
  return floats.filter(item => present.has(item.at) && time - item.start < FLOAT_SECONDS).map(item => ({
    id: `float:${item.id}`, kind: 'text', text: item.points > 0 ? `+${item.points}` : String(item.points), billboard: true, size: .8,
    color: item.points > 0 ? '#1f8a5b' : '#c43650', attachment: { nodeId: item.at }, position: [0, FLOAT_HEIGHT + FLOAT_RISE * Math.max(0, time - item.start) / FLOAT_SECONDS, 0],
  }));
}

/**
 * The scene as the game shows it, colored by type of goods (`GOODS_COLORS`, the tone of each type's item in the shop) while the
 * dashboard keeps its neutral colors: a pallet's cartons take its SKU's color (`color`), a rack's uprights the color of the type
 * it holds (`materials.accent`), a pick face's cartons the color of its goods (`materials.surface`) and a gondola, with its sign,
 * the color of its department. The area floors and pins take no clicks, so a click either hits material or clears the menu.
 */
export function playable(nodes: readonly SceneNode[], snapshot: EcommerceSnapshot): SceneNode[] {
  const pallets = new Map(snapshot.units.filter(unit => unit.kind === 'pallet' && unit.sku).map(unit => [unit.id, GOODS_COLORS[skuGoods(unit.sku!)]]));
  return nodes.map(node => {
    if (node.id.startsWith('area:') || node.id.startsWith('pin:')) return { ...node, selectable: false };
    if (node.kind !== 'asset' || !node.entityId && !pallets.has(node.id)) return node;
    const pallet = pallets.get(node.id);
    if (pallet) return { ...node, color: pallet };
    if (node.asset === 'pallet-rack') return { ...node, materials: { ...node.materials, accent: GOODS_COLORS[rackGoods(node.entityId as LocationId)] } };
    if (node.asset === 'carton-flow-rack') return { ...node, materials: { ...node.materials, surface: GOODS_COLORS[faceGoods(node.entityId as LocationId)] } };
    if (node.asset === 'store-shelving') {
      const color = GOODS_COLORS[node.entityId as DepartmentId], label = node.options?.surfaceLabel;
      return { ...node, color, ...(label?.kind === 'text' ? { options: { ...node.options, surfaceLabel: { ...label, background: color } } } : {}) };
    }
    return node;
  });
}

/** A target lit by "Choose in the scene…": the node and the target's name. */
export interface TargetMark { nodeId: string; label: string; }
/** Markers over the targets the player may choose, which a click picks like their node. */
export function targetMarkers(targets: readonly TargetMark[], present: ReadonlySet<string>): MarkerNode[] {
  return targets.filter(item => present.has(item.nodeId)).map(item => ({ id: `target:${item.nodeId}`, kind: 'marker', attachment: { nodeId: item.nodeId }, position: [0, MARKER_HEIGHT, 0], tone: 'success', eyebrow: 'TARGET', label: item.label, detail: 'Click to put it here' }));
}

/** Most point changes floating at once; older ones give way. */
const MAX_FLOATS = 12;
/**
 * The scene of a game: its nodes colored by type of goods, with problem markers, floating point changes and, while the player
 * chooses a target in the scene, a marker over every valid target instead of the problem markers.
 */
export function playNodes(game: ShiftGame, floats: readonly Floating[], targets: readonly TargetMark[] = []): SceneNode[] {
  const snapshot = game.snapshot(), nodes = playable(game.nodes(), snapshot), present = new Set(nodes.map(node => node.id));
  const markers = targets.length ? targetMarkers(targets, present) : problemMarkers({ snapshot, events: game.events(), decisions: game.decisions(), carriers: game.carriers(), actors: game.actors(), time: game.time }, present);
  return [...nodes, ...markers, ...floatingNodes(floats.slice(-MAX_FLOATS), present, game.time)];
}
