import type { SceneNode } from '@opsorama/core';
import { CARRIERS, DEPARTMENTS, minutesOf, type CarrierId, type CheckoutId, type DepartmentId, type DockId, type EcommerceScenario, type EcommerceSnapshot, type Order } from '../ecommerce/model';
import { DOCK_WAITING_NOTE, createEcommerceSimulation, type EcommerceDirector, type EcommerceEvent, type StaffMember, type StaffZone } from '../ecommerce/simulation';

/**
 * Cut-off: the player runs one shift of the e-commerce shop and warehouse.
 * Plain TypeScript without a renderer: commands in, `advance`, then score,
 * report, notices and scene nodes out. The same seed and the same commands at
 * the same times give the same shift.
 */

/** Seconds of play in a shift; one second is one minute on the shift clock, so eight hours take eight minutes. */
export const SHIFT_SECONDS = 480;
/** Rule step in seconds, the simulation's own step; every rule runs on whole steps. */
const STEP = .1;
const steps = (seconds: number) => Math.round(seconds / STEP);
/** Seconds an event waits for an answer before its default choice applies. */
export const ANSWER_SECONDS = 45;
/** A customer who finds this many people queuing leaves. */
const WALK_OUT_AT = 3;
/** Extra customers a store rush draws in. */
const RUSH_SHOPPERS = 8;

export interface ShiftLevel { scenario: EcommerceScenario; title: string; description: string; /** Shift clock at the start. */ start: string; }
export const SHIFT_LEVELS: Readonly<Record<EcommerceScenario, ShiftLevel>> = {
  steady: { scenario: 'steady', title: 'Quiet Tuesday', start: '10:00', description: 'One picker, one packer and a robot. Parcelo collects in the afternoon; no trucks to receive.' },
  peak: { scenario: 'peak', title: 'Peak', start: '10:00', description: 'A full crew, a busy shop, SwiftPost loading for its 11:30 cut-off and two inbound trucks.' },
  night: { scenario: 'night', title: 'Night shift', start: '22:00', description: 'The shop is closed. Receive, put away and replenish the pick faces for the morning.' },
};

/** Points per counted item; time costs count per started half hour (lanes) or quarter hour (waiting trucks) of the shift clock. */
export const POINTS = {
  'on-time': 10, late: 4, collected: 6, served: 2, 'put-away': 2,
  'missed-cutoff': -8, 'walked-out': -4, 'ran-empty': -5, 'short-pick': -3, 'lane-open': -1, 'truck-waiting': -1,
} as const;
export type ScoreId = keyof typeof POINTS | 'events';
const LABELS: Readonly<Record<ScoreId, string>> = {
  'on-time': 'Shipped before the cut-off', late: 'Shipped after the cut-off', collected: 'Click & collect handed over', served: 'Customers served', 'put-away': 'Pallets put away',
  'missed-cutoff': 'Orders that missed their cut-off', 'walked-out': 'Customers who left a queue', 'ran-empty': 'Departments that ran empty', 'short-pick': 'Short picks', 'lane-open': 'Checkout lane half hours', 'truck-waiting': 'Truck quarter hours on a dock', events: 'Event decisions',
};
/** Seconds of play per counted unit of a time cost. */
const PER_LANE = 30, PER_TRUCK = 15;

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
  /** The robot, order or dock it is about. */
  subject: string;
  answer?: { choice: string; at: number; auto: boolean };
}

export interface CarrierTotals { carrier: CarrierId; name: string; cutoff: string; onTime: number; late: number; missed: number; }
export interface ShiftReport {
  level: ShiftLevel; seed: number; over: boolean; clock: string;
  score: ShiftScore;
  carriers: readonly CarrierTotals[];
  shipped: number; collected: number; served: number; walkedOut: number; putAway: number; ranEmpty: number; shortPicks: number;
  events: readonly { kind: ShiftEventKind; choice: string; auto: boolean }[];
}

