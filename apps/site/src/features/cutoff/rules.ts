import type { SceneNode } from '@opsorama/core';
import { CARRIERS, DEPARTMENTS, SKUS, location, minutesOf, type CarrierId, type DepartmentId, type DockId, type EcommerceScenario, type EcommerceSnapshot, type LocationId, type Order } from '../ecommerce/model';
import { DOCK_WAITING_NOTE, automaticDirector, createEcommerceSimulation, type ActorRef, type ActorStatus, type EcommerceDirector, type EcommerceEvent, type Move, type MoveChoices, type MoveOutcome, type MoveRefusal } from '../ecommerce/simulation';

/**
 * Cut-off: the player runs the material flow of one shift in the e-commerce shop and warehouse. The forklift, the reach truck,
 * the replenisher, the shelf filler and the dispatcher move material only on the player's commands, or by themselves while their
 * assist is on; picking, packing and the shop run automatically. Plain TypeScript without a renderer: commands in, `advance`,
 * then score, report, notices and scene nodes out. The same seed and the same commands at the same times give the same shift.
 */

/** Seconds of play in a shift; one second is one minute on the shift clock, so eight hours take eight minutes. */
export const SHIFT_SECONDS = 480;
/** Rule step in seconds, the simulation's own step; every rule runs on whole steps. */
const STEP = .1;
const steps = (seconds: number) => Math.round(seconds / STEP);
/** Seconds an event waits for an answer before its default choice applies. */
export const ANSWER_SECONDS = 45;
/** Commands an actor holds at once: the one it works on and the ones waiting. */
export const QUEUE_LIMIT = 3;
/** A customer who finds this many people queuing leaves. */
const WALK_OUT_AT = 3;
/** Extra customers a store rush draws in. */
const RUSH_SHOPPERS = 8;

export interface ShiftLevel {
  scenario: EcommerceScenario; title: string; description: string;
  /** Shift clock at the start. */
  start: string;
  /** Whether every actor starts with its assist on, working by itself while it has no command. */
  assist: boolean;
}
export const SHIFT_LEVELS: Readonly<Record<EcommerceScenario, ShiftLevel>> = {
  steady: { scenario: 'steady', title: 'Quiet Tuesday', start: '10:00', assist: true, description: 'A small crew works by itself while you learn the menus: take over any of them. Parcelo collects at 16:00; no trucks to receive.' },
  peak: { scenario: 'peak', title: 'Peak', start: '10:00', assist: false, description: 'Two inbound trucks, SwiftPost loading for its 11:30 cut-off and a busy shop. Every move of material is yours.' },
  night: { scenario: 'night', title: 'Night shift', start: '22:00', assist: false, description: 'The shop is closed. Receive, put away and bring every pick face above its minimum by 06:00.' },
};

/** Points per counted item; a waiting truck counts per started quarter hour of the shift clock. */
export const POINTS = {
  'on-time': 10, late: 4, collected: 6, 'put-away': 5, stocked: 20,
  'missed-cutoff': -8, 'ran-empty': -5, 'short-pick': -3, 'truck-waiting': -1,
} as const;
export type ScoreId = keyof typeof POINTS | 'events';
const LABELS: Readonly<Record<ScoreId, string>> = {
  'on-time': 'Shipped before the cut-off', late: 'Shipped after the cut-off', collected: 'Click & collect handed over', 'put-away': 'Pallets put away', stocked: 'Every pick face stocked at 06:00',
  'missed-cutoff': 'Orders that missed their cut-off', 'ran-empty': 'Departments that ran empty', 'short-pick': 'Short picks', 'truck-waiting': 'Truck quarter hours on a dock', events: 'Event decisions',
};
/** Seconds of play per counted quarter hour of a waiting truck. */
const PER_TRUCK = 15;

export interface ScoreLine { id: ScoreId; label: string; count: number; points: number; }
export interface ShiftScore { total: number; lines: readonly ScoreLine[]; }

export type ShiftEventKind = 'robot-breakdown' | 'short-pick' | 'late-truck' | 'store-rush' | 'vip-order';
export interface ShiftChoice { id: string; label: string; effect: string; }
export interface ShiftEvent {
  id: string; kind: ShiftEventKind; title: string; text: string;
  /** Seconds of play when it opened, and when its default choice applies. */
  opened: number; deadline: number;
  choices: readonly ShiftChoice[];
  /** The choice that applies without an answer. */
  fallback: string;
  /** The robot, order, dock or `shop` it is about. */
  subject: string;
  answer?: { choice: string; at: number; auto: boolean };
}

