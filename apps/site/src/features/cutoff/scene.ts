import type { LightingPreset, MarkerNode, MarkerTone, SceneNode, TextNode } from '@opsorama/core';
import { DEPARTMENTS, SKUS, location, minutesOf, type AreaId, type EcommerceSnapshot } from '../ecommerce/model';
import { DOCK_WAITING_NOTE, type StaffMember, type StaffZone } from '../ecommerce/simulation';
import type { CarrierStatus, ShiftDecisions, ShiftEvent, ShiftGame, ShiftLevel } from './rules';

/** The process area that stands for each zone a person can be sent to. */
export const ZONE_AREAS: Readonly<Partial<Record<StaffZone, AreaId>>> = { packing: 'packing', replenishing: 'picking', restocking: 'shop' };
export const ZONE_LABELS: Readonly<Record<StaffZone, string>> = { picking: 'Picking', sorting: 'Sorting', packing: 'Packing', replenishing: 'Replenishing', restocking: 'Shop restocking', dispatch: 'Dispatch' };

/** The zone a clicked node sends a person to: its area or pin, a packing bench, a pick face or a gondola. */
export function zoneAt(nodeId: string): StaffZone | null {
  const [kind, id] = nodeId.split(':');
  if (kind === 'area' || kind === 'pin') return (Object.entries(ZONE_AREAS) as [StaffZone, AreaId][]).find(([, area]) => area === id)?.[0] ?? null;
  if (kind === 'pack') return 'packing';
  if (kind === 'flow' || kind === 'shelf') return 'replenishing';
  if (kind === 'gondola') return 'restocking';
  return null;
}

/** People who can change zone; the player selects them in the scene. */
export const movable = (person: StaffMember | undefined) => !!person && person.zones.length > 1;

/**
 * The game's view of the scene: every movable person is selectable, and while one
 * is selected the area pins they can go to are marked and named, and the others are dimmed.
 */
export function gameNodes(nodes: readonly SceneNode[], staff: readonly StaffMember[], selected: string | null): SceneNode[] {
  const people = new Set(staff.filter(movable).map(person => person.id)), person = staff.find(item => item.id === selected && movable(item));
  const targets = new Map(person ? person.zones.filter(zone => zone !== person.zone).flatMap(zone => ZONE_AREAS[zone] ? [[ZONE_AREAS[zone]!, zone] as const] : []) : []);
  return nodes.map(node => {
    if (people.has(node.id) && node.kind === 'asset') return { ...node, selectable: true };
    if (person && node.kind === 'asset' && node.id.startsWith('pin:')) {
      const zone = targets.get(node.id.slice(4) as AreaId);
      return zone ? { ...node, state: 'busy', label: `Send here · ${ZONE_LABELS[zone]}` } : { ...node, state: 'inactive' };
    }
    return node;
  });
}

/** Time of day from the existing presets: studio light by day, dusk from 16:00 and night light on the night shift. */
export function lightingAt(level: ShiftLevel, clock: string): LightingPreset {
  if (level.scenario === 'night') return 'night';
  return minutesOf(clock) >= DUSK ? 'dusk' : 'studio';
}
const DUSK = 16 * 60;

/** What the markers read from the game. */
export interface ProblemState { snapshot: EcommerceSnapshot; events: readonly ShiftEvent[]; decisions: ShiftDecisions; carriers: readonly CarrierStatus[]; time: number; }
/** Height above the carrying node's origin where a marker or floating text starts, in metres. */
const MARKER_HEIGHT = 2.6, FLOAT_HEIGHT = 2, FLOAT_RISE = .9;
/** Customers queuing at one lane when it gets a warning; the game's walk-outs start here. */
const LONG_QUEUE = 3;
/** Minutes before a cut-off when its open orders get a critical marker. */
const CUTOFF_WARNING = 30;

/**
 * Scene markers for the problems of the moment, attached to the object they concern: open events, stopped machines,
 * long queues, empty departments, a near cut-off and trucks waiting to unload. One marker per object, the most urgent first.
 */
