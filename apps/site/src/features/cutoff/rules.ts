import type { SceneNode } from '@opsorama/core';
import { CARRIERS, OUTLETS, SKUS, heldAt, minutesOf, orderItems, stagedAt, stagedFor, type CarrierId, type EcommerceScenario, type EcommerceSnapshot, type LocationId, type OutletId } from '../ecommerce/model';
import { automaticDirector, createEcommerceSimulation, type ActorRef, type ActorStatus, type EcommerceDirector, type EcommerceEvent, type Move, type MoveChoices, type MoveOutcome, type MoveRefusal } from '../ecommerce/simulation';

/**
 * Cut-off: the player keeps the shop and its outlets supplied for one shift. Goods sell through five channels: the shop's
 * checkouts, the click & collect counter, the parcel lockers, the delivery bike and the carriers' trucks. Every item sold scores
 * the points of its channel, and nothing else scores. The forklift, the reach truck, the replenisher, the shelf filler and the
 * dispatcher move material only on the player's commands, or by themselves while their assist is on; picking, packing and the
 * customers run automatically. Plain TypeScript without a renderer: commands in, `advance`, then score, report, notices and scene
 * nodes out. The same seed and the same commands at the same times give the same shift.
 */

/** Seconds of play in a shift; one second is one minute on the shift clock, so eight hours take eight minutes. */
export const SHIFT_SECONDS = 480;
/** Rule step in seconds, the simulation's own step; every rule runs on whole steps. */
const STEP = .1;
const steps = (seconds: number) => Math.round(seconds / STEP);
/** Commands an actor holds at once: the one it works on and the ones waiting. */
export const QUEUE_LIMIT = 3;

/** The levels: the shop is open on both, so every channel sells. */
export type ShiftScenario = Exclude<EcommerceScenario, 'night'>;
export interface ShiftLevel {
  scenario: ShiftScenario; title: string; description: string;
  /** Shift clock at the start. */
  start: string;
  /** Whether every actor starts with its assist on, working by itself while it has no command. */
  assist: boolean;
}
export const SHIFT_LEVELS: Readonly<Record<ShiftScenario, ShiftLevel>> = {
  steady: { scenario: 'steady', title: 'Quiet Tuesday', start: '10:00', assist: true, description: 'A small crew works by itself while you learn the menus: take over any of them. No trucks to receive; Parcelo collects at 16:00.' },
  peak: { scenario: 'peak', title: 'Peak', start: '10:00', assist: false, description: 'Two inbound trucks, SwiftPost loading for its 11:30 cut-off and a busy shop. Every move of material is yours.' },
};

/** The five ways goods sell, each with its points per item sold and the scene node where it sells. */
export type SalesChannel = 'checkout' | OutletId | 'truck';
export interface ChannelInfo { id: SalesChannel; label: string; points: number; node: string; }
export const CHANNELS: readonly ChannelInfo[] = [
  { id: 'checkout', label: 'Shop checkouts', points: 1, node: 'checkout:C2' },
  { id: 'counter', label: 'Click & collect', points: 2, node: 'collect:counter' },
  { id: 'lockers', label: 'Parcel lockers', points: 3, node: 'collect:lockers' },
  { id: 'bike', label: 'Delivery bike', points: 3, node: 'courier-bike' },
  { id: 'truck', label: 'Carrier trucks', points: 2, node: 'dock:D3' },
];
export const POINTS = Object.fromEntries(CHANNELS.map(item => [item.id, item.points])) as Readonly<Record<SalesChannel, number>>;
const channelInfo = (id: SalesChannel) => CHANNELS.find(item => item.id === id)!;

/** Items sold through one channel and their points. */
export interface ScoreLine { id: SalesChannel; label: string; count: number; points: number; }
export interface ShiftScore { total: number; lines: readonly ScoreLine[]; }

/**
 * One channel as the HUD shows it: items sold so far, parcels packed and waiting in its roll cages (`cage`), and what waits at the
 * outlet itself (`there`): parcels ready at the counter, in the lockers or on the bike, or facings on the shop's gondolas, out of
 * `capacity`.
 */