/** A parcel carrier as the shift sees it now. */
export interface CarrierStatus {
  carrier: CarrierId; name: string; cutoff: string;
  /** Seconds of play until the cut-off; null once it passed or when it falls outside the shift. */
  remaining: number | null;
  /** Its orders still in the building. */
  open: number;
  /** Whether its truck is loading at the outbound dock. */
  loading: boolean;
}
/** What holds the shift back now: late trucks and stopped machines, until when (seconds of play; Infinity until the event is answered). */
export interface ShiftDecisions {
  late: Readonly<Partial<Record<DockId, number>>>;
  stopped: Readonly<Record<string, number>>;
  /** Whether the player sent the outbound truck and it has not left yet. */
  departing: boolean;
}
/** A commanded actor with its commands: `queue[0]` is the move it works on or waits for. */
export interface ActorView extends ActorStatus { queue: readonly Move[]; assist: boolean; }
/** The moves one actor can make with a subject, for a menu. */
export interface ActorChoices extends MoveChoices { actor: ActorRef; }
export interface CarrierTotals { carrier: CarrierId; name: string; cutoff: string; onTime: number; late: number; missed: number; }
export interface ShiftReport {
  level: ShiftLevel; seed: number; over: boolean; clock: string;
  score: ShiftScore;
  carriers: readonly CarrierTotals[];
  shipped: number; collected: number; putAway: number; unloaded: number;
  /** Cartons into pick-face lanes, and cartons onto shop gondolas. */
  replenished: number; restocked: number;
  ranEmpty: number; shortPicks: number;
  events: readonly { kind: ShiftEventKind; choice: string; auto: boolean }[];
}