export function problemMarkers(state: ProblemState, present: ReadonlySet<string>): MarkerNode[] {
  const markers = new Map<string, MarkerNode>();
  const add = (nodeId: string, tone: MarkerTone, eyebrow: string, label: string, detail?: string) => {
    if (!present.has(nodeId) || markers.has(nodeId)) return;
    markers.set(nodeId, { id: `marker:${nodeId}`, kind: 'marker', attachment: { nodeId }, position: [0, MARKER_HEIGHT, 0], tone, eyebrow, label, ...(detail ? { detail } : {}) });
  };
  const { snapshot } = state;
  for (const event of state.events) {
    const left = `${Math.max(0, Math.ceil(event.deadline - state.time))} min to decide`;
    if (event.kind === 'robot-breakdown') add(event.subject, 'critical', 'EVENT', event.title, left);
    if (event.kind === 'late-truck') add(`dock:${event.subject}`, 'warning', 'EVENT', event.title, left);
    if (event.kind === 'store-rush') add('pin:shop', 'warning', 'EVENT', event.title, left);
    if (event.kind === 'vip-order') add('dock:D3', 'info', 'EVENT', event.title, left);
    if (event.kind === 'short-pick') {
      const order = snapshot.orders.find(item => item.id === event.subject), short = order?.lines.find(line => snapshot.alerts.some(alert => alert.sku === line.sku)) ?? order?.lines[0];
      if (short) { const face = SKUS[short.sku].pick; add(`${location(face).kind}:${face}`, 'warning', 'EVENT', event.title, left); }
    }
  }
  for (const [machine, until] of Object.entries(state.decisions.stopped)) add(machine, 'critical', 'STOPPED', 'Machine stopped', Number.isFinite(until) ? `Back in ${Math.ceil(until - state.time)} min` : 'Waiting for your decision');
  const cutoff = state.carriers.filter(item => item.remaining !== null && item.remaining <= CUTOFF_WARNING && item.open).sort((a, b) => a.remaining! - b.remaining!)[0];
  if (cutoff) add('dock:D3', 'critical', 'CUT-OFF', `${cutoff.name} ${cutoff.cutoff}`, `${cutoff.open} ${cutoff.open === 1 ? 'order' : 'orders'} still in the building · ${Math.ceil(cutoff.remaining!)} min left`);
  if (snapshot.shopOpen) {
    for (const department of DEPARTMENTS) if (snapshot.shop.facings[department.id] === 0) add(`gondola:${department.id}:0`, 'critical', 'SHELVES', `${department.label} is empty`);
    for (const lane of snapshot.shop.checkouts) if (lane.open && lane.queue >= LONG_QUEUE) add(`checkout:${lane.id}`, 'warning', 'QUEUE', `Checkout ${lane.id.slice(1)}: ${lane.queue} waiting`, 'Customers leave a queue this long');
  }
  for (const dock of snapshot.docks) if (dock.status === 'expected' && dock.note === DOCK_WAITING_NOTE) add(`dock:${dock.id}`, 'info', 'DOCK', `${dock.reference} waits to unload`, `Allow unloading at dock ${dock.id}`);
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

/** Most point changes floating at once; older ones give way. */
const MAX_FLOATS = 12;
/** The scene of a game: its nodes with the selection marks, problem markers and floating point changes. */
export function playNodes(game: ShiftGame, selected: string | null, floats: readonly Floating[]): SceneNode[] {
  const nodes = gameNodes(game.nodes(), game.staff(), selected), present = new Set(nodes.map(node => node.id));
  const markers = problemMarkers({ snapshot: game.snapshot(), events: game.events(), decisions: game.decisions(), carriers: game.carriers(), time: game.time }, present);
  return [...nodes, ...markers, ...floatingNodes(floats.slice(-MAX_FLOATS), present, game.time)];
}