export interface ChannelStatus extends ChannelInfo { sold: number; cage: number; there: number; capacity: number; }
/** A parcel carrier as the shift sees it now. */
export interface CarrierStatus {
  carrier: CarrierId; name: string; cutoff: string;
  /** Seconds of play until the cut-off; null once it passed or when it falls outside the shift. */
  remaining: number | null;
  /** Its parcels in the building, packed or not. */
  open: number;
  /** Whether its truck is loading at the outbound dock. */
  loading: boolean;
}
/** The delivery bike: out on a round or at the door, and seconds of play until it leaves (or, while away, comes back). */
export interface BikeStatus { away: boolean; next: number; }
/** A commanded actor with its commands: `queue[0]` is the move it works on or waits for. */
export interface ActorView extends ActorStatus { queue: readonly Move[]; assist: boolean; }
/** The moves one actor can make with a subject, for a menu. */
export interface ActorChoices extends MoveChoices { actor: ActorRef; }
export interface ShiftReport {
  level: ShiftLevel; seed: number; over: boolean; clock: string;
  score: ShiftScore;
  /** Pallets off the trucks and into the racks; cartons into pick-face lanes, and cartons onto shop gondolas. */
  unloaded: number; putAway: number; replenished: number; restocked: number;
}

/** What the game reports as it runs; `time` is seconds of play. */
export type ShiftNotice = { time: number } & (
  /** Items sold through a channel; `at` names the scene node where they sold, for feedback over it. */
  | { type: 'scored'; channel: SalesChannel; items: number; points: number; text: string; at: string }
  /** The dispatcher brought parcels to an outlet. */
  | { type: 'delivered'; outlet: OutletId; parcels: number }
  /** A command ended: done, its source emptied, its target filled, or refused when it could no longer start. */
  | { type: 'move-ended'; actor: string; move: Move; outcome: MoveOutcome; reason: string }
  | { type: 'move-waiting'; actor: string; move: Move; reason: string }
  /** The outbound truck left: `sent` by the player, or at its carrier's cut-off. */
  | { type: 'departed'; carrier: CarrierId; sent: boolean }
  | { type: 'shift-ended'; report: ShiftReport }
);
type NoticeDetail = ShiftNotice extends infer N ? N extends ShiftNotice ? Omit<N, 'time'> : never : never;