/** What the game reports as it runs; `time` is seconds of play. */
export type ShiftNotice = { time: number } & (
  | { type: 'event-opened'; event: ShiftEvent }
  | { type: 'event-answered'; event: ShiftEvent }
  /** `at` names the scene node where it happened, when there is one, for feedback over it. */
  | { type: 'scored'; line: ScoreId; points: number; text: string; at?: string }
  | { type: 'cutoff'; carrier: CarrierId; missed: number }
  /** A command ended: done, its source emptied, its target filled, or refused when it could no longer start. */
  | { type: 'move-ended'; actor: string; move: Move; outcome: MoveOutcome; reason: string }
  | { type: 'move-waiting'; actor: string; move: Move; reason: string }
  /** A waiting command left a full queue for one that an event put first. */
  | { type: 'move-dropped'; actor: string; move: Move }
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
  /** Bumped whenever scene nodes change; publish `nodes()` when it moves. */
  readonly sceneRevision: number;
  /** Bumped whenever records, score, events or commands change. */
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
  /** Send the truck loading at the outbound dock as soon as no roll cage is on its way; otherwise it leaves at its carrier's cut-off. */
  depart(): void;
  answer(event: string, choice: string): void;
  /** The commanded actors with their tasks, waits, commands and assist. */
  actors(): ActorView[];
  /** The moves each commanded actor (or only `actor`) can make with a scene node, best target first, and the refused ones. */
  options(subject: string, actor?: string): ActorChoices[];
  score(): ShiftScore;
  report(): ShiftReport;
  decisions(): ShiftDecisions;
  carriers(): CarrierStatus[];
  /** Open events, oldest first. */
  events(): readonly ShiftEvent[];
  snapshot(): EcommerceSnapshot;
  nodes(): SceneNode[];
  subscribe(listener: (notice: ShiftNotice) => void): () => void;
  dispose(): void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clockOf = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const seeded = (seed: number) => () => { seed = seed + 0x6d2b79f5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const sameMove = (a: Move | undefined, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);
/** Carriers that collect parcels; NordFreight's wrapped pallets stay static in the simulation. */
const PARCEL_CARRIERS = CARRIERS.filter(item => item.cages.length);
const IN_WORK: readonly Order['stage'][] = ['released', 'picking', 'sorting', 'packing'];
/** Where parcels leave: the outbound dock. */
const OUTBOUND = 'D3', SHIPPING_DOCK = `dock:${OUTBOUND}`;
const faceNode = (face: LocationId) => `${location(face).kind}:${face}`;
/** The pick face of a decant refusal, from its target "F3 lanes". */
const decantFace = (refusal: MoveRefusal) => refusal.target.split(' ')[0] as LocationId;

export function createShiftGame({ scenario = 'steady', seed = 1 }: { scenario?: EcommerceScenario; seed?: number } = {}): ShiftGame {
  const level = SHIFT_LEVELS[scenario], random = seeded(seed ^ 0x5eed), startMinute = minutesOf(level.start), end = steps(SHIFT_SECONDS);
  /** The step of each carrier's cut-off within this shift; carriers whose cut-off falls outside it have none. */
  const cutoffs = new Map(PARCEL_CARRIERS.flatMap(item => { const offset = (minutesOf(item.cutoff) - startMinute + 1440) % 1440; return offset <= SHIFT_SECONDS ? [[item.id, steps(offset)] as const] : []; }));
  let step = 0, carry = 0, over = false, nextEvent = 1, revision = 0;
  const clockAt = (at: number) => clockOf(startMinute + Math.floor(at * STEP));

  // The player's commands, read by the director: queues, assist switches, and commands the rules hold back.
  const queues = new Map<string, Move[]>(), assisted = new Map<string, boolean>(), held = new Map<string, string>();
  let vipFirst: string | null = null, sent = false, loadingSince = 0, wasLoading = false;
  // Event effects, as steps until which they last.
  const down = new Map<string, number>(), lateUntil = new Map<DockId, number>();
  let rushUntil = -1;

  const queueOf = (id: string) => { let queue = queues.get(id); if (!queue) queues.set(id, queue = []); return queue; };
  const assistOn = (id: string) => assisted.get(id) ?? level.assist;
  const late = (dock: DockId) => (lateUntil.get(dock) ?? 0) > step;
  /** Whether the reach truck has a command to bring a pallet behind this pick face. */
  function palletComing(face: LocationId): boolean {
    const units = simulation.snapshot().units, faceOf = (pallet: string) => { const sku = units.find(unit => unit.id === pallet)?.sku; return sku ? SKUS[sku].pick : undefined; };
    return (queues.get('reach-truck') ?? []).some(move => move.kind === 'replenish' && faceOf(move.pallet) === face);
  }
  /** Why the rules hold a command back although the simulation could start it: a late truck, or a pallet still to come. */
  function hold(actor: string, move: Move): string | undefined {
    if (move.kind === 'unload' && late(move.dock)) { const until = lateUntil.get(move.dock)!; return `The truck at ${move.dock} is late; ${Number.isFinite(until) ? `it may unload from ${clockAt(until)}` : 'answer its event first'}.`; }
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
    priority: order => order.id === vipFirst ? 4 : 0,
    // Trucks wait docked until the forklift unloads them; with its assist on it may take them by itself.
    unload: dock => assistOn('forklift') && !late(dock.id),
    running: machine => (down.get(machine) ?? 0) <= step,
    shoppers: usual => step < rushUntil ? usual + RUSH_SHOPPERS : usual,
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
    director, walkOutAt: WALK_OUT_AT, capacityRules: true, directorDeparts: true,
    // A command leaves its queue the moment it ends, before its actor asks for the next one.
    onEvent: event => {
      if (event.type === 'move-ended') { const queue = queues.get(event.actor); if (queue?.length && sameMove(queue[0], event.move)) { queue.shift(); revision++; } }
      inbox.push(event);
    },
  });
  const start = simulation.snapshot();
  wasLoading = start.docks.some(dock => dock.id === OUTBOUND && dock.status === 'loading');

  /* ── Score ────────────────────────────────────────────────────────────── */

  const counts: Record<ScoreId, number> = { 'on-time': 0, late: 0, collected: 0, 'put-away': 0, stocked: 0, 'missed-cutoff': 0, 'ran-empty': 0, 'short-pick': 0, 'truck-waiting': 0, events: 0 };
  const carriers = new Map(PARCEL_CARRIERS.map(item => [item.id, { carrier: item.id, name: item.name, cutoff: item.cutoff, onTime: 0, late: 0, missed: 0 }]));
  const moved = { unloaded: 0, replenished: 0, restocked: 0 };
  let eventPoints = 0, truckSteps = 0;
  const listeners = new Set<(notice: ShiftNotice) => void>();
  const notify = (notice: NoticeDetail) => { revision++; const timed = { ...notice, time: step * STEP } as ShiftNotice; listeners.forEach(listener => listener(timed)); };
  function count(line: keyof typeof POINTS, text: string, at?: string, amount = 1) { counts[line] += amount; notify({ type: 'scored', line, points: POINTS[line] * amount, text, ...(at ? { at } : {}) }); }
  function eventScore(points: number, text: string, at?: string) { counts.events++; eventPoints += points; notify({ type: 'scored', line: 'events', points, text, ...(at ? { at } : {}) }); }
  function score(): ShiftScore {
    const lines = (Object.keys(counts) as ScoreId[]).map(id => ({ id, label: LABELS[id], count: counts[id], points: id === 'events' ? eventPoints : counts[id] * POINTS[id] }));
    return { total: lines.reduce((sum, line) => sum + line.points, 0), lines };
  }

  /* ── Events ───────────────────────────────────────────────────────────── */

  const open: ShiftEvent[] = [], history: ShiftEvent[] = [];
  const vip: { order: string; carrier: CarrierId; promised: boolean; settled: boolean }[] = [];
  /** Each event's earliest step, drawn at the start so that commands never change when events come. */
  const plan = new Map<ShiftEventKind, number>([
    ['vip-order', steps(40 + random() * 200)], ['robot-breakdown', steps(80 + random() * 120)], ['late-truck', steps(90 + random() * 150)], ['store-rush', steps(150 + random() * 180)], ['short-pick', steps(20)],
  ]);
  if (!start.robots) plan.delete('robot-breakdown');
  if (!start.crew.receiving) plan.delete('late-truck');
  if (!start.shopOpen) plan.delete('store-rush');
  if (!start.crew.picking) { plan.delete('vip-order'); plan.delete('short-pick'); }
  /** The first short pick and the first new parcel order once their event is due. */
  let shortCandidate: { order: string; sku: string } | null = null, vipCandidate: string | null = null;
  const has = (actor: string) => simulation.actors().some(item => item.id === actor);

  /** A reserve pallet of a SKU the reach truck could bring, now or once there is room behind its pick face. */
  function reservePallet(sku: string): string | undefined {
    if (!has('reach-truck')) return undefined;
    return simulation.snapshot().units.filter(unit => unit.kind === 'pallet' && unit.sku === sku && unit.at.startsWith('Rack ')).map(unit => unit.id)
      .find(pallet => { const check = simulation.check('reach-truck', { kind: 'replenish', pallet }); return check.ok || check.wait; });
  }
  /** Put commands, in their order, right after the one the actor works on; a full queue drops its last waiting commands. */
  function first(actor: string, moves: readonly Move[]) {
    if (!has(actor)) return;
    const queue = queueOf(actor);
    queue.splice(Math.min(1, queue.length), 0, ...moves.filter(move => !queue.some(item => sameMove(item, move))));
    while (queue.length > QUEUE_LIMIT) notify({ type: 'move-dropped', actor, move: queue.pop()! });
    revision++;
  }
  function openEvent(kind: ShiftEventKind, subject: string, title: string, text: string, choices: ShiftChoice[], fallback: string) {
    plan.delete(kind);
    const event: ShiftEvent = { id: `event-${nextEvent++}`, kind, title, text, opened: step * STEP, deadline: (step + steps(ANSWER_SECONDS)) * STEP, choices, fallback, subject };
    open.push(event); history.push(event);
    if (kind === 'robot-breakdown') down.set(subject, Infinity);
    if (kind === 'late-truck') lateUntil.set(subject as DockId, Infinity);
    if (kind === 'store-rush') rushUntil = step + steps(90);
    notify({ type: 'event-opened', event });
  }
  /** The SKU each short-pick event is about. */
  const shortSku = new Map<string, string>();
  function trigger() {
    for (const [kind, at] of [...plan]) {
      if (step < at) continue;
      const snapshot = simulation.snapshot();
      if (kind === 'robot-breakdown') openEvent(kind, 'robot:0', 'Robot down', 'Robot 1 stopped at the conveyor.', [
        { id: 'repair', label: 'Call the technician', effect: 'Back in 30 minutes; costs 8 points.' }, { id: 'wait', label: 'Run on one robot less', effect: 'Back 150 minutes after the breakdown; no cost.' }], 'wait');
      if (kind === 'store-rush') openEvent(kind, 'shop', 'Store rush', 'A coach party is heading for the shop; the shelves will empty fast.', [
        ...(has('shelf-filler') ? [{ id: 'restock', label: 'Restock the shop first', effect: 'The shelf filler restocks the two emptiest departments next.' }] : []),
        { id: 'ride', label: 'Carry on', effect: 'No change; a department that runs empty costs 5 points.' }], 'ride');
      if (kind === 'late-truck') {
        const dock = snapshot.docks.find(item => item.direction === 'inbound' && item.status === 'expected');
        if (dock) openEvent(kind, dock.id, 'Late truck', `${dock.reference} from ${dock.partner} is running late for dock ${dock.id}.`, [
          { id: 'expedite', label: 'Pay for a priority slot', effect: 'Costs 10 points; unload it whenever you choose.' }, { id: 'wait', label: 'Let it come late', effect: 'No cost; it cannot unload for 90 minutes.' }], 'wait');
      }
      if (kind === 'short-pick' && shortCandidate) {
        const order = snapshot.orders.find(item => item.id === shortCandidate!.order), sku = shortCandidate.sku, face = SKUS[sku].pick;
        if (order && (order.stage === 'released' || order.stage === 'picking')) {
          openEvent(kind, order.id, 'Short pick', `Order ${order.id} waits: ${sku} is out at pick face ${face}.`, [
            ...(reservePallet(sku) ? [{ id: 'replenish', label: 'Replenish it next', effect: `The reach truck brings a ${sku} pallet from reserve next, and the replenisher fills ${face}.` }] : []),
            { id: 'cancel', label: 'Cancel the order', effect: 'Costs 6 points now; it cannot miss a cut-off.' }, { id: 'wait', label: 'Wait for stock', effect: 'No cost now; it may miss its cut-off.' }], 'wait');
          shortSku.set(history[history.length - 1].id, sku);
        }
        shortCandidate = null;
      }
      if (kind === 'vip-order') {
        // A new parcel order, or else the oldest parcel order still in work for the carrier with the most time left.
        const left = (order: Order) => order.carrier === undefined ? -1 : (cutoffs.get(order.carrier) ?? -1) - step;
        const fallback = snapshot.orders.filter(item => IN_WORK.includes(item.stage) && left(item) > steps(120)).sort((a, b) => left(b) - left(a))[0];
        const order = snapshot.orders.find(item => item.id === vipCandidate) ?? fallback, name = order?.carrier && carriers.get(order.carrier)!.name;
        vipCandidate = null;
        if (order && name) openEvent(kind, order.id, 'Key customer', `Order ${order.id} is for a key customer and goes with ${name}.`, [
          { id: 'first', label: 'Promise it first', effect: 'Pickers and packers take it first; +20 if it ships before the cut-off, -10 if not.' }, { id: 'decline', label: 'Handle it normally', effect: 'No promise, no bonus.' }], 'decline');
      }
    }
  }
  function settle(event: ShiftEvent, choice: string, auto: boolean) {
    event.answer = { choice, at: step * STEP, auto };
    open.splice(open.indexOf(event), 1);
    const opened = steps(event.opened);
    switch (`${event.kind}:${choice}`) {
      case 'robot-breakdown:repair': down.set(event.subject, step + steps(30)); eventScore(-8, 'Technician called', event.subject); break;
      case 'robot-breakdown:wait': down.set(event.subject, opened + steps(150)); break;
      case 'late-truck:expedite': lateUntil.delete(event.subject as DockId); eventScore(-10, 'Priority slot paid', `dock:${event.subject}`); break;
      case 'late-truck:wait': lateUntil.set(event.subject as DockId, opened + steps(90)); break;
      case 'store-rush:restock': {
        const facings = simulation.snapshot().shop.facings;
        const departments = DEPARTMENTS.map(item => item.id).sort((a, b) => facings[a] - facings[b]).filter(department => simulation.check('shelf-filler', { kind: 'restock', department, source: 'face' }).ok).slice(0, 2);
        first('shelf-filler', departments.map(department => ({ kind: 'restock', department, source: 'face' })));
        break;
      }
      case 'short-pick:replenish': {
        const sku = shortSku.get(event.id)!, pallet = reservePallet(sku);
        if (pallet) { first('reach-truck', [{ kind: 'replenish', pallet }]); first('replenisher', [{ kind: 'decant', face: SKUS[sku].pick }]); }
        break;
      }
      case 'short-pick:cancel': if (simulation.cancel(event.subject)) eventScore(-6, `Order ${event.subject} cancelled`); break;
      case 'vip-order:first': {
        const order = simulation.snapshot().orders.find(item => item.id === event.subject);
        if (order?.carrier) { vipFirst = order.id; vip.push({ order: order.id, carrier: order.carrier, promised: true, settled: false }); }
        break;
      }
      default: break;
    }
    notify({ type: 'event-answered', event });
  }

  /* ── Simulation events ────────────────────────────────────────────────── */

  function onTime(order: Order) { const cutoff = order.carrier ? cutoffs.get(order.carrier) : undefined; return cutoff === undefined || step <= cutoff; }
  function receive(event: EcommerceEvent) {
    switch (event.type) {
      case 'shipped':
        for (const order of event.orders) {
          const timely = onTime(order), totals = carriers.get(event.carrier);
          if (totals) { if (timely) totals.onTime++; else totals.late++; }
          count(timely ? 'on-time' : 'late', `${order.id} shipped`, SHIPPING_DOCK);
          const promise = vip.find(value => value.order === order.id && !value.settled);
          if (promise) { promise.settled = true; if (vipFirst === order.id) vipFirst = null; if (timely) eventScore(20, `Key customer ${order.id} shipped in time`, SHIPPING_DOCK); }
        }
        break;
      case 'ordered': if ((plan.get('vip-order') ?? Infinity) <= step && !vipCandidate && event.order.carrier && (cutoffs.get(event.order.carrier) ?? -1) > step + steps(120)) vipCandidate = event.order.id; break;
      case 'collected': count('collected', `${event.order.id} collected`, 'collect:counter'); break;
      case 'put-away': count('put-away', `Pallet put away to ${event.rack}`, `rack:${event.rack}`); break;
      case 'unloaded': moved.unloaded++; break;
      case 'replenished': moved.replenished++; break;
      case 'restocked': moved.restocked++; break;
      case 'move-ended': notify({ type: 'move-ended', actor: event.actor, move: event.move, outcome: event.outcome, reason: event.reason }); break;
      case 'move-waiting': notify({ type: 'move-waiting', actor: event.actor, move: event.move, reason: event.reason }); break;
      case 'short-pick': {
        count('short-pick', `${event.order.id} short of ${event.sku}`, faceNode(SKUS[event.sku].pick));
        if (plan.has('short-pick') && !shortCandidate) shortCandidate = { order: event.order.id, sku: event.sku };
        break;
      }
      default: break;
    }
  }

  /* ── Clock ────────────────────────────────────────────────────────────── */

  let facings: Record<DepartmentId, number> = { ...start.shop.facings };
  /** Whether the forklift is unloading a dock now, not waiting for room or held back. */
  function unloading(dock: DockId) {
    const forklift = simulation.actors().find(item => item.id === 'forklift');
    return forklift?.move?.kind === 'unload' && forklift.move.dock === dock && !forklift.waiting && !held.has('forklift');
  }
  function tick() {
    simulation.advance(STEP); step++;
    for (const event of inbox.splice(0)) receive(event);
    const snapshot = simulation.snapshot();
    // Cut-offs: every parcel of the carrier still in the building has missed it.
    for (const [carrier, at] of cutoffs) {
      if (step !== at) continue;
      const missed = snapshot.orders.filter(order => order.carrier === carrier);
      carriers.get(carrier)!.missed += missed.length;
      if (missed.length) count('missed-cutoff', `${missed.length} orders missed the ${carriers.get(carrier)!.name} cut-off`, SHIPPING_DOCK, missed.length);
      notify({ type: 'cutoff', carrier, missed: missed.length });
      for (const promise of vip.filter(value => value.carrier === carrier && !value.settled)) { promise.settled = true; if (vipFirst === promise.order) vipFirst = null; eventScore(-10, `Key customer ${promise.order} missed the cut-off`, SHIPPING_DOCK); }
    }
    // The outbound truck: when it docked, and when it left.
    const outbound = snapshot.docks.find(dock => dock.id === OUTBOUND)!, loading = outbound.status === 'loading';
    if (loading && !wasLoading) loadingSince = step;
    if (!loading && wasLoading) { const carrier = PARCEL_CARRIERS.find(item => item.name === outbound.partner); if (carrier) notify({ type: 'departed', carrier: carrier.id, sent }); sent = false; }
    wasLoading = loading;
    if (snapshot.shopOpen) for (const department of DEPARTMENTS) {
      const now = snapshot.shop.facings[department.id];
      if (now === 0 && facings[department.id] > 0) count('ran-empty', `${department.label} ran empty`, `gondola:${department.id}:0`);
    }
    facings = { ...snapshot.shop.facings };
    // A docked truck with pallets left costs while the forklift is not unloading it.
    truckSteps += snapshot.docks.filter(dock => dock.direction === 'inbound' && ((dock.status === 'expected' && dock.note === DOCK_WAITING_NOTE) || (dock.status === 'unloading' && !!dock.pallets && dock.pallets.done < dock.pallets.total)) && !unloading(dock.id)).length;
    while (truckSteps >= steps(PER_TRUCK)) { truckSteps -= steps(PER_TRUCK); count('truck-waiting', 'A truck waits on a dock'); }
    trigger();
    for (const event of [...open]) if (step >= steps(event.deadline)) settle(event, event.fallback, true);
    if (step >= end) {
      over = true;
      if (level.scenario === 'night' && !snapshot.alerts.length) count('stocked', 'Every pick face is above its minimum');
      notify({ type: 'shift-ended', report: report() });
    }
  }

  function report(): ShiftReport {
    return {
      level, seed, over, clock: clockAt(step), score: score(), carriers: [...carriers.values()].map(item => ({ ...item })),
      shipped: counts['on-time'] + counts.late, collected: counts.collected, putAway: counts['put-away'], ...moved, ranEmpty: counts['ran-empty'], shortPicks: counts['short-pick'],
      events: history.filter(event => event.answer).map(event => ({ kind: event.kind, choice: event.answer!.choice, auto: event.answer!.auto })),
    };
  }

  /* ── Commands ─────────────────────────────────────────────────────────── */

  const playing = () => { if (over) throw new Error('The shift is over.'); revision++; };
  function actorOf(id: string): ActorStatus {
    const all = simulation.actors(), found = all.find(item => item.id === id);
    if (!found) throw new Error(`Unknown actor: ${id}; actors on this shift: ${all.map(item => item.id).join(', ')}.`);
    return found;
  }
  const seconds = (at: number) => at === Infinity ? Infinity : at * STEP;
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
  function carrierStatus(): CarrierStatus[] {
    const snapshot = simulation.snapshot(), outbound = snapshot.docks.find(dock => dock.id === OUTBOUND);
    return PARCEL_CARRIERS.map(item => {
      const at = cutoffs.get(item.id);
      return { carrier: item.id, name: item.name, cutoff: item.cutoff, remaining: at === undefined || at < step ? null : (at - step) * STEP, open: snapshot.orders.filter(order => order.carrier === item.id).length, loading: outbound?.status === 'loading' && outbound.partner === item.name };
    });
  }
  return {
    level, seed,
    get time() { return step * STEP; },
    get clock() { return clockAt(step); },
    get over() { return over; },
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
    answer(id, choice) {
      playing();
      const event = open.find(item => item.id === id);
      if (!event) throw new Error(`No open event ${id}.`);
      if (!event.choices.some(item => item.id === choice)) throw new Error(`${event.title} has no choice ${choice}; choices: ${event.choices.map(item => item.id).join(', ')}.`);
      settle(event, choice, false);
    },
    actors,
    options,
    score,
    report,
    decisions: () => ({
      late: Object.fromEntries([...lateUntil].filter(([, at]) => at > step).map(([id, at]) => [id, seconds(at)])),
      stopped: Object.fromEntries([...down].filter(([, at]) => at > step).map(([id, at]) => [id, seconds(at)])),
      departing: sent,
    }),
    carriers: carrierStatus,
    events: () => [...open],
    snapshot: () => simulation.snapshot(),
    nodes: () => simulation.nodes(),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { listeners.clear(); simulation.dispose(); },
  };
}