/** What the game reports as it runs; `time` is seconds of play. */
export type ShiftNotice = { time: number } & (
  | { type: 'event-opened'; event: ShiftEvent }
  | { type: 'event-answered'; event: ShiftEvent }
  | { type: 'scored'; line: ScoreId; points: number; text: string }
  | { type: 'cutoff'; carrier: CarrierId; missed: number }
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
  /** Advance by any number of seconds; the rules run in fixed steps, so the result does not depend on how it is sliced. Stops at the end of the shift. */
  advance(seconds: number): void;
  /** Move a person to a zone; they finish their current work first. */
  assign(person: string, zone: StaffZone): void;
  /** Put a carrier's orders, or one order, first; `null` clears every priority. */
  prioritize(target: CarrierId | string | null): void;
  setCheckout(lane: CheckoutId, open: boolean): void;
  /** Let the forklift unload the truck at an inbound dock: now, or as soon as the next one docks. */
  unloadTruck(dock: DockId): void;
  answer(event: string, choice: string): void;
  score(): ShiftScore;
  report(): ShiftReport;
  /** Open events, oldest first. */
  events(): readonly ShiftEvent[];
  snapshot(): EcommerceSnapshot;
  staff(): StaffMember[];
  nodes(): SceneNode[];
  subscribe(listener: (notice: ShiftNotice) => void): () => void;
  dispose(): void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clockOf = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const seeded = (seed: number) => () => { seed = seed + 0x6d2b79f5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/** Carriers that collect parcels; NordFreight's wrapped pallets stay static in the simulation. */
const PARCEL_CARRIERS = CARRIERS.filter(item => item.cages.length);
const IN_WORK: readonly Order['stage'][] = ['released', 'picking', 'sorting', 'packing'];

export function createShiftGame({ scenario = 'steady', seed = 1 }: { scenario?: EcommerceScenario; seed?: number } = {}): ShiftGame {
  const level = SHIFT_LEVELS[scenario], random = seeded(seed ^ 0x5eed), startMinute = minutesOf(level.start), end = steps(SHIFT_SECONDS);
  /** The step of each carrier's cut-off within this shift; carriers whose cut-off falls outside it have none. */
  const cutoffs = new Map(PARCEL_CARRIERS.flatMap(item => { const offset = (minutesOf(item.cutoff) - startMinute + 1440) % 1440; return offset <= SHIFT_SECONDS ? [[item.id, steps(offset)] as const] : []; }));
  let step = 0, carry = 0, over = false, nextEvent = 1;

  // The player's decisions, read by the director.
  const zoneWanted = new Map<string, StaffZone>(), orderFirst = new Set<string>();
  let carrierFirst: CarrierId | null = null, vipFirst: string | null = null;
  const laneWanted = new Map<CheckoutId, boolean>(), released = new Set<DockId>(), seenUnloading = new Set<DockId>();
  // Event effects, as steps until which they last.
  const down = new Map<string, number>(), lateUntil = new Map<DockId, number>();
  let rushUntil = -1, tempLanesUntil = -1;

  const director: EcommerceDirector = {
    zone: person => { const wanted = zoneWanted.get(person.id); return wanted && person.zones.includes(wanted) ? wanted : person.zone; },
    priority: order => (order.id === vipFirst ? 4 : 0) + (orderFirst.has(order.id) ? 2 : 0) + (order.carrier && order.carrier === carrierFirst ? 1 : 0),
    checkoutOpen: lane => step < tempLanesUntil || (laneWanted.get(lane.id) ?? lane.open),
    unload: dock => released.has(dock.id) && (lateUntil.get(dock.id) ?? 0) <= step,
    running: machine => (down.get(machine) ?? 0) <= step,
    shoppers: usual => step < rushUntil ? usual + RUSH_SHOPPERS : usual,
  };
  const inbox: EcommerceEvent[] = [];
  const simulation = createEcommerceSimulation(scenario, seed, { director, walkOutAt: WALK_OUT_AT, onEvent: event => inbox.push(event) });
  const start = simulation.snapshot();
  for (const lane of start.shop.checkouts) laneWanted.set(lane.id, lane.open);
  // A truck already unloading at the start keeps going.
  for (const dock of start.docks) if (dock.status === 'unloading') { released.add(dock.id); seenUnloading.add(dock.id); }

  /* ── Score ────────────────────────────────────────────────────────────── */

  const counts: Record<ScoreId, number> = { 'on-time': 0, late: 0, collected: 0, served: 0, 'put-away': 0, 'missed-cutoff': 0, 'walked-out': 0, 'ran-empty': 0, 'short-pick': 0, 'lane-open': 0, 'truck-waiting': 0, events: 0 };
  const carriers = new Map(PARCEL_CARRIERS.map(item => [item.id, { carrier: item.id, name: item.name, cutoff: item.cutoff, onTime: 0, late: 0, missed: 0 }]));
  let eventPoints = 0, laneSteps = 0, truckSteps = 0;
  const listeners = new Set<(notice: ShiftNotice) => void>();
  const notify = (notice: NoticeDetail) => { const timed = { ...notice, time: step * STEP } as ShiftNotice; listeners.forEach(listener => listener(timed)); };
  function count(line: keyof typeof POINTS, text: string, amount = 1) { counts[line] += amount; notify({ type: 'scored', line, points: POINTS[line] * amount, text }); }
  function eventScore(points: number, text: string) { counts.events++; eventPoints += points; notify({ type: 'scored', line: 'events', points, text }); }
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

  function openEvent(kind: ShiftEventKind, subject: string, title: string, text: string, choices: ShiftChoice[], fallback: string) {
    plan.delete(kind);
    const event: ShiftEvent = { id: `event-${nextEvent++}`, kind, title, text, opened: step * STEP, deadline: (step + steps(ANSWER_SECONDS)) * STEP, choices, fallback, subject };
    open.push(event); history.push(event);
    if (kind === 'robot-breakdown') down.set(subject, Infinity);
    if (kind === 'late-truck') lateUntil.set(subject as DockId, Infinity);
    if (kind === 'store-rush') rushUntil = step + steps(90);
    notify({ type: 'event-opened', event });
  }
  function trigger() {
    for (const [kind, at] of [...plan]) {
      if (step < at) continue;
      const snapshot = simulation.snapshot();
      if (kind === 'robot-breakdown') openEvent(kind, 'robot:0', 'Robot down', 'Robot 1 stopped at the conveyor.', [
        { id: 'repair', label: 'Call the technician', effect: 'Back in 30 minutes; costs 15 points.' }, { id: 'wait', label: 'Run on one robot less', effect: 'Back 150 minutes after the breakdown; no cost.' }], 'wait');
      if (kind === 'store-rush') openEvent(kind, 'shop', 'Store rush', 'A coach party is heading for the shop.', [
        { id: 'temp', label: 'Call in temporary cashiers', effect: 'Costs 6 points; every lane is open for the rush.' }, { id: 'ride', label: 'Keep the lanes as they are', effect: 'No cost; long queues make customers leave.' }], 'ride');
      if (kind === 'late-truck') {
        const dock = snapshot.docks.find(item => item.direction === 'inbound' && item.status === 'expected');
        if (dock) openEvent(kind, dock.id, 'Late truck', `${dock.reference} from ${dock.partner} is running late for dock ${dock.id}.`, [
          { id: 'expedite', label: 'Pay for a priority slot', effect: 'Costs 10 points; unload it whenever you choose.' }, { id: 'wait', label: 'Let it come late', effect: 'No cost; it cannot unload for 90 minutes.' }], 'wait');
      }
      if (kind === 'short-pick' && shortCandidate) {
        const order = snapshot.orders.find(item => item.id === shortCandidate!.order);
        if (order && (order.stage === 'released' || order.stage === 'picking')) openEvent(kind, order.id, 'Short pick', `Order ${order.id} waits: ${shortCandidate.sku} is out at its pick face.`, [
          { id: 'cancel', label: 'Cancel the order', effect: 'Costs 6 points now; it cannot miss a cut-off.' }, { id: 'wait', label: 'Wait for stock', effect: 'No cost now; it may miss its cut-off.' }], 'wait');
        shortCandidate = null;
      }
      if (kind === 'vip-order') {
        // A new parcel order, or else the oldest parcel order still in work that can make its cut-off.
        const ahead = (order: Order) => order.carrier !== undefined && (cutoffs.get(order.carrier) ?? -1) > step + steps(60);
        const order = snapshot.orders.find(item => item.id === vipCandidate) ?? snapshot.orders.find(item => IN_WORK.includes(item.stage) && ahead(item)), name = order?.carrier && carriers.get(order.carrier)!.name;
        vipCandidate = null;
        if (order && name) openEvent(kind, order.id, 'Key customer', `Order ${order.id} is for a key customer and goes with ${name}.`, [
          { id: 'first', label: 'Promise it first', effect: 'Pickers take it first; +20 if it ships before the cut-off, -20 if not.' }, { id: 'decline', label: 'Handle it normally', effect: 'No promise, no bonus.' }], 'decline');
      }
    }
  }
  function settle(event: ShiftEvent, choice: string, auto: boolean) {
    event.answer = { choice, at: step * STEP, auto };
    open.splice(open.indexOf(event), 1);
    const opened = steps(event.opened);
    switch (`${event.kind}:${choice}`) {
      case 'robot-breakdown:repair': down.set(event.subject, step + steps(30)); eventScore(-15, 'Technician called'); break;
      case 'robot-breakdown:wait': down.set(event.subject, opened + steps(150)); break;
      case 'late-truck:expedite': lateUntil.delete(event.subject as DockId); eventScore(-10, 'Priority slot paid'); break;
      case 'late-truck:wait': lateUntil.set(event.subject as DockId, opened + steps(90)); break;
      case 'store-rush:temp': tempLanesUntil = rushUntil; eventScore(-6, 'Temporary cashiers'); break;
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
          count(timely ? 'on-time' : 'late', `${order.id} shipped`);
          const promise = vip.find(value => value.order === order.id && !value.settled);
          if (promise) { promise.settled = true; if (vipFirst === order.id) vipFirst = null; if (timely) eventScore(20, `Key customer ${order.id} shipped in time`); }
        }
        break;
      case 'ordered': if ((plan.get('vip-order') ?? Infinity) <= step && !vipCandidate && event.order.carrier && (cutoffs.get(event.order.carrier) ?? -1) > step + steps(60)) vipCandidate = event.order.id; break;
      case 'collected': count('collected', `${event.order.id} collected`); break;
      case 'served': count('served', `Customer served at checkout ${event.lane.slice(1)}`); break;
      case 'walked-out': count('walked-out', `A customer left checkout ${event.lane.slice(1)}`); break;
      case 'put-away': count('put-away', `Pallet put away to ${event.rack}`); break;
      case 'short-pick': count('short-pick', `${event.order.id} short of ${event.sku}`); if (plan.has('short-pick') && !shortCandidate) shortCandidate = { order: event.order.id, sku: event.sku }; break;
    }
  }

  /* ── Clock ────────────────────────────────────────────────────────────── */

  let facings: Record<DepartmentId, number> = { ...start.shop.facings };
  function tick() {
    simulation.advance(STEP); step++;
    for (const event of inbox.splice(0)) receive(event);
    const snapshot = simulation.snapshot();
    // Cut-offs: every parcel of the carrier still in the building has missed it.
    for (const [carrier, at] of cutoffs) {
      if (step !== at) continue;
      const missed = snapshot.orders.filter(order => order.carrier === carrier);
      carriers.get(carrier)!.missed += missed.length;
      if (missed.length) count('missed-cutoff', `${missed.length} orders missed the ${carriers.get(carrier)!.name} cut-off`, missed.length);
      notify({ type: 'cutoff', carrier, missed: missed.length });
      for (const promise of vip.filter(value => value.carrier === carrier && !value.settled)) { promise.settled = true; if (vipFirst === promise.order) vipFirst = null; eventScore(-20, `Key customer ${promise.order} missed the cut-off`); }
    }
    if (snapshot.shopOpen) for (const department of DEPARTMENTS) {
      const now = snapshot.shop.facings[department.id];
      if (now === 0 && facings[department.id] > 0) count('ran-empty', `${department.label} ran empty`);
    }
    facings = { ...snapshot.shop.facings };
    // Time costs: open lanes, and trucks standing on a dock without unloading.
    laneSteps += snapshot.shopOpen ? snapshot.shop.checkouts.filter(lane => lane.open).length : 0;
    while (laneSteps >= steps(PER_LANE)) { laneSteps -= steps(PER_LANE); count('lane-open', 'Checkout lanes staffed'); }
    for (const dock of snapshot.docks) {
      if (dock.status === 'unloading') seenUnloading.add(dock.id);
      if (dock.status === 'free' && seenUnloading.delete(dock.id)) released.delete(dock.id);
    }
    truckSteps += snapshot.docks.filter(dock => (dock.status === 'expected' && dock.note === DOCK_WAITING_NOTE) || (dock.status === 'unloading' && !director.unload(dock))).length;
    while (truckSteps >= steps(PER_TRUCK)) { truckSteps -= steps(PER_TRUCK); count('truck-waiting', 'A truck waits on a dock'); }
    trigger();
    for (const event of [...open]) if (step >= steps(event.deadline)) settle(event, event.fallback, true);
    if (step >= end) { over = true; notify({ type: 'shift-ended', report: report() }); }
  }

  function report(): ShiftReport {
    return {
      level, seed, over, clock: clockOf(startMinute + Math.floor(step * STEP)), score: score(), carriers: [...carriers.values()].map(item => ({ ...item })),
      shipped: counts['on-time'] + counts.late, collected: counts.collected, served: counts.served, walkedOut: counts['walked-out'], putAway: counts['put-away'], ranEmpty: counts['ran-empty'], shortPicks: counts['short-pick'],
      events: history.filter(event => event.answer).map(event => ({ kind: event.kind, choice: event.answer!.choice, auto: event.answer!.auto })),
    };
  }

  /* ── Commands ─────────────────────────────────────────────────────────── */

  const playing = () => { if (over) throw new Error('The shift is over.'); };
  return {
    level, seed,
    get time() { return step * STEP; },
    get clock() { return clockOf(startMinute + Math.floor(step * STEP)); },
    get over() { return over; },
    advance(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Advance requires a finite, non-negative number of seconds.');
      carry += seconds;
      while (!over && carry >= STEP - 1e-9) { carry -= STEP; tick(); }
      if (over) carry = 0;
    },
    assign(id, zone) {
      playing();
      const person = simulation.staff().find(item => item.id === id);
      if (!person) throw new Error(`Unknown person: ${id}.`);
      if (zone !== person.zone && !person.zones.includes(zone)) throw new Error(`${person.label} cannot move to ${zone} now; possible zones: ${person.zones.join(', ')}.`);
      zoneWanted.set(id, zone);
    },
    prioritize(target) {
      playing();
      if (target === null) { carrierFirst = null; orderFirst.clear(); return; }
      if (PARCEL_CARRIERS.some(item => item.id === target)) { carrierFirst = target as CarrierId; return; }
      const order = simulation.snapshot().orders.find(item => item.id === target);
      if (!order || !IN_WORK.includes(order.stage)) throw new Error(`${target} is neither a parcel carrier nor an order still in work.`);
      orderFirst.add(order.id);
    },
    setCheckout(lane, value) {
      playing();
      const snapshot = simulation.snapshot();
      if (!snapshot.shopOpen) throw new Error('The shop is closed on this shift.');
      if (!snapshot.shop.checkouts.some(item => item.id === lane)) throw new Error(`Unknown checkout: ${lane}.`);
      laneWanted.set(lane, value);
    },
    unloadTruck(id) {
      playing();
      const dock = simulation.snapshot().docks.find(item => item.id === id);
      if (!dock || dock.direction !== 'inbound') throw new Error(`${id} is not an inbound dock.`);
      // Before a booking, the permission waits for the next truck at this dock.
      released.add(id);
    },
    answer(id, choice) {
      playing();
      const event = open.find(item => item.id === id);
      if (!event) throw new Error(`No open event ${id}.`);
      if (!event.choices.some(item => item.id === choice)) throw new Error(`${event.title} has no choice ${choice}; choices: ${event.choices.map(item => item.id).join(', ')}.`);
      settle(event, choice, false);
    },
    score,
    report,
    events: () => [...open],
    snapshot: () => simulation.snapshot(),
    staff: () => simulation.staff(),
    nodes: () => simulation.nodes(),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { listeners.clear(); simulation.dispose(); },
  };
}