export interface ShiftGame {
  readonly level: ShiftLevel;
  readonly seed: number;
  /** Seconds of play, in whole rule steps. */
  readonly time: number;
  /** Shift clock, e.g. `13:25`. */
  readonly clock: string;
  readonly over: boolean;
  /** Whether the player sent the outbound truck and it has not left yet. */
  readonly departing: boolean;
  /** Bumped whenever scene nodes change; publish `nodes()` when it moves. */
  readonly sceneRevision: number;
  /** Bumped whenever records, score or commands change. */
  readonly recordsRevision: number;
  /** Advance by any number of seconds; the rules run in fixed steps, so the result does not depend on how it is sliced. Stops at the end of the shift. */
  advance(seconds: number): void;
  /**
   * Queue a move for a commanded actor, at most `QUEUE_LIMIT` commands. It is checked now and again when it starts; a move that
   * has to wait for room, or a decant whose pallet the reach truck still has to bring, is accepted. Repeating moves run until
   * their source is empty or their target full.
   */
  move(actor: string, move: Move): void;
  /** End the command the actor works on after its current pallet or carton; the next command follows. */
  stop(actor: string): void;
  /** Remove a waiting command, 1 being the first after the current one. */
  cancelMove(actor: string, index: number): void;
  /** Let an actor work by itself while it has no command, or not. */
  assist(actor: string, on: boolean): void;
  /** Send the truck loading at the outbound dock as soon as no roll cage is on its way to it; otherwise it leaves at its carrier's cut-off. */
  depart(): void;
  /** The commanded actors with their tasks, waits, commands and assist. */
  actors(): ActorView[];
  /** The moves each commanded actor (or only `actor`) can make with a scene node, best target first, and the refused ones. */
  options(subject: string, actor?: string): ActorChoices[];
  score(): ShiftScore;
  report(): ShiftReport;
  /** The five sales channels now, in the order of `CHANNELS`. */
  channels(): ChannelStatus[];
  carriers(): CarrierStatus[];
  bike(): BikeStatus;
  snapshot(): EcommerceSnapshot;
  nodes(): SceneNode[];
  subscribe(listener: (notice: ShiftNotice) => void): () => void;
  dispose(): void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clockOf = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const sameMove = (a: Move | undefined, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);
/** Carriers that collect parcels; NordFreight's wrapped pallets stay static in the simulation. */
const PARCEL_CARRIERS = CARRIERS.filter(item => item.cages.length);
/** Where parcels leave: the outbound dock. */
const OUTBOUND = 'D3';
/** The pick face of a decant refusal, from its target "F3 lanes". */
const decantFace = (refusal: MoveRefusal) => refusal.target.split(' ')[0] as LocationId;
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function createShiftGame({ scenario = 'steady', seed = 1 }: { scenario?: ShiftScenario; seed?: number } = {}): ShiftGame {
  const level = SHIFT_LEVELS[scenario], startMinute = minutesOf(level.start), end = steps(SHIFT_SECONDS);
  /** The step of each carrier's cut-off within this shift; carriers whose cut-off falls outside it have none. */
  const cutoffs = new Map(PARCEL_CARRIERS.flatMap(item => { const offset = (minutesOf(item.cutoff) - startMinute + 1440) % 1440; return offset <= SHIFT_SECONDS ? [[item.id, steps(offset)] as const] : []; }));
  let step = 0, carry = 0, over = false, revision = 0;
  const clockAt = (at: number) => clockOf(startMinute + Math.floor(at * STEP));

  // The player's commands, read by the director: queues, assist switches, and commands the rules hold back.
  const queues = new Map<string, Move[]>(), assisted = new Map<string, boolean>(), held = new Map<string, string>();
  let sent = false, loadingSince = 0, wasLoading = false;

  const queueOf = (id: string) => { let queue = queues.get(id); if (!queue) queues.set(id, queue = []); return queue; };
  const assistOn = (id: string) => assisted.get(id) ?? level.assist;
  /** Whether the reach truck has a command to bring a pallet behind this pick face. */
  function palletComing(face: LocationId): boolean {
    const units = simulation.snapshot().units, faceOf = (pallet: string) => { const sku = units.find(unit => unit.id === pallet)?.sku; return sku ? SKUS[sku].pick : undefined; };
    return (queues.get('reach-truck') ?? []).some(move => move.kind === 'replenish' && faceOf(move.pallet) === face);
  }
  /** Why the rules hold a command back although the simulation could start it: a decant whose pallet is still to come. */
  function hold(actor: string, move: Move): string | undefined {
    if (move.kind === 'decant') { const check = simulation.check(actor, move); if (!check.ok && !check.wait && palletComing(move.face)) return `Waits for the pallet for ${move.face}.`; }
    return undefined;
  }
  /** The outbound truck leaves when sent, or at its carrier's cut-off if it docked before it. */
  function departDue(partner: string): boolean {
    if (sent) return true;
    const carrier = PARCEL_CARRIERS.find(item => item.name === partner), at = carrier && cutoffs.get(carrier.id);
    return at !== undefined && step >= at && loadingSince <= at;
  }

  const director: EcommerceDirector = {
    ...automaticDirector,
    // Trucks wait docked until the forklift unloads them; with its assist on it may take them by itself.
    unload: () => assistOn('forklift'),
    job: (actor, auto) => {
      const head = queues.get(actor.id)?.[0], reason = head && hold(actor.id, head);
      if (held.get(actor.id) !== reason) { if (reason) held.set(actor.id, reason); else held.delete(actor.id); revision++; }
      if (head) return reason ? undefined : head;
      return assistOn(actor.id) ? auto() : undefined;
    },
    depart: dock => departDue(dock.partner),
  };
  const inbox: EcommerceEvent[] = [];
  const simulation = createEcommerceSimulation(scenario, seed, {
    director, capacityRules: true, directorDeparts: true, salesChannels: true,
    // A command leaves its queue the moment it ends, before its actor asks for the next one.
    onEvent: event => {
      if (event.type === 'move-ended') { const queue = queues.get(event.actor); if (queue?.length && sameMove(queue[0], event.move)) { queue.shift(); revision++; } }
      inbox.push(event);
    },
  });
  wasLoading = simulation.snapshot().docks.some(dock => dock.id === OUTBOUND && dock.status === 'loading');

  /* ── Score ────────────────────────────────────────────────────────────── */

  const sold: Record<SalesChannel, number> = { checkout: 0, counter: 0, lockers: 0, bike: 0, truck: 0 };
  const moved = { unloaded: 0, putAway: 0, replenished: 0, restocked: 0 };
  const listeners = new Set<(notice: ShiftNotice) => void>();
  const notify = (notice: NoticeDetail) => { revision++; const timed = { ...notice, time: step * STEP } as ShiftNotice; listeners.forEach(listener => listener(timed)); };
  /** Items sold through a channel score its points. */
  function sell(channel: SalesChannel, items: number, text: string, at = channelInfo(channel).node) {
    if (items <= 0) return;
    sold[channel] += items;
    notify({ type: 'scored', channel, items, points: items * POINTS[channel], text, at });
  }
  function score(): ShiftScore {
    const lines = CHANNELS.map(item => ({ id: item.id, label: item.label, count: sold[item.id], points: sold[item.id] * item.points }));
    return { total: lines.reduce((sum, line) => sum + line.points, 0), lines };
  }

  /* ── Simulation events ────────────────────────────────────────────────── */

  function receive(event: EcommerceEvent) {
    switch (event.type) {
      case 'served': sell('checkout', event.items, `${plural(event.items, 'item')} sold at checkout ${event.lane.slice(1)}`, `checkout:${event.lane}`); break;
      case 'collected': {
        const lockers = event.order.outlet === 'lockers';
        sell(lockers ? 'lockers' : 'counter', orderItems(event.order), `${event.order.id} collected ${lockers ? 'from the lockers' : 'at the counter'}`);
        break;
      }
      case 'bike-left': sell('bike', event.orders.reduce((sum, order) => sum + orderItems(order), 0), `Delivery bike left with ${plural(event.orders.length, 'parcel')}`); break;
      case 'shipped': sell('truck', event.orders.reduce((sum, order) => sum + orderItems(order), 0), `${plural(event.orders.length, 'parcel')} loaded for ${PARCEL_CARRIERS.find(item => item.id === event.carrier)!.name}`); break;
      case 'delivered': notify({ type: 'delivered', outlet: event.outlet, parcels: event.orders.length }); break;
      case 'put-away': moved.putAway++; break;
      case 'unloaded': moved.unloaded++; break;
      case 'replenished': moved.replenished++; break;
      case 'restocked': moved.restocked++; break;
      case 'move-ended': notify({ type: 'move-ended', actor: event.actor, move: event.move, outcome: event.outcome, reason: event.reason }); break;
      case 'move-waiting': notify({ type: 'move-waiting', actor: event.actor, move: event.move, reason: event.reason }); break;
      default: break;
    }
  }

  /* ── Clock ────────────────────────────────────────────────────────────── */

  function tick() {
    simulation.advance(STEP); step++;
    for (const event of inbox.splice(0)) receive(event);
    // The outbound truck: when it docked, and when it left.
    const outbound = simulation.snapshot().docks.find(dock => dock.id === OUTBOUND)!, loading = outbound.status === 'loading';
    if (loading && !wasLoading) loadingSince = step;
    if (!loading && wasLoading) { const carrier = PARCEL_CARRIERS.find(item => item.name === outbound.partner); if (carrier) notify({ type: 'departed', carrier: carrier.id, sent }); sent = false; }
    wasLoading = loading;
    if (step >= end) { over = true; notify({ type: 'shift-ended', report: report() }); }
  }

  function report(): ShiftReport {
    return { level, seed, over, clock: clockAt(step), score: score(), ...moved };
  }

  /* ── Commands ─────────────────────────────────────────────────────────── */

  const playing = () => { if (over) throw new Error('The shift is over.'); revision++; };
  function actorOf(id: string): ActorStatus {
    const all = simulation.actors(), found = all.find(item => item.id === id);
    if (!found) throw new Error(`Unknown actor: ${id}; actors on this shift: ${all.map(item => item.id).join(', ')}.`);
    return found;
  }
  function actors(): ActorView[] {
    return simulation.actors().map(item => {
      const queue = [...queues.get(item.id) ?? []], reason = held.get(item.id);
      return { ...item, ...(reason ? { waiting: reason, move: queue[0] } : {}), queue, assist: assistOn(item.id) };
    });
  }
  function options(subject: string, actor?: string): ActorChoices[] {
    const list = actor ? [actorOf(actor)] : simulation.actors();
    return list.map(({ id, role, label }) => {
      const choices = simulation.moves(id, subject), coming = (item: MoveRefusal) => item.kind === 'decant' && palletComing(decantFace(item));
      // A decant whose pallet the reach truck still has to bring is offered, to wait for it.
      const waiting = choices.refused.filter(coming).map(item => ({ move: { kind: 'decant', face: decantFace(item) } as Move, target: item.target, waits: `Waits for the pallet for ${decantFace(item)}.` }));
      return { actor: { id, role, label }, options: [...choices.options, ...waiting], refused: choices.refused.filter(item => !coming(item)) };
    }).filter(item => item.options.length || item.refused.length);
  }
  function channels(): ChannelStatus[] {
    const snapshot = simulation.snapshot(), facings = Object.values(snapshot.shop.facings).reduce((sum, value) => sum + value, 0);
    return CHANNELS.map(item => {
      if (item.id === 'checkout') return { ...item, sold: sold.checkout, cage: 0, there: facings, capacity: 0 };
      if (item.id === 'truck') return { ...item, sold: sold.truck, cage: PARCEL_CARRIERS.reduce((sum, value) => sum + stagedFor(snapshot, value.id).length, 0), there: 0, capacity: 0 };
      const outlet = OUTLETS.find(value => value.id === item.id)!;
      return { ...item, sold: sold[item.id], cage: stagedAt(snapshot, outlet.id).length, there: heldAt(snapshot, outlet.id).length, capacity: outlet.capacity };
    });
  }
  function carrierStatus(): CarrierStatus[] {
    const snapshot = simulation.snapshot(), outbound = snapshot.docks.find(dock => dock.id === OUTBOUND);
    return PARCEL_CARRIERS.map(item => {
      const at = cutoffs.get(item.id);
      return { carrier: item.id, name: item.name, cutoff: item.cutoff, remaining: at === undefined || at < step ? null : (at - step) * STEP, open: snapshot.orders.filter(order => order.carrier === item.id).length, loading: outbound?.status === 'loading' && outbound.partner === item.name };
    });
  }
  function bike(): BikeStatus {
    const value = simulation.snapshot().bike;
    return value ? { away: value.away, next: Math.max(0, value.next - simulation.time) } : { away: false, next: 0 };
  }
  return {
    level, seed,
    get time() { return step * STEP; },
    get clock() { return clockAt(step); },
    get over() { return over; },
    get departing() { return sent; },
    get sceneRevision() { return simulation.sceneRevision; },
    get recordsRevision() { return simulation.recordsRevision + revision; },
    advance(value) {
      if (!Number.isFinite(value) || value < 0) throw new Error('Advance requires a finite, non-negative number of seconds.');
      carry += value;
      while (!over && carry >= STEP - 1e-9) { carry -= STEP; tick(); }
      if (over) carry = 0;
    },
    move(id, move) {
      playing();
      const { label } = actorOf(id), queue = queueOf(id);
      if (queue.length >= QUEUE_LIMIT) throw new Error(`${label} already has ${QUEUE_LIMIT} commands; cancel one first.`);
      if (queue.some(item => sameMove(item, move))) throw new Error(`${label} already has this command.`);
      const check = simulation.check(id, move);
      if (!check.ok && !check.wait && !(move.kind === 'decant' && palletComing(move.face))) throw new Error(check.reason);
      queue.push(move);
    },
    stop(id) {
      playing();
      const { label } = actorOf(id), queue = queueOf(id);
      if (!queue.length) throw new Error(`${label} has no command to stop.`);
      queue.shift();
    },
    cancelMove(id, index) {
      playing();
      const { label } = actorOf(id), queue = queueOf(id);
      if (index === 0) throw new Error(`${label} works on command 0; stop it instead.`);
      if (!Number.isInteger(index) || index < 1 || index >= queue.length) throw new Error(`${label} has no waiting command ${index}; waiting commands: ${queue.length > 1 ? `1 to ${queue.length - 1}` : 'none'}.`);
      queue.splice(index, 1);
    },
    assist(id, on) { playing(); actorOf(id); assisted.set(id, on); },
    depart() {
      playing();
      if (simulation.snapshot().docks.find(dock => dock.id === OUTBOUND)?.status !== 'loading') throw new Error('No truck is loading at the outbound dock.');
      sent = true;
    },
    actors,
    options,
    score,
    report,
    channels,
    carriers: carrierStatus,
    bike,
    snapshot: () => simulation.snapshot(),
    nodes: () => simulation.nodes(),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { listeners.clear(); simulation.dispose(); },
  };
}
