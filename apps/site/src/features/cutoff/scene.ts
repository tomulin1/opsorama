import type { LightingPreset, MarkerNode, MarkerTone, SceneNode, TextNode } from '@opsorama/core';
import { DEPARTMENTS, GOODS_COLORS, cageOutlet, faceGoods, minutesOf, skuGoods, type DepartmentId, type EcommerceSnapshot, type LocationId } from '../ecommerce/model';
import { DOCK_WAITING_NOTE, type Move } from '../ecommerce/simulation';
import type { ActorView, BikeStatus, CarrierStatus, ChannelStatus, ShiftGame } from './rules';

const palletNumber = (pallet: string) => pallet.split(':')[1];
const departmentLabel = (id: string) => DEPARTMENTS.find(item => item.id === id)?.label ?? id;
/** A command in words, for the menus and the messages. */
export function moveLabel(move: Move): string {
  switch (move.kind) {
    case 'unload': return `Unload the truck at ${move.dock}`;
    case 'put-away': return `Put pallet ${palletNumber(move.pallet)} away to ${move.rack}${move.level === undefined ? '' : ` level ${move.level + 1}`}`;
    case 'replenish': return `Bring pallet ${palletNumber(move.pallet)} behind its pick face`;
    case 'clear': return `Take the empty pallet from ${move.face} to the stack`;
    case 'decant': return `Fill ${move.face} from its pallet`;
    case 'restock': return move.source === 'transfer' ? `Take the shop transfer to ${departmentLabel(move.department)}` : `Restock ${departmentLabel(move.department)}`;
    case 'ship': { const outlet = cageOutlet(move.cage); return outlet ? `Take the parcels to the ${outlet.label.toLowerCase()}` : `Load ${move.cage} onto the truck`; }
  }
}

/** Time of day from the existing presets: studio light by day, dusk from 16:00. */
export function lightingAt(clock: string): LightingPreset {
  return minutesOf(clock) >= DUSK ? 'dusk' : 'studio';
}
const DUSK = 16 * 60;

/** What the markers read from the game. */
export interface ProblemState { snapshot: EcommerceSnapshot; channels: readonly ChannelStatus[]; carriers: readonly CarrierStatus[]; bike: BikeStatus; actors: readonly ActorView[]; }
/** Height above the carrying node's origin where a marker or floating text starts, in metres. */
const MARKER_HEIGHT = 2.6, FLOAT_HEIGHT = 2, FLOAT_RISE = .9;
/** Minutes before a cut-off, or before the bike leaves, when the parcels still in their cage get a marker. */
const CUTOFF_WARNING = 30, BIKE_WARNING = 15;
const parcels = (count: number) => `${count} ${count === 1 ? 'parcel' : 'parcels'}`;

/**
 * Scene markers for what is about to lose sales, attached to the object it concerns: an empty shop department, an outlet with
 * nothing to hand over while its parcels wait in their cage, the bike or a truck about to leave without parcels still in their
 * cages, trucks waiting to unload and actors waiting with a command. One marker per object, the most urgent first.
 */
export function problemMarkers(state: ProblemState, present: ReadonlySet<string>): MarkerNode[] {
  const markers = new Map<string, MarkerNode>();
  const add = (nodeId: string, tone: MarkerTone, eyebrow: string, label: string, detail?: string) => {
    if (!present.has(nodeId) || markers.has(nodeId)) return;
    markers.set(nodeId, { id: `marker:${nodeId}`, kind: 'marker', attachment: { nodeId }, position: [0, MARKER_HEIGHT, 0], tone, eyebrow, label, ...(detail ? { detail } : {}) });
  };
  const { snapshot } = state;
  for (const department of DEPARTMENTS) if (snapshot.shop.facings[department.id] === 0) add(`gondola:${department.id}:0`, 'critical', 'SHELVES', `${department.label} is empty`, 'Shoppers leave without its goods');
  const truck = state.carriers.find(item => item.loading && item.remaining !== null && item.remaining <= CUTOFF_WARNING);
  const truckCage = state.channels.find(item => item.id === 'truck')!.cage;
  if (truck && truckCage) add('dock:D3', 'critical', 'CUT-OFF', `${truck.name} leaves at ${truck.cutoff}`, `${parcels(truckCage)} still in the cages · ${Math.ceil(truck.remaining!)} min left`);
  const bike = state.channels.find(item => item.id === 'bike')!;
  if (!state.bike.away && bike.cage && state.bike.next <= BIKE_WARNING) add('cage:bike-1', 'warning', 'BIKE', `Bike leaves in ${Math.ceil(state.bike.next)} min`, `${parcels(bike.cage)} still in the cage`);
  for (const outlet of state.channels.filter(item => item.id === 'counter' || item.id === 'lockers')) if (!outlet.there && outlet.cage) add(outlet.node, 'warning', 'EMPTY', `${outlet.label}: nothing to hand over`, `${parcels(outlet.cage)} wait in the cage`);
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
 * dashboard keeps its neutral colors: a pallet's cartons take its SKU's color (`color`), a pick face's cartons the color of its
 * goods (`materials.surface`) and a gondola, with its sign, the color of its department. Reserve racks stay neutral: any pallet
 * may stand in any of them. The area floors take no clicks, so a click either hits material or clears the menu.
 */
export function playable(nodes: readonly SceneNode[], snapshot: EcommerceSnapshot): SceneNode[] {
  const pallets = new Map(snapshot.units.filter(unit => unit.kind === 'pallet' && unit.sku).map(unit => [unit.id, GOODS_COLORS[skuGoods(unit.sku!)]]));
  return nodes.map(node => {
    if (node.id.startsWith('area:')) return { ...node, selectable: false };
    if (node.kind !== 'asset' || !node.entityId && !pallets.has(node.id)) return node;
    const pallet = pallets.get(node.id);
    if (pallet) return { ...node, color: pallet };
    if (node.asset === 'carton-flow-rack') return { ...node, materials: { ...node.materials, surface: GOODS_COLORS[faceGoods(node.entityId as LocationId)] } };
    if (node.asset === 'store-shelving') {
      const color = GOODS_COLORS[node.entityId as DepartmentId], label = node.options?.surfaceLabel;
      return { ...node, color, ...(label?.kind === 'text' ? { options: { ...node.options, surfaceLabel: { ...label, background: color } } } : {}) };
    }
    return node;
  });
}

/** Most point changes floating at once; older ones give way. */
const MAX_FLOATS = 12;
/**
 * The scene of a game: its nodes colored by type of goods, with problem markers and floating point changes. While the player
 * gives one of the crew a command (`commanding`), the problem markers step aside for the page's action pills.
 */
export function playNodes(game: ShiftGame, floats: readonly Floating[], commanding = false): SceneNode[] {
  const snapshot = game.snapshot(), nodes = playable(game.nodes(), snapshot), present = new Set(nodes.map(node => node.id));
  const markers = commanding ? [] : problemMarkers({ snapshot, channels: game.channels(), carriers: game.carriers(), bike: game.bike(), actors: game.actors() }, present);
  return [...nodes, ...markers, ...floatingNodes(floats.slice(-MAX_FLOATS), present, game.time)];
}
