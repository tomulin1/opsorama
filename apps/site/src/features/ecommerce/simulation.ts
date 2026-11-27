import { behaviorNode, createBehaviorRunner, createSceneStore, itemNode, type AgentState, type AssetNode, type BehaviorAgent, type BehaviorEvent, type BehaviorStep, type CarryRule, type ItemPlacement, type SceneNode, type SceneStore, type Vec3 } from '@opsorama/core';
import type { PickTarget } from '@opsorama/three';
import { assetHandling, handlingProfiles, finalForkPose, forkMoveSeconds, personHairColor, type ForkMotion, type ForkMove, type ForkPose } from '@opsorama/objects';
import { createHandlingState, handlingItemPolicy, type AssetHandling, type FloorPlacement } from '@opsorama/objects/handling';
import {
  BIKE_CAPACITY, CARRIERS, DEPARTMENTS, departmentCapacity, LOCATIONS, OUTLETS, SCENARIOS, SKUS, cageOutlet, carrier as carrierOf, heldAt, location, minutesOf, orderOutlet, outlet as outletOf, reserveOf, skuGoods, stagedAt, stagedFor,
  type ActivityEvent, type CarrierId, type Checkout, type CheckoutId, type DepartmentId, type Dock, type DockId, type EcommerceScenario, type EcommerceSnapshot, type LocationId, type Order, type OutletId, type PackStationId, type PutWallId, type StockAlert, type UnitKind, type UnitRecord,
} from './model';
import {
  APRON_Y, BELT_END_X, BELT_Y, BELT_Z, BIKE_AT, BIKE_FROM_WEST, BIKE_GONE_EAST, CAGE_X, CART_AT_INDUCT, OUTLET_CAGE_X, OUTLET_DROPS, cageAt, CHECKOUT_X, DEFAULT_ZOOM, DOCK_Z, FEMININE, FLOOR_Y, GONDOLAS, PACK_X, PALLET_STACK, PUT_WALL_X, RACK_LEVELS, ROBOT_DECK, SHOPPERS, STACKED_PALLET, STAFF, STAGING_SPOTS, TRUCK_X, YARD_X,
  ALONG_Z, CART_CORRAL, RACK_TURN, dockMouth, ecommerceNodes, ecommerceSlots, queuePoints, replenishSpot, warehouseNavigation,
} from './scene';

/** Fixed simulation step in seconds, so the outcome does not depend on the frame rate. */
const STEP = .1;
/** Simulated seconds per minute on the site clock. */
const SECONDS_PER_MINUTE = 15;
/** Cartons on a full pallet; each decanted carton fills one lane and adds `UNITS_PER_CARTON` sellable units. */
const PALLET_CARTONS = 9, UNITS_PER_CARTON = 3, PALLETS_PER_TRUCK = 6;
/** Where a roll cage stands at the outbound dock while it is loaded, for its ghost. */
const DOCK_LOAD_X = 21.9;
const DEFAULT_ON_HAND = 24, DEFAULT_MIN = 10;
/** A department gets a restock below this many facings, and one carton adds this many. */
/** The automatic shelf filler restocks a department below this share of its capacity. */
const RESTOCK_BELOW = .625, FACINGS_PER_CARTON = 8;
const SHOPPER_POOL = 18, MAX_OPEN_WORK = 14;
/** Where the customers already on their way to click & collect stand when the shift starts. */
const STARTING_COLLECT = ['collect-front', 'door-in'] as const;
/** Seconds between two customers setting off from the street, which is about 3 m at their walking speed. */
const ENTRY_GAP = 2.5;
/** The feed stops booking deliveries at this many pallets in reserve, which keeps the scene's node count bounded. */
const MAX_RESERVE_PALLETS = 60;
/** Seconds a person takes to pass a unit, and how far they reach in metres; nothing changes place without a person or machine at it. */
const HAND_OVER = .35, HAND_REACH = 1.3;
/**
 * Fork heights: resting on the floor (also how an empty truck travels) and loaded
 * travel; a load clears its support by `FORK_CLEARANCE`. Forks lift at `FORK_SPEED`
 * m/s and reach at `REACH_SPEED` m/s. `LOAD_ANCHOR` is the height of the load anchor
 * on a model at travel height, and `FORK_REACH` the forward reach into a rack.
 */
const FORK_FLOOR = -.23, FORK_TRAVEL = 0, FORK_CLEARANCE = .12, FORK_SPEED = 1, REACH_SPEED = 1, LOAD_ANCHOR = .23, FORK_REACH = 1;
/** Empty pallets the stack holds; a truck takes this many back when it leaves. */
const MAX_EMPTY_PALLETS = 12, PALLETS_RETURNED = 2;
const BELT_SPEED = .9, BELT_SPACING = .75;
const SCALES: Readonly<Record<UnitKind, Vec3>> = { pallet: [1, 1, 1], tote: [.475, .475, .475], carton: [.4, .4, .4], parcel: [.4, .4, .4], bag: [.4, .4, .4] };
const ASSETS: Readonly<Record<UnitKind, string>> = { pallet: 'pallet', tote: 'tote', carton: 'parcel', parcel: 'parcel', bag: 'bag' };
/** Where each department's stock is picked: one pick face per type of goods. */
const DEPARTMENT_FACES: Readonly<Record<DepartmentId, LocationId>> = { kitchen: 'F1', home: 'F2', outdoor: 'F3', toys: 'F4', tech: 'S1', sport: 'S2' };
/** The moves from one fork pose through the next ones, timed by distance. */
function forkMoves(from: ForkPose, ...poses: readonly ForkPose[]): ForkMove[] {
  let previous = from;
  return poses.map(pose => { const seconds = Math.max(.25, Math.abs(pose.height - previous.height) / FORK_SPEED + Math.abs((pose.reach ?? 0) - (previous.reach ?? 0)) / REACH_SPEED); previous = pose; return { ...pose, seconds }; });
}
/** A reach truck at a support `level` metres above the floor: forks under the load there, and just above it. */
const reachPoses = (level: number) => ({ under: level - LOAD_ANCHOR, clear: level - LOAD_ANCHOR + FORK_CLEARANCE });
/** Take a load: raise the empty forks, reach under it. After the exchange: lift it clear, pull it in, lower to travel height. */
function reachTake(level: number) {
  const { under, clear } = reachPoses(level);
  return { before: forkMoves({ height: FORK_FLOOR }, { height: under }, { height: under, reach: FORK_REACH }), after: forkMoves({ height: under, reach: FORK_REACH }, { height: clear, reach: FORK_REACH }, { height: clear }, { height: FORK_TRAVEL }) };
}
/** Put a load: raise it, reach over the place, lower onto it. After the exchange: pull the empty forks out and lower them. */
function reachPut(level: number) {
  const { under, clear } = reachPoses(level);
  return { before: forkMoves({ height: FORK_TRAVEL }, { height: clear }, { height: clear, reach: FORK_REACH }, { height: under, reach: FORK_REACH }), after: forkMoves({ height: under, reach: FORK_REACH }, { height: under }, { height: FORK_FLOOR }) };
}
const FACE_DEPARTMENT = Object.fromEntries(Object.entries(DEPARTMENT_FACES).map(([department, face]) => [face, department])) as Partial<Record<LocationId, DepartmentId>>;
const RACKS = LOCATIONS.filter(value => value.kind === 'rack').map(value => value.id);
const FACES = LOCATIONS.filter(value => value.kind !== 'rack').map(value => value.id);
/** The moves each role makes. */
const ROLE_MOVES: Readonly<Record<ActorRole, readonly MoveKind[]>> = { forklift: ['unload'], 'reach-truck': ['put-away', 'replenish', 'clear'], replenisher: ['decant'], 'shelf-filler': ['restock'], dispatcher: ['ship'] };
const ZONE_ROLES: Partial<Record<StaffZone, ActorRole>> = { replenishing: 'replenisher', restocking: 'shelf-filler', dispatch: 'dispatcher' };
const departmentLabel = (id: DepartmentId) => DEPARTMENTS.find(item => item.id === id)!.label;
/** The note of an inbound dock whose truck stands docked until the director lets it unload. */
export const DOCK_WAITING_NOTE = 'Docked; waits for the unload.';
/** People who carry by hand and can move between these zones. */
const HAND_ZONES: readonly StaffZone[] = ['packing', 'replenishing', 'restocking'];
/** Names for a checkout that opens without its own cashier. */
const CASHIERS = ['Mira', 'Jonas', 'Ada', 'Noor'];
const SUPPLIERS = ['Baltic Home Supply', 'Toyworks', 'Nordic Outdoor', 'Volt & Co'];
const CUSTOMERS = ['M. Larsen', 'A. Okafor', 'J. Petrov', 'S. Haddad', 'L. Moreau', 'K. Tanaka', 'R. Silva', 'E. Novak', 'T. Brennan', 'I. Rossi'];

/** One job of one agent. Hooks are keyed by step index. */
interface Task {
  what: string;
  steps: readonly BehaviorStep[];
  /** Run when the interaction of that step starts or ends. */
  started?: Readonly<Record<number, () => void>>;
  ended?: Readonly<Record<number, () => void>>;
  /** Run at the simulation time a unit of that step changes hands. */
  items?: Readonly<Record<number, () => void>>;
  done?: () => void;
  /** The commanded move this task is part of. */
  move?: Move;
}
interface Unit { kind: UnitKind; label: string; sku?: string; orderId?: string; /** Cartons left on a pallet. */ load?: number; /** Waiting unseen for its hand-over. */ hidden?: boolean; /** Riding the conveyor. */ ride?: { points: readonly Vec3[]; start: number }; }
interface Truck { docked: boolean; color: string; }
interface Shopper {
  inside: boolean; items: number; basket: boolean;
  /** The department of the last item taken, which the basket or cart shows. */ goods?: DepartmentId;
  /** The corral place of the shopper's cart, kept from arrival until the cart is back. */ corral?: number;
  /** Whether the shopper pushes the cart now: from taking it until returning it. */ pushing?: boolean;
}
interface Replenishment { pallet: string; sku: string; ready: boolean; /** Cartons people are on their way to take. */ promised: number; }

/**
 * Where a person works. Machines (forklift, reach truck, robots) keep their roles.
 * Pickers push a picking cart and only pick, sorters stand behind their put wall,
 * and the dispatcher pushes roll cages, so each of them has one zone; the people
 * who carry by hand (packers, the replenisher and the shelf filler) can move
 * between packing, replenishing and restocking.
 */
export type StaffZone = 'picking' | 'sorting' | 'packing' | 'replenishing' | 'restocking' | 'dispatch';
export interface StaffMember {
  /** Agent and scene node ID. */
  id: string;
  label: string;
  zone: StaffZone;
  /** Zones the person can move to now; packing needs a free bench. */
  zones: readonly StaffZone[];
  /** The packing bench or put wall the person works at. */
  station?: PackStationId | PutWallId;
  /** Doing a task, or owning unfinished work: a person changes zone only when this is false. */
  busy: boolean;
}
/**
 * The decisions of a shift, asked by the simulation as it runs. Every answer is
 * read again later, so a director changes its mind by answering differently.
 */
export interface EcommerceDirector {
  /** The zone a person works in next; asked whenever the person is free, and applied before their next task. */
  zone(person: StaffMember): StaffZone;
  /** Pickers and packers take orders with a higher priority first; equal priorities keep the order of arrival. */
  priority(order: Order): number;
  /** Whether a checkout lane should be open. A closing lane takes no new customers and closes once its queue is served. */
  checkoutOpen(lane: Checkout): boolean;
  /** Whether the forklift may unload the truck at an inbound dock now. A docked truck waits until it may. */
  unload(dock: Dock): boolean;
  /** Whether a machine (forklift, reach truck or a robot) is running; a stopped one finishes its task, then takes no new one and shows as critical. */
  running(machine: string): boolean;
  /** How many customers the shop draws in at once; `usual` is the scenario's number. */
  shoppers(usual: number): number;
  /**
   * The next move of a commanded actor, asked whenever it is free, so also between the tasks of a repeating move. `auto` returns
   * the move the automatic director would choose. Return the same move again to continue it, another to switch, and undefined to
   * stay idle. A move that ended (`move-ended`) is reported before the actor asks again.
   */
  job(actor: ActorRef, auto: () => Move | undefined): Move | undefined;
  /** Whether the truck loading at the outbound dock leaves now; asked every step while no roll cage is on its way to it. */
  depart(dock: Dock): boolean;
}
/** The automatic director of the dashboard: everyone keeps their zone, orders go first come, first served, lanes stay as they are and trucks unload on arrival. */
export const automaticDirector: EcommerceDirector = { zone: person => person.zone, priority: () => 0, checkoutOpen: lane => lane.open, unload: () => true, running: () => true, shoppers: usual => usual, job: (_actor, auto) => auto(), depart: () => false };

/**
 * The people and machines whose moves of material a director commands: the forklift, the reach truck, and whoever works in the
 * replenishing (replenisher), restocking (shelf filler) or dispatch (dispatcher) zone.
 */
export type ActorRole = 'forklift' | 'reach-truck' | 'replenisher' | 'shelf-filler' | 'dispatcher';
export interface ActorRef { id: string; role: ActorRole; label: string; }
/**
 * One move of material. `unload`, `decant` and `restock` from a pick face repeat, one pallet or carton per task, until their
 * source is empty or their target full; the others take one task. Targets are booked when a task starts.
 */
export type Move =
  /** Forklift: the next pallet off the truck at an inbound dock into the first free staging spot, until the truck is empty. */
  | { kind: 'unload'; dock: DockId }
  /**
   * Reach truck: a pallet in staging into a rack, at its lowest free position, or on `level` (0 is the floor level), at `position`
   * on it (0 or 1). A place taken by the time the task starts falls back to the rack's lowest free place.
   */
  | { kind: 'put-away'; pallet: string; rack: LocationId; level?: number; position?: number }
  /** Reach truck: a pallet in a rack to the replenishment spot behind the pick face of its SKU. */
  | { kind: 'replenish'; pallet: string }
  /** Reach truck: the empty pallet behind a pick face to the empty-pallet stack. */
  | { kind: 'clear'; face: LocationId }
  /** Replenisher: cartons from the pallet behind a pick face into its lanes, until the pallet is empty. */
  | { kind: 'decant'; face: LocationId }
  /** Shelf filler: cartons from the department's pick face to its gondolas until they are full or the face reaches its minimum, or one shop transfer. */
  | { kind: 'restock'; department: DepartmentId; source: 'face' | 'transfer' }
  /**
   * Dispatcher: a roll cage's parcels onto the truck of its carrier at the outbound dock, or, with the sales channels, an outlet
   * cage's parcels to its outlet: the click & collect counter, the parcel lockers or the delivery bike, as many as it has room for.
   */
  | { kind: 'ship'; cage: string };
export type MoveKind = Move['kind'];
/** Whether a move can start now: `wait` means it can once there is room, and the actor waits for it. */
export type MoveCheckResult = { ok: true } | { ok: false; wait: boolean; reason: string };
/** A possible move for a subject, ranked best first. `target` names the target, e.g. "R04 · level 2 · Outdoor". */
export interface MoveOption {
  move: Move; target: string;
  /** Why the actor would wait before starting it, when it would. */ waits?: string;
  /**
   * Where the material would stand, as renderer pick targets with a ghost of it: a pallet, carton or roll cage at its place
   * in the rack, staging lane, stack, lanes, gondola or dock. One per target node (a restock has one per gondola), in the
   * order of the move's target nodes; none while the move would wait.
   */
  previews?: readonly PickTarget[];
}
/** A target the subject may not go to, with the reason, e.g. for a menu that explains what is missing. */
export interface MoveRefusal { kind: MoveKind; target: string; reason: string; }
export interface MoveChoices { options: readonly MoveOption[]; refused: readonly MoveRefusal[]; }
/** A commanded actor now: its task, the move it works on, and what it waits for. */
export interface ActorStatus extends ActorRef { task?: string; move?: Move; waiting?: string; }
/** How a move ended: its one task done, its source `emptied` or its target `filled`, or `refused` when it could not start. */
export type MoveOutcome = 'done' | 'emptied' | 'filled' | 'refused';

export interface EcommerceSimulationOptions {
  /** Decisions that replace the automatic ones; the rest stay automatic. */
  director?: Partial<EcommerceDirector>;
  /**
   * Storage has limits: deliveries bring no more pallets than the racks have free positions, and pick-face lanes take no more
   * cartons than they hold. Any pallet may go into any free rack position. Off for the dashboard.
   */
  capacityRules?: boolean;
  /** The outbound truck leaves only when the director's `depart` says so; the automatic dispatcher then never sends it. */
  directorDeparts?: boolean;
  /** A customer who finds this many people queuing at their lane leaves without paying. Without it, everyone queues. */
  walkOutAt?: number;
  /**
   * The shop sells parcels through its own outlets too (`OUTLETS`): new orders go to the click & collect counter, the parcel
   * lockers, the delivery bike or a carrier's truck. Packers put each parcel into the roll cage of its outlet, and only the
   * dispatcher takes a cage to its outlet. Customers collect at the counter and the lockers, and the bike leaves on its rounds with
   * what is loaded. Orders come more often. Off for the dashboard.
   */
  salesChannels?: boolean;
  /** Receives every event from the start, including those of the starting dispatch; `subscribe` adds listeners later. */
  onEvent?: (event: EcommerceEvent) => void;
}
/** What happened in the shift, for a host that keeps score. `time` is the simulation time in seconds. */
export type EcommerceEvent = { time: number } & (
  | { type: 'ordered'; order: Order }
  | { type: 'shipped'; carrier: CarrierId; orders: readonly Order[] }
  /** A customer collected an order at the click & collect counter or, with the sales channels, from the parcel lockers. */
  | { type: 'collected'; order: Order }
  /** A customer paid at a checkout for the `items` in the basket. */
  | { type: 'served'; lane: CheckoutId; items: number }
  /** Sales channels: the dispatcher brought parcels to an outlet. */
  | { type: 'delivered'; outlet: OutletId; orders: readonly Order[] }
  /** Sales channels: the delivery bike left on a round with these parcels. */
  | { type: 'bike-left'; orders: readonly Order[] }
  | { type: 'walked-out'; lane: CheckoutId }
  /** An order the pickers had to skip for lack of stock; reported once per order. */
  | { type: 'short-pick'; order: Order; sku: string }
  | { type: 'put-away'; pallet: string; sku: string; rack: LocationId }
  /** A pallet came off a truck into staging. */
  | { type: 'unloaded'; dock: DockId; pallet: string; sku: string }
  /** A carton filled a lane of a pick face. */
  | { type: 'replenished'; face: LocationId; sku: string }
  /** A carton filled a gondola; `transfer` when it was a shop transfer. */
  | { type: 'restocked'; department: DepartmentId; sku: string; transfer: boolean }
  /** A commanded move could not continue; emitted before the actor asks for its next job. */
  | { type: 'move-ended'; actor: string; move: Move; outcome: MoveOutcome; reason: string }
  /** A move waits for room; emitted once when the wait starts. */
  | { type: 'move-waiting'; actor: string; move: Move; reason: string }
);
/** One event without its time, for each member of the union. */
type EventDetail = EcommerceEvent extends infer E ? E extends EcommerceEvent ? Omit<E, 'time'> : never : never;

export interface EcommerceSimulation {
  /** Simulated seconds since the start. */
  readonly time: number;
  /** Bumped whenever scene nodes change; publish `nodes()` when it moves. */
  readonly sceneRevision: number;
  /** Bumped whenever records change; read `snapshot()` when it moves. */
  readonly recordsRevision: number;
  /** Advance by any number of seconds; the simulation runs in fixed steps, so the result does not depend on how it is sliced. */
  advance(seconds: number): void;
  snapshot(): EcommerceSnapshot;
  nodes(): SceneNode[];
  /** The people on shift, with their zones. */
  staff(): StaffMember[];
  /** Receive the shift's events as they happen. */
  subscribe(listener: (event: EcommerceEvent) => void): () => void;
  /** Cancel an order nobody is working on (released, or waiting to be picked); returns whether it was cancelled. */
  cancel(orderId: string): boolean;
  /** The commanded actors on shift, with what they do now. */
  actors(): ActorStatus[];
  /** Whether `actor` could start `move` now, with the reason when not. Throws for an unknown actor. */
  check(actor: string, move: Move): MoveCheckResult;
  /**
   * The moves `actor` can make with a subject, best target first, and the targets it may not use with their reasons. Subjects are
   * scene node IDs: `dock:D1` (or `truck:D1`), `pallet:…`, a pick face (`flow:F1`, `flow:S1`, `replen:F1`), a gondola
   * (`gondola:kitchen:0`) and a roll cage (`cage:swift-1`). A subject the actor's role does not handle gives no choices.
   */
  moves(actor: string, subject: string): MoveChoices;
  dispose(): void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const seeded = (seed: number) => () => { seed = seed + 0x6d2b79f5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const above = ([x, y, z]: Vec3, height: number): Vec3 => [x, y + height, z];
const cageHome = (cage: string): Vec3 => cageAt(cage);
const pathLength = (points: readonly Vec3[]) => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1], point[2] - points[i][2]), 0);

/**
 * The mock feed: a seeded shift that starts from a scenario snapshot and keeps
 * going. Pallets, totes, cartons, parcels, bags and roll cages are real units in
 * one `HandlingState`, moved by agents in one behavior runner, so a record changes
 * when the object arrives: rack occupancy when the pallet lands, an order's stage
 * when its tote reaches the put wall. Count-based fixtures (flow lanes, gondolas,
 * put walls, cages, the counter) absorb a unit on arrival and show it in their
 * count. A real host replaces this file with its WMS and shop events.
 *
 * A director makes the shift's decisions: who works where, which orders go
 * first, which checkouts are open and when trucks unload. The automatic one
 * runs the dashboard; a game passes its own.
 */
export function createEcommerceSimulation(scenario: EcommerceScenario = 'peak', seed = 7, options: EcommerceSimulationOptions = {}): EcommerceSimulation {
  const director: EcommerceDirector = { ...automaticDirector, ...options.director };
  const start = SCENARIOS[scenario], random = seeded(seed), pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  let records: EcommerceSnapshot = start, recordsRevision = 0, sceneRevision = 0, cached: EcommerceSnapshot | null = null;
  let carry = 0, serial = 1000, nextOrder = Math.max(...start.orders.map(order => Number(order.id.slice(1)))) + 1, nextEvent = 1, nextReference = 7800, minute = minutesOf(start.time);
  const units = new Map<string, Unit>(), tasks = new Map<string, Task>(), timers: { at: number; run: () => void }[] = [], inbox: BehaviorEvent[] = [];
  const onHand: Record<string, number> = Object.fromEntries(Object.keys(SKUS).map(sku => [sku, start.alerts.find(alert => alert.sku === sku)?.onHand ?? DEFAULT_ON_HAND]));
  const minimum: Record<string, number> = Object.fromEntries(Object.keys(SKUS).map(sku => [sku, start.alerts.find(alert => alert.sku === sku)?.min ?? DEFAULT_MIN]));
  /** Sellable units on each pick face; one filled lane stands for `UNITS_PER_CARTON`. */
  const faceUnits: Record<string, number> = Object.fromEntries(LOCATIONS.filter(value => value.kind !== 'rack').map(value => [value.id, start.occupancy[value.id] * UNITS_PER_CARTON]));
  const claimed = new Set<string>(), staging: (string | null)[] = STAGING_SPOTS.map(() => null), stagingBooked = new Set<number>(), replenishing = new Map<string, Replenishment>(), belt: { tote: string; place: number; arrived: boolean }[] = [];
  const truckLoads = new Map<DockId, string[]>(), trucks = new Map<DockId, Truck>(), carts: Record<string, number> = {}, shoppers = new Map<string, Shopper>(), transfers: DepartmentId[] = [], forks = new Map<string, ForkMotion>();
  let outboundTrips = 0, bookedCage: string | null = null, lastEntry = -Infinity;
  /** The sales channels: outlet cages, lockers with real orders, and the delivery bike's rounds. */
  const channels = !!options.salesChannels;
  /** Docked inbound trucks waiting for the director, lanes closing once served, and the lane each paying customer heads for. */
  const holding = new Set<DockId>(), closing = new Set<CheckoutId>(), heading = new Map<string, CheckoutId>();
  const listeners = new Set<(event: EcommerceEvent) => void>(options.onEvent ? [options.onEvent] : []), shortReported = new Set<string>();
  const emit = (event: EventDetail) => { if (listeners.size) { const timed = { ...event, time: runner.time } as EcommerceEvent; listeners.forEach(listener => listener(timed)); } };

  /* ── Records ──────────────────────────────────────────────────────────── */

  const touchRecords = () => { recordsRevision++; sceneRevision++; cached = null; };
  const patch = (next: Partial<EcommerceSnapshot>) => { records = { ...records, ...next }; touchRecords(); };
  const patchShop = (next: Partial<EcommerceSnapshot['shop']>) => patch({ shop: { ...records.shop, ...next } });
  const patchOrder = (id: string, next: Partial<Order>) => patch({ orders: records.orders.map(order => order.id === id ? { ...order, ...next } : order) });
  const dropOrders = (ids: readonly string[]) => patch({ orders: records.orders.filter(order => !ids.includes(order.id)) });
  const patchDock = (id: DockId, next: Partial<Dock>) => patch({ docks: records.docks.map(dock => dock.id === id ? { ...dock, ...next } : dock) });
  const log = (text: string, tone: ActivityEvent['tone'] = 'info') => patch({ events: [{ id: `live-${nextEvent++}`, time: records.time, text, tone }, ...records.events].slice(0, 12) });
  const occupy = (id: LocationId, count: number) => patch({ occupancy: { ...records.occupancy, [id]: Math.max(0, Math.min(location(id).capacity, count)) } });
  const orderOf = (id: string) => records.orders.find(order => order.id === id);
  const later = (seconds: number, run: () => void) => { const at = runner.time + seconds, index = timers.findIndex(timer => timer.at > at); timers.splice(index < 0 ? timers.length : index, 0, { at, run }); };

  function taskText(sku: string): string {
    const { pick: face, reserve } = SKUS[sku];
    if (replenishing.get(face)?.sku === sku) return `Reach truck is bringing a pallet from ${reserve} to ${face}.`;
    if (reservePallets(sku).length) return `Replenishment from ${reserve} queued.`;
    const inbound = records.docks.find(dock => truckLoads.get(dock.id)?.includes(sku));
    return `No reserve stock. Waits for ${inbound ? `${inbound.reference} on dock ${inbound.id}` : 'the next delivery'}.`;
  }
  /** Alerts follow the stock: a SKU leaves the list once its pick face is above the minimum again. */
  function refreshAlerts() {
    const alerts: StockAlert[] = Object.keys(onHand).filter(sku => onHand[sku] < minimum[sku]).map(sku => ({ sku, onHand: onHand[sku], min: minimum[sku], task: taskText(sku) }));
    patch({ alerts, orders: records.orders.map(order => order.issue && canPick(order) ? { ...order, issue: undefined } : order) });
  }
  const remaining = (order: Order) => order.lines.filter(line => line.picked < line.quantity);
  const canPick = (order: Order) => remaining(order).every(line => onHand[line.sku] >= line.quantity - line.picked);

  /* ── Units ────────────────────────────────────────────────────────────── */

  const handling = createHandlingState({
    handling: { ...assetHandling, 'cage-pusher': { receptacles: [{ name: 'cart', arrangement: 'stack', anchor: 'cart', capacity: 1, accepts: { families: ['wheeled'] }, envelope: { footprint: [1, 1], height: 2 } }] } } satisfies Record<string, AssetHandling>,
    profiles: handlingProfiles,
    instances: [...LOCATIONS.filter(value => value.kind === 'rack').map(value => ({ id: `rack:${value.id}`, asset: 'pallet-rack' })), ...Object.keys(PACK_X).map(id => ({ id: `pack:${id}`, asset: 'station' }))],
  });
  /** Register a unit at a world position. A hidden unit shows from its hand-over on. */
  function spawn(kind: UnitKind, at: Vec3, label: string, extra: Partial<Unit> = {}, id = `${kind}:${serial++}`): string {
    units.set(id, { kind, label, ...extra });
    handling.register([{ id, asset: ASSETS[kind] }]);
    const [check] = handling.move([{ unit: id, to: { position: at, yaw: 0 } }]);
    if (!check.ok) throw new Error(check.violations[0].message);
    return id;
  }
  /** A unit reached a count-based fixture: it stays visible for its hand-over, then the record takes over. */
  const absorb = (id: string, effect: () => void, seconds = HAND_OVER) => later(seconds, () => { handling.unregister(id); units.delete(id); effect(); });
  const show = (id: string) => { const unit = units.get(id); if (unit?.hidden) { unit.hidden = false; sceneRevision++; } };
  function retire(id: string) { handling.unregister(id); units.delete(id); sceneRevision++; }
  /** A floor place a person hands a unit to; throws when it lies beyond their reach, so nothing can drift into flying. */
  function handed(slotId: string, position: Vec3): FloorPlacement {
    const slot = ecommerceSlots.find(item => item.id === slotId)!, gap = Math.hypot(position[0] - slot.position[0], position[2] - slot.position[2]);
    if (gap > HAND_REACH) throw new Error(`${slotId} is ${gap.toFixed(2)} m from [${position.join(', ')}]; a person reaches ${HAND_REACH} m. Move the slot or the place.`);
    return { position, yaw: 0 };
  }
  const palletLabel = (id: string, sku: string) => `${id.split(':')[1]} · ${sku}`;
  const inRack = (id: string) => { const placed = handling.placement(id); return placed && 'container' in placed && placed.container.startsWith('rack:') ? placed.container.slice(5) as LocationId : undefined; };
  const reservePallets = (sku: string) => [...units].filter(([id, unit]) => unit.kind === 'pallet' && unit.sku === sku && !claimed.has(id) && inRack(id)).map(([id]) => id);

  // Each occupied rack position is one real pallet. A SKU announced as out of reserve has none.
  const unreserved = new Set(start.alerts.filter(alert => /no reserve/i.test(alert.task)).map(alert => alert.sku));
  for (const value of LOCATIONS.filter(item => item.kind === 'rack')) {
    const skus = Object.keys(SKUS).filter(sku => SKUS[sku].reserve === reserveOf(value.id) && !unreserved.has(sku));
    for (let i = 0; i < start.occupancy[value.id]; i++) {
      const sku = skus[i % skus.length], id = spawn('pallet', [0, 0, 0], '', { sku, load: PALLET_CARTONS });
      units.get(id)!.label = palletLabel(id, sku);
      const [target] = handling.targets(id, { containers: [`rack:${value.id}`], limit: 1 });
      handling.move([{ unit: id, to: { ...target.target, turn: RACK_TURN } }]);
    }
  }
  /** The SKU of the next inbound pallet: one of the three whose reserve rack is emptiest. */
  function skuForInbound(): string {
    const skus = Object.keys(SKUS).sort((a, b) => records.occupancy[SKUS[a].reserve] - records.occupancy[SKUS[b].reserve] || a.localeCompare(b));
    return skus[Math.floor(random() * 3)];
  }
  /**
   * Free rack positions left for a truck's pallets: every position less the pallets in the building that still need one (those
   * behind a pick face do not) and the pallets on trucks. With the capacity rules a truck brings no more pallets than that.
   */
  function rackRoomLeft(): number {
    const total = RACKS.reduce((sum, id) => sum + location(id).capacity, 0);
    const placed = [...units].filter(([id, unit]) => unit.kind === 'pallet' && unit.sku && ![...replenishing.values()].some(job => job.pallet === id)).length;
    return total - placed - [...truckLoads.values()].flat().length;
  }
  /** The SKUs of a truck's pallets. */
  const inboundLoad = (count: number) => Array.from({ length: options.capacityRules ? Math.max(0, Math.min(count, rackRoomLeft())) : count }, () => skuForInbound());
  for (let i = 0; i < Math.min(STAGING_SPOTS.length, start.staging); i++) {
    const sku = skuForInbound(), id = spawn('pallet', STAGING_SPOTS[i], '', { sku, load: PALLET_CARTONS });
    units.get(id)!.label = palletLabel(id, sku); staging[i] = id;
  }
  // Roll cages are real wheeled units too; their nodes keep showing the snapshot's parcel count.
  const cageIds = [...Object.keys(CAGE_X), ...(channels ? Object.keys(OUTLET_CAGE_X) : [])];
  for (const cage of cageIds) { handling.register([{ id: `cage:${cage}`, asset: 'roll-cage' }]); handling.move([{ unit: `cage:${cage}`, to: { position: cageHome(cage), yaw: 0 } }]); }

  /* ── Agents ───────────────────────────────────────────────────────────── */

  const hands: CarryRule = { anchor: 'carry', travelPose: 'holding', idlePose: 'holding', handOverSeconds: HAND_OVER, reach: HAND_REACH };
  const onForks: CarryRule = { anchor: 'load', reach: 2, turn: 90 };
  const crewOf = (count: number, ids: readonly string[]) => ids.slice(0, count);
  const pickers = crewOf(start.crew.picking, ['picker:0', 'picker:1', 'picker:2']), robots = crewOf(start.robots, ['robot:0', 'robot:1']), packers = crewOf(start.crew.packing, ['packer:K1', 'packer:K2', 'packer:K3']), sorters = crewOf(start.crew.sorting, ['sorter:P1', 'sorter:P2']);
  const shopperIds = start.shopOpen ? Array.from({ length: SHOPPER_POOL }, (_, i) => `shopper:${i}`) : [];
  // Customers of the starting state are already inside, each on a point of their own; the rest of the pool comes in from the street.
  const startQueues = start.shop.checkouts.flatMap(lane => lane.open ? Array.from({ length: lane.queue }, (_, place) => ({ lane: lane.id, place })) : []);
  const startShelves = Array.from({ length: start.shop.browsing }, (_, i) => GONDOLAS[i * 7 % GONDOLAS.length]);
  const startPoints = [...startQueues.map(({ lane, place }) => queuePoints(lane)[place]), ...startShelves.map(item => `${item.id}:browse`), ...Array.from({ length: start.shop.collectWaiting }, (_, i) => STARTING_COLLECT[i])];
  const forklift = start.crew.receiving > 0, reachTruck = start.crew.storage > 0, replenisher = start.crew.replenishing > 0, dispatcher = start.crew.dispatch > 0, filler = start.crew.shelving > 0 && start.shopOpen;
  const definitions: (Omit<BehaviorAgent, 'steps'> & { node: Omit<AssetNode, 'kind' | 'id' | 'position' | 'rotation' | 'route'>; handling: string })[] = [
    ...(forklift ? [{ id: 'forklift', agent: 'forklift', start: 'apron-staging-north', travelPose: 'operated', idlePose: 'operated', carry: onForks, backOut: true, handling: 'forklift', node: { asset: 'forklift', label: 'Forklift', labelMode: 'active' as const, selectable: true } }] : []),
    ...(reachTruck ? [{ id: 'reach-truck', agent: 'reach-truck', start: 'aisle:R04', travelPose: 'operated', idlePose: 'operated', carry: onForks, backOut: true, handling: 'reach-truck', node: { asset: 'reach-truck', label: 'Reach truck', labelMode: 'active' as const, selectable: true } }] : []),
    ...(replenisher ? [{ id: 'replenisher', agent: 'staff', start: 'back-west', carry: hands, handling: 'worker', node: staffNode('Replenisher', true) }] : []),
    ...pickers.map((id, i) => ({ id, agent: 'picker', start: ['flow:F1:pick', 'flow:F3:pick', 'flow:S1:pick'][i], travelPose: 'pushing', idlePose: 'pushing', handling: 'worker', node: staffNode(`Picker ${i + 1}`, i % 2 === 1) })),
    ...robots.map(id => ({ id, agent: 'robot', start: id === 'robot:0' ? 'amr-home-0' : 'amr-home-1', travelPose: 'deck', idlePose: 'deck', carry: { anchor: 'load' }, handling: 'mobile-robot', node: { asset: 'mobile-robot', selectable: false } })),
    ...sorters.map((id, i) => ({ id, agent: 'staff', start: `putwall:${id.slice(7)}:sort`, carry: hands, handling: 'worker', node: { ...staffNode(`Sorter ${id.slice(7)}`, i % 2 === 0), selectable: false } })),
    ...packers.map((id, i) => ({ id, agent: 'staff', start: `pack:${id.slice(7)}:work`, carry: hands, handling: 'worker', node: { ...staffNode(`Packer ${id.slice(7)}`, i % 2 === 1), selectable: false } })),
    ...(dispatcher ? [{ id: 'dispatcher', agent: 'staff', start: 'cage-row-east', carry: { anchor: 'cart', travelPose: 'pushing', idlePose: 'pushing', handOverSeconds: .5 }, handling: 'cage-pusher', node: staffNode('Dispatch', false) }] : []),
    ...(filler ? [{ id: 'shelf-filler', agent: 'staff', start: 'gap-east', carry: hands, handling: 'worker', node: { ...staffNode('Shelf filler', true), color: '#2f6f8f' } }] : []),
    ...shopperIds.map((id, i) => ({ id, agent: 'shopper', start: startPoints[i] ?? 'street', carry: hands, handling: 'worker', node: { asset: 'visitor', color: SHOPPERS[i % SHOPPERS.length], selectable: false, materials: { hair: personHairColor(id) }, ...(i % 2 ? {} : FEMININE) } })),
  ];
  function staffNode(label: string, feminine: boolean) { return { asset: 'worker', color: STAFF, label, labelMode: 'active' as const, selectable: true, ...(feminine ? FEMININE : {}) }; }
  handling.register(definitions.map(item => ({ id: item.id, asset: item.handling })));
  for (const id of pickers) carts[id] = 0;
  for (const id of ['forklift', 'reach-truck']) forks.set(id, { height: FORK_FLOOR });
  for (const id of shopperIds) shoppers.set(id, { inside: false, items: 0, basket: false });

  const runner = createBehaviorRunner({
    graph: warehouseNavigation, slots: ecommerceSlots, seed, itemPolicy: handlingItemPolicy(handling),
    agents: definitions.map(({ id, agent, start, travelPose, idlePose, carry, backOut }) => ({ id, agent, start, travelPose, idlePose, carry, backOut, steps: [] })),
    onItemEvent: event => { tasks.get(event.agent)?.items?.[event.step]?.(); touchRecords(); },
  });
  const stopEvents = runner.subscribeEvents(event => { inbox.push(event); });
  const stopState = runner.subscribe(() => { sceneRevision++; });

  function give(agent: string, task: Task) { tasks.set(agent, task); runner.assign(agent, task.steps); cached = null; recordsRevision++; }
  /** Publish fork moves from the current pose; the node drops them once they ended, so a model rebuild cannot replay them. */
  function moveForks(agent: string, moves: readonly ForkMove[]) {
    const motion: ForkMotion = { ...finalForkPose(forks.get(agent)!), moves };
    forks.set(agent, motion); sceneRevision++;
    later(forkMoveSeconds(moves) + .2, () => { if (forks.get(agent) === motion) { forks.set(agent, finalForkPose(motion)); sceneRevision++; } });
  }
  const forkSeconds = (moves: readonly ForkMove[]) => forkMoveSeconds(moves) + .25;
  const wait = (moves: readonly ForkMove[], label: string): BehaviorStep => ({ kind: 'wait', seconds: forkSeconds(moves), label });

  /* ── Inbound: truck → forklift → staging lane → reach truck → rack ────── */

  function dockTruck(id: DockId, color: string, ready: () => void) {
    trucks.set(id, { docked: false, color }); sceneRevision++;
    // One publish in the yard first, so the shunt controller drives the truck onto the dock.
    later(.3, () => { trucks.get(id)!.docked = true; sceneRevision++; later(4, ready); });
  }
  function leaveDock(id: DockId) {
    const truck = trucks.get(id); if (!truck) return;
    truck.docked = false; sceneRevision++;
    later(4.2, () => { trucks.delete(id); sceneRevision++; });
  }
  function arriveInbound(id: DockId) {
    const dock = records.docks.find(item => item.id === id)!;
    dockTruck(id, '#4a7fb0', () => {
      truckLoads.set(id, inboundLoad(dock.pallets?.total ?? PALLETS_PER_TRUCK));
      if (director.unload(records.docks.find(item => item.id === id)!)) { startUnloading(id); return; }
      // The truck stands on the dock until the director lets the forklift unload it.
      holding.add(id);
      patchDock(id, { late: false, note: DOCK_WAITING_NOTE });
      log(`${dock.partner} docked at ${id}; ${dock.reference} waits for the unload.`);
    });
  }
  function startUnloading(id: DockId) {
    const dock = records.docks.find(item => item.id === id)!, waited = holding.delete(id);
    patchDock(id, { status: 'unloading', late: false, note: 'Forklift is unloading into the staging lane.' });
    log(waited ? `${dock.reference} unloading started at ${id}.` : `${dock.partner} docked at ${id}; ${dock.reference} unloading started.`);
    refreshAlerts();
  }
  /** Reserve positions no pallet in staging or on a truck will take. */
  const freePositions = () => LOCATIONS.filter(value => value.kind === 'rack').reduce((sum, value) => sum + value.capacity - records.occupancy[value.id], 0) - records.staging - records.docks.reduce((sum, dock) => sum + (dock.pallets ? dock.pallets.total - dock.pallets.done : 0), 0);
  const reservePalletCount = () => LOCATIONS.filter(value => value.kind === 'rack').reduce((sum, value) => sum + records.occupancy[value.id], 0);
  /** Book the next delivery once the racks can take it, so the warehouse never fills up and stops. */
  function bookInbound() {
    const dock = records.docks.find(item => item.direction === 'inbound' && item.status === 'free');
    if (!dock || !forklift) return;
    if (freePositions() < PALLETS_PER_TRUCK || reservePalletCount() >= MAX_RESERVE_PALLETS) { later(30, bookInbound); return; }
    const reference = `PO-${nextReference++}`, partner = pick(SUPPLIERS);
    patchDock(dock.id, { status: 'expected', partner, reference, time: records.time, pallets: { done: 0, total: PALLETS_PER_TRUCK }, note: 'Booked; the truck is on its way.', late: false });
    later(12, () => arriveInbound(dock.id));
  }
  function finishInbound(id: DockId) {
    const dock = records.docks.find(item => item.id === id)!;
    patchDock(id, { status: 'free', note: `${dock.reference} unloaded.` });
    patch({ emptyPallets: Math.max(1, records.emptyPallets - PALLETS_RETURNED) });
    log(`${dock.reference} unloaded at ${id}; the truck left with ${PALLETS_RETURNED} empty pallets.`, 'success');
    leaveDock(id); later(70, bookInbound);
  }
  const freeSpot = () => staging.findIndex((value, i) => !value && !stagingBooked.has(i));
  function autoUnload(): Move | undefined {
    const dock = records.docks.find(item => item.direction === 'inbound' && item.status === 'unloading' && item.pallets && item.pallets.done < item.pallets.total && director.unload(item));
    if (!dock || freeSpot() < 0 || !dock.pallets || !truckLoads.get(dock.id)?.length) return undefined;
    return { kind: 'unload', dock: dock.id };
  }
  /** One pallet off the truck into the first free staging spot; a truck still waiting for its unload starts unloading. */
  function unloadTask(id: DockId): Task {
    if (holding.has(id)) startUnloading(id);
    const dock = records.docks.find(item => item.id === id)!, spot = freeSpot();
    const sku = truckLoads.get(dock.id)!.shift()!, pallet = spawn('pallet', dockMouth(dock.id), '', { sku, load: PALLET_CARTONS });
    units.get(pallet)!.label = palletLabel(pallet, sku); stagingBooked.add(spot);
    const lift = forkMoves({ height: FORK_FLOOR }, { height: FORK_TRAVEL }), lower = forkMoves({ height: FORK_TRAVEL }, { height: FORK_FLOOR });
    return {
      what: `Unloading ${dock.reference} from ${dock.id}`,
      // The forks slide under the pallet on the floor, lift it for the drive, and lower it again before the truck backs out.
      steps: [{ kind: 'interact', node: `dock:${dock.id}`, slot: 'unload', seconds: 1, pickUp: [pallet], label: 'Taking a pallet off the truck' }, wait(lift, 'Lifting the pallet'), { kind: 'interact', node: `staging:${spot}`, slot: 'fork', seconds: forkSeconds(lower), putDown: 'all', putOn: { position: STAGING_SPOTS[spot], yaw: 0 }, label: 'Setting the pallet down' }],
      started: { 2: () => moveForks('forklift', lower) },
      ended: { 0: () => moveForks('forklift', lift) },
      items: {
        0: () => { const done = dock.pallets!.done + 1, current = records.docks.find(item => item.id === dock.id)!; patchDock(dock.id, { pallets: { done: current.pallets!.done + 1, total: current.pallets!.total } }); if (done >= dock.pallets!.total) later(6, () => finishInbound(dock.id)); },
        2: () => { stagingBooked.delete(spot); staging[spot] = pallet; patch({ staging: staging.filter(Boolean).length }); emit({ type: 'unloaded', dock: dock.id, pallet, sku }); },
      },
    };
  }

  /* ── Reach truck: put-away, replenishment and empty pallets ───────────── */

  function autoReach(): Move | undefined {
    for (const [face, job] of replenishing) if (job.ready && (units.get(job.pallet)?.load ?? 0) === 0) return { kind: 'clear', face: face as LocationId };
    const low = Object.keys(onHand).filter(sku => onHand[sku] < minimum[sku] && !replenishing.has(SKUS[sku].pick) && reservePallets(sku).length).sort((a, b) => onHand[a] - onHand[b])[0];
    if (low) return { kind: 'replenish', pallet: reservePallets(low)[0] };
    const spot = staging.findIndex(Boolean);
    if (spot < 0) return undefined;
    // The emptiest rack of the SKU's family comes first, so both rows fill evenly; any free rack is the fallback.
    const pallet = staging[spot]!, sku = units.get(pallet)!.sku!;
    const racks = [...RACKS.filter(id => reserveOf(id) === SKUS[sku].reserve).sort((a, b) => records.occupancy[a] - records.occupancy[b]), ...RACKS];
    const rack = racks.find(id => rackTarget(pallet, id));
    return rack && { kind: 'put-away', pallet, rack };
  }
  /** The free place of a rack a pallet would take: the lowest free position, or one on `level`, at `position` when given. */
  function rackTarget(pallet: string, rack: LocationId, level?: number, position?: number) {
    const found = handling.targets(pallet, { containers: [`rack:${rack}`], ...(level === undefined ? { limit: 1 } : {}) });
    return level === undefined ? found[0] : found.find(item => item.target.receptacle === `level-${level}` && (position === undefined || (item.target.position ?? 0) === position));
  }
  /** Every free place of a rack, as levels and positions, lowest first. */
  const freePlaces = (pallet: string, rack: LocationId) => handling.targets(pallet, { containers: [`rack:${rack}`] }).map(item => ({ level: Number(item.target.receptacle.slice(6)), position: item.target.position ?? 0 }));
  /** Why a rack takes no pallet (on `level`): the type-of-goods rule when it refuses, else the rack or level is full. */
  function rackRefusal(pallet: string, rack: LocationId, level?: number): string {
    const refusals = handling.refusals(pallet, { containers: [`rack:${rack}`] }).filter(item => level === undefined || item.receptacle === `level-${level}`);
    return refusals.flatMap(item => item.violations).find(item => item.code === 'host-rule')?.message ?? (level === undefined ? `${rack} is full.` : `${rack} level ${level + 1} has no free place there.`);
  }
  const palletName = (pallet: string) => `Pallet ${pallet.slice(7)}`;
  /** The pick face whose replenishment spot a pallet stands on. */
  const faceOfPallet = (pallet: string) => [...replenishing].find(([, job]) => job.pallet === pallet)?.[0] as LocationId | undefined;
  /** The rack level a pallet stands on, and the slot in front of it. */
  function rackPlace(pallet: string) {
    const placed = handling.placement(pallet) as { receptacle: string; position?: number };
    return { level: RACK_LEVELS[Number(placed.receptacle.slice(6))], slot: `load-${placed.position ?? 0}` };
  }
  /** One reach-truck visit: forks into position, the exchange, forks back. Returns the two steps and their hooks at `index`. */
  function reachVisit(index: number, moves: { before: readonly ForkMove[]; after: readonly ForkMove[] }, step: Extract<BehaviorStep, { kind: 'interact' }>) {
    return {
      steps: [{ ...step, seconds: forkSeconds(moves.before) }, wait(moves.after, 'Bringing the forks back')] as BehaviorStep[],
      started: { [index]: () => moveForks('reach-truck', moves.before) },
      ended: { [index]: () => moveForks('reach-truck', moves.after) },
    };
  }
  function reachTask(what: string, take: ReturnType<typeof reachVisit>, put: ReturnType<typeof reachVisit>, items: Task['items']): Task {
    return { what, steps: [...take.steps, ...put.steps], started: { ...take.started, ...put.started }, ended: { ...take.ended, ...put.ended }, items };
  }
  function clearTask(face: LocationId): Task {
    const job = replenishing.get(face)!, top = records.emptyPallets * STACKED_PALLET;
    const take = reachVisit(0, reachTake(0), { kind: 'interact', node: `replen:${face}`, slot: 'drop', seconds: 0, pickUp: [job.pallet], label: 'Picking up the empty pallet' });
    const put = reachVisit(2, reachPut(top), { kind: 'interact', node: 'pallet-stack', slot: 'drop', seconds: 0, putDown: 'all', putOn: { position: above(PALLET_STACK, top), yaw: ALONG_Z }, label: 'Adding it to the stack' });
    return reachTask(`Taking an empty pallet from ${face} to the stack`, take, put, { 0: () => { replenishing.delete(face); refreshAlerts(); }, 2: () => absorb(job.pallet, () => patch({ emptyPallets: Math.min(MAX_EMPTY_PALLETS, records.emptyPallets + 1) }), .1) });
  }
  function replenishTask(pallet: string): Task {
    const sku = units.get(pallet)!.sku!, { pick: face } = SKUS[sku], rack = inRack(pallet)!, job: Replenishment = { pallet, sku, ready: false, promised: 0 }, place = rackPlace(pallet);
    claimed.add(pallet); replenishing.set(face, job); refreshAlerts();
    if (onHand[sku] < minimum[sku]) log(`${sku} is below its minimum; replenishment from ${rack} to ${face} started.`, onHand[sku] ? 'info' : 'critical');
    else log(`Replenishment of ${sku} from ${rack} to ${face} started.`);
    const take = reachVisit(0, reachTake(place.level), { kind: 'interact', node: `rack:${rack}`, slot: place.slot, seconds: 0, pickUp: [pallet], label: 'Taking the pallet out of the rack' });
    const put = reachVisit(2, reachPut(0), { kind: 'interact', node: `replen:${face}`, slot: 'drop', seconds: 0, putDown: 'all', putOn: { position: replenishSpot(face), yaw: ALONG_Z }, label: 'Setting it down behind the pick face' });
    return reachTask(`Replenishing ${face} from ${rack}`, take, put, { 0: () => occupy(rack, handling.contents(`rack:${rack}`).length), 2: () => { job.ready = true; claimed.delete(pallet); } });
  }
  function putAwayTask(pallet: string, rack: LocationId, at?: number, place?: number): Task {
    const spot = staging.indexOf(pallet), sku = units.get(pallet)!.sku!, target = { id: rack, found: rackTarget(pallet, rack, at, place) ?? rackTarget(pallet, rack)! };
    const { receptacle, position } = target.found.target, level = RACK_LEVELS[Number(receptacle.slice(6))];
    const take = reachVisit(0, reachTake(0), { kind: 'interact', node: `staging:${spot}`, slot: 'reach', seconds: 0, pickUp: [pallet], label: 'Taking a pallet from staging' });
    const put = reachVisit(2, reachPut(level), { kind: 'interact', node: `rack:${target.id}`, slot: `load-${position ?? 0}`, seconds: 0, putDown: 'all', putOn: { receptacle, position, turn: RACK_TURN }, label: `Lifting the pallet into ${target.id}` });
    return reachTask(`Putting ${sku} away to ${target.id}`, take, put, {
      0: () => { staging[spot] = null; patch({ staging: staging.filter(Boolean).length }); },
      2: () => { occupy(target.id, handling.contents(`rack:${target.id}`).length); refreshAlerts(); log(`Pallet ${pallet.slice(7)} of ${sku} put away to ${target.id}.`, 'success'); emit({ type: 'put-away', pallet, sku, rack: target.id }); },
    });
  }

  /* ── Replenisher: carton by carton from the pallet into the pick face ─── */

  /** Units on their way into each pick face's lanes, and facings on their way to each department, not yet in the records. */
  const incomingUnits: Partial<Record<LocationId, number>> = {}, incomingFacings: Partial<Record<DepartmentId, number>> = {};
  const cartonsLeft = (face: LocationId) => { const job = replenishing.get(face); return job ? (units.get(job.pallet)?.load ?? 0) - job.promised : 0; };
  function autoDecant(): Move | undefined {
    const entry = [...replenishing].find(([, job]) => job.ready && (units.get(job.pallet)?.load ?? 0) > job.promised);
    return entry && { kind: 'decant', face: entry[0] as LocationId };
  }
  function decantTask(face: LocationId): Task {
    const job = replenishing.get(face)!;
    job.promised++; incomingUnits[face] = (incomingUnits[face] ?? 0) + UNITS_PER_CARTON;
    const sku = job.sku, x = replenishSpot(face)[0], carton = spawn('carton', [x - .35, FLOOR_Y + .75, replenishSpot(face)[2] + .5], `Carton · ${sku}`, { sku, hidden: true });
    return {
      what: `Filling ${face} with ${sku}`,
      steps: [{ kind: 'interact', node: `replen:${face}`, slot: 'take', seconds: 1.8, pose: 'picking', pickUp: [carton], label: 'Taking a carton off the pallet' }, { kind: 'interact', node: `replen:${face}`, slot: 'fill', seconds: 1.8, pose: 'placing', putDown: 'all', putOn: handed(`replen:${face}:fill`, [x + .35, FLOOR_Y + 1.4, -4.35]), label: 'Filling the lane' }],
      started: { 0: () => show(carton) },
      items: {
        0: () => { job.promised--; const pallet = units.get(job.pallet); if (pallet?.load) { pallet.load--; sceneRevision++; } },
        1: () => absorb(carton, () => { incomingUnits[face]! -= UNITS_PER_CARTON; onHand[sku] += UNITS_PER_CARTON; faceUnits[face] += UNITS_PER_CARTON; occupy(face, Math.ceil(faceUnits[face] / UNITS_PER_CARTON)); refreshAlerts(); emit({ type: 'replenished', face, sku }); }),
      },
    };
  }

  /* ── Orders: picker → conveyor → robot → put wall → packer → cage ─────── */

  function pickerJob(id: string): Task | undefined {
    const candidates = ranked([...records.orders.filter(value => value.stage === 'picking'), ...records.orders.filter(value => value.stage === 'released')]), order = candidates.find(value => !claimed.has(value.id) && canPick(value));
    // Orders skipped for lack of stock ahead of the chosen one are short picks.
    for (const value of candidates) {
      if (value === order) break;
      if (claimed.has(value.id) || shortReported.has(value.id)) continue;
      shortReported.add(value.id);
      emit({ type: 'short-pick', order: value, sku: remaining(value).find(line => onHand[line.sku] < line.quantity - line.picked)!.sku });
    }
    if (!order) return undefined;
    claimed.add(order.id);
    patchOrder(order.id, { stage: 'picking', issue: undefined });
    const lines = remaining(order).sort((a, b) => a.sku.localeCompare(b.sku));
    const steps: BehaviorStep[] = lines.map(line => { const face = SKUS[line.sku].pick; return { kind: 'interact', node: `${location(face).kind}:${face}`, group: 'pick', seconds: [3, 4.5], label: `Picking ${line.sku}` }; });
    // The picker reaches into the lane: the goods leave its count and land on the cart in the same moment.
    const ended = Object.fromEntries(lines.map((line, index) => [index, () => {
      const face = SKUS[line.sku].pick, quantity = line.quantity - line.picked;
      carts[id] = 1; sceneRevision++;
      onHand[line.sku] = Math.max(0, onHand[line.sku] - quantity); faceUnits[face] = Math.max(0, faceUnits[face] - quantity);
      occupy(face, Math.ceil(faceUnits[face] / UNITS_PER_CARTON));
      const current = orderOf(order.id)!; patchOrder(order.id, { lines: current.lines.map(item => item.sku === line.sku ? { ...item, picked: item.quantity } : item) });
      refreshAlerts();
    }]));
    steps.push({ kind: 'interact', node: 'induct', seconds: 2.2, label: 'Sliding the tote onto the conveyor' });
    return { what: `Picking ${order.id}`, steps, ended, started: { [lines.length]: () => { carts[id] = 0; sceneRevision++; induct(order); } } };
  }
  /** A picked order leaves the cart: its tote slides onto the belt beside it, or a shop transfer waits for the shelf filler. */
  function induct(order: Order) {
    claimed.delete(order.id);
    if (order.channel === 'store') {
      dropOrders([order.id]);
      const face = SKUS[order.lines[0].sku].pick, department = FACE_DEPARTMENT[face];
      if (department) transfers.push(department);
      log(`Shop transfer ${order.id} picked; the shelf filler takes it to the shop floor.`, 'success');
      return;
    }
    patchOrder(order.id, { stage: 'sorting' });
    claimed.add(order.id);
    const place = belt.length ? Math.max(...belt.map(item => item.place)) + 1 : 0, to: Vec3 = [Math.max(CART_AT_INDUCT[0] + .2, BELT_END_X - place * BELT_SPACING), BELT_Y, BELT_Z];
    const points: Vec3[] = [CART_AT_INDUCT, [CART_AT_INDUCT[0], BELT_Y, BELT_Z], to], tote = spawn('tote', to, `Tote · ${order.id}`, { orderId: order.id, ride: { points, start: runner.time } }), slot = { tote, place, arrived: false };
    belt.push(slot);
    later(pathLength(points) / BELT_SPEED, () => { slot.arrived = true; delete units.get(tote)!.ride; sceneRevision++; });
  }
  function robotJob(id: string): Task | undefined {
    const walls = (Object.keys(PUT_WALL_X) as PutWallId[]).slice(0, sorters.length), slot = belt.find(item => item.arrived);
    if (!slot || !walls.length) return undefined;
    belt.splice(belt.indexOf(slot), 1);
    const tote = slot.tote, orderId = units.get(tote)!.orderId!, wall = walls.sort((a, b) => records.orders.filter(order => order.at === a).length - records.orders.filter(order => order.at === b).length)[0], sorter = `sorter:${wall}`;
    const from = (handling.placement(tote) as FloorPlacement).position, points: Vec3[] = [from, ...(from[0] < BELT_END_X ? [[BELT_END_X, BELT_Y, BELT_Z] as Vec3] : []), ROBOT_DECK], ride = pathLength(points) / BELT_SPEED;
    return {
      what: `Bringing ${orderId} to put wall ${wall}`,
      // The tote rides off the end of the belt onto the waiting robot; the sorter beside the put wall takes it off the deck.
      steps: [{ kind: 'interact', node: 'conveyor', slot: 'discharge', seconds: ride + .4, queue: ['amr-wait'], pickUp: [tote], label: 'Taking a tote off the conveyor' }, { kind: 'interact', node: `putwall:${wall}`, slot: 'put', seconds: 2.4, label: 'Handing the tote to the sorter' }, { kind: 'move', to: id === 'robot:0' ? 'amr-home-0' : 'amr-home-1', label: 'Returning to the waiting line' }],
      started: {
        0: () => { handling.move([{ unit: tote, to: { position: ROBOT_DECK, yaw: 0 } }]); units.get(tote)!.ride = { points, start: runner.time }; later(ride, () => { delete units.get(tote)!.ride; sceneRevision++; }); sceneRevision++; },
        1: () => {
          handling.move([{ unit: tote, to: { container: sorter, receptacle: 'carry' } }]);
          give(sorter, { what: `Sorting ${orderId} into put wall ${wall}`, steps: [{ kind: 'interact', node: `putwall:${wall}`, slot: 'sort', seconds: 1.5, putDown: 'all', putOn: handed(`putwall:${wall}:sort`, [PUT_WALL_X[wall], FLOOR_Y + 1.1, -1.45]), label: 'Putting the order into the wall' }], items: { 0: () => absorb(tote, () => { claimed.delete(orderId); patchOrder(orderId, { at: wall }); log(`Order ${orderId} reached put wall ${wall}.`); }) } });
        },
      },
    };
  }
  function freeCage(value: CarrierId): string | undefined { return carrierOf(value).cages.find(cage => handling.placement(`cage:${cage}`) && 'position' in handling.placement(`cage:${cage}`)! && cage !== bookedCage); }
  function packerJob(id: string): Task | undefined {
    const bench = benches.get(id)!, here = ranked(records.orders).find(order => order.at === bench && !claimed.has(order.id));
    if (here) return packJob(id, bench, here);
    const order = ranked(records.orders).find(value => value.at?.startsWith('P') && !claimed.has(value.id));
    if (!order) return undefined;
    claimed.add(order.id); fetching.set(bench, (fetching.get(bench) ?? 0) + 1);
    const wall = order.at as PutWallId, carton = spawn('carton', [PUT_WALL_X[wall], FLOOR_Y + 1.1, -.95], `Goods · ${order.id}`, { orderId: order.id, hidden: true });
    return {
      what: `Fetching ${order.id} from put wall ${wall}`,
      steps: [{ kind: 'interact', node: `putwall:${wall}`, group: 'pick', seconds: 1.8, pose: 'picking', pickUp: [carton], label: 'Taking the order from the wall' }, { kind: 'interact', node: `pack:${bench}`, group: 'work', seconds: 1.6, pose: 'placing', putDown: 'all', putOn: { receptacle: 'surface' }, label: 'Putting it on the bench' }],
      started: { 0: () => show(carton) },
      items: { 0: () => patchOrder(order.id, { at: undefined, stage: 'packing' }), 1: () => absorb(carton, () => { patchOrder(order.id, { at: bench }); claimed.delete(order.id); fetching.set(bench, fetching.get(bench)! - 1); }) },
    };
  }
  function packJob(id: string, bench: PackStationId, order: Order): Task {
    claimed.add(order.id);
    const home = PACK_X[bench], parcel = spawn('parcel', [home, FLOOR_Y + 1.2, 2.9], `Parcel · ${order.id}`, { orderId: order.id, hidden: true });
    const steps: BehaviorStep[] = [{ kind: 'interact', node: `pack:${bench}`, group: 'work', seconds: [6, 9], pickUp: [parcel], label: `Packing ${order.id}` }];
    // With the sales channels every parcel goes into a cage: its carrier's, or its outlet's.
    const outlet = channels ? orderOutlet(order) : undefined;
    const deliver = outlet ? outletOf(outlet).cage : order.carrier ? freeCage(order.carrier) ?? carrierOf(order.carrier).cages[0] : undefined;
    if (deliver) steps.push({ kind: 'interact', node: `cage:${deliver}`, group: 'load', seconds: 1.5, pose: 'placing', putDown: 'all', putOn: handed(`cage:${deliver}:load`, above(cageHome(deliver), .6)), label: `Loading the ${outlet ? outletOf(outlet).label : carrierOf(order.carrier!).name} cage` });
    else steps.push({ kind: 'interact', node: 'collect:counter', slot: 'handover', seconds: 1.5, putDown: 'all', putOn: handed('collect:counter:handover', [-11.1, FLOOR_Y + 1.1, .8]), label: 'Handing over at click & collect' });
    return {
      what: `Packing ${order.id}`, steps,
      items: {
        0: () => { show(parcel); patchOrder(order.id, { at: undefined }); },
        1: () => absorb(parcel, () => { claimed.delete(order.id); patchOrder(order.id, { stage: deliver ? 'staged' : 'collect' }); log(deliver ? `Order ${order.id} staged for ${outlet ? `the ${outletOf(outlet).label.toLowerCase()}` : carrierOf(order.carrier!).name}.` : `Order ${order.id} is ready to collect.`, 'success'); }),
      },
    };
  }

  /* ── Dispatch: a full cage is pushed to the outbound truck ────────────── */

  const outbound = () => records.docks.find(dock => dock.direction === 'outbound');
  const loadingCarrier = () => { const dock = outbound(); return dock?.status === 'loading' ? CARRIERS.find(item => item.name === dock.partner) : undefined; };
  /** The automatic dispatcher serves the truck first, then, with the sales channels, the outlet whose cage holds most parcels. */
  function autoShip(): Move | undefined {
    const truck = autoTruck();
    if (truck || !channels) return truck;
    const ready = OUTLETS.map(item => ({ cage: item.cage, parcels: stagedAt(records, item.id).length })).filter(item => item.parcels && checkMove('dispatcher', { kind: 'ship', cage: item.cage }).ok);
    const best = ready.sort((a, b) => b.parcels - a.parcels)[0];
    return best && { kind: 'ship', cage: best.cage };
  }
  /** The carrier's first cage onto its truck; without the director's departures it sends the truck off once nothing is staged or after three trips. */
  function autoTruck(): Move | undefined {
    const value = loadingCarrier();
    if (!value || !value.cages.length) return undefined;
    const parcels = stagedFor(records, value.id).length, dock = outbound()!;
    if (options.directorDeparts) return parcels ? { kind: 'ship', cage: value.cages[0] } : undefined;
    if (!parcels || outboundTrips >= 3) { departOutbound(dock); return undefined; }
    return { kind: 'ship', cage: value.cages[0] };
  }
  /** Parcels an outlet still takes: the counter and the lockers up to their capacity, the bike none while it is out on a round. */
  function outletRoom(id: OutletId): number {
    if (id === 'bike' && records.bike?.away) return 0;
    return outletOf(id).capacity - heldAt(records, id).length;
  }
  const OUTLET_NODES: Readonly<Record<OutletId, string>> = { counter: 'collect:counter', lockers: 'collect:lockers', bike: 'courier-bike' };
  /** An outlet cage pushed to its outlet, unloaded as far as there is room, and pushed back; what does not fit stays in it. */
  function outletTask(cage: string, id: OutletId): Task {
    const unit = `cage:${cage}`, name = outletOf(id).label.toLowerCase();
    bookedCage = cage;
    return {
      what: `Taking parcels to the ${name}`,
      steps: [{ kind: 'interact', node: unit, group: 'load', seconds: 1.4, pickUp: [unit], label: 'Taking the roll cage' }, { kind: 'interact', node: OUTLET_NODES[id], slot: 'drop', seconds: 3, label: `Unloading at the ${name}` }, { kind: 'interact', node: unit, group: 'load', seconds: 1.2, putDown: 'all', putOn: { position: cageHome(cage), yaw: 0 }, label: 'Returning the empty cage' }],
      ended: { 1: () => {
        const moved = stagedAt(records, id).slice(0, Math.max(0, outletRoom(id))), ids = new Set(moved.map(order => order.id));
        if (!moved.length) return;
        patch({ orders: records.orders.map(order => ids.has(order.id) ? { ...order, ...(id === 'bike' ? { at: 'bike' as const } : { stage: 'collect' as const }) } : order) });
        if (id === 'lockers') patchShop({ lockers: records.shop.lockers + moved.length });
        log(`${moved.length} ${moved.length === 1 ? 'parcel' : 'parcels'} brought to the ${name}.`, 'success');
        emit({ type: 'delivered', outlet: id, orders: moved });
      } },
      done: () => { bookedCage = null; },
    };
  }
  function shipTask(cage: string): Task {
    const target = channels ? cageOutlet(cage) : undefined;
    if (target) return outletTask(cage, target.id);
    const value = loadingCarrier()!, dock = outbound()!, unit = `cage:${cage}`;
    bookedCage = cage; outboundTrips++;
    return {
      what: `Loading ${value.name} at ${dock.id}`,
      steps: [{ kind: 'interact', node: unit, group: 'load', seconds: 1.4, pickUp: [unit], label: 'Taking the roll cage' }, { kind: 'interact', node: 'dock:D3', slot: 'load', seconds: 3, label: `Loading ${dock.reference}` }, { kind: 'interact', node: unit, group: 'load', seconds: 1.2, putDown: 'all', putOn: { position: cageHome(cage), yaw: 0 }, label: 'Returning the empty cage' }],
      ended: { 1: () => {
        const shipped = stagedFor(records, value.id).slice(0, 12);
        dropOrders(shipped.map(order => order.id)); patch({ shippedToday: records.shippedToday + shipped.length });
        log(`${shipped.length} parcels loaded on ${dock.reference} for ${value.name}.`, 'success');
        if (shipped.length) emit({ type: 'shipped', carrier: value.id, orders: shipped });
      } },
      done: () => { bookedCage = null; },
    };
  }
  function departOutbound(dock: Dock) {
    patchDock(dock.id, { status: 'departed', note: `${dock.partner} left the dock.` });
    log(`${dock.partner} ${dock.reference} left dock ${dock.id}.`, 'success');
    leaveDock(dock.id); outboundTrips = 0;
    later(55, () => arriveOutbound(dock.partner === 'Parcelo' ? 'swift' : 'parcelo'));
  }
  function arriveOutbound(id: CarrierId) {
    const dock = outbound(), value = carrierOf(id);
    if (!dock || dock.status === 'loading') return;
    // The Parcelo van in the yard is replaced by the truck on the dock.
    if (id === 'parcelo' && records.parceloVan) patch({ parceloVan: false });
    dockTruck(dock.id, '#c8553d', () => {
      patchDock(dock.id, { status: 'loading', partner: value.name, reference: `Route ${value.name.slice(0, 1)}${value.name.slice(-1).toUpperCase()}-${nextReference % 100}`, time: value.cutoff, note: 'Trailer docked; loading roll cages.' });
      log(`${value.name} trailer docked at ${dock.id}; loading started.`);
    });
  }

  /* ── Shop: shelf → basket → checkout → bag → street ───────────────────── */

  const openLanes = () => records.shop.checkouts.filter(lane => lane.open && !closing.has(lane.id));
  const insideCount = () => [...shoppers.values()].filter(item => item.inside).length;
  const LEAVE: BehaviorStep = { kind: 'move', to: 'street', label: 'Leaving the shop' };
  /** A corral place no shopper holds; a held cart stands in the corral until it is taken. */
  let arrivals = 0;
  const freeCart = () => CART_CORRAL.findIndex((_, i) => ![...shoppers.values()].some(item => item.corral === i));
  const CART_STEP = (label: string): BehaviorStep => ({ kind: 'interact', node: 'carts', slot: 'corral', seconds: 1.2, label });
  /** A shopper with a cart returns it to the corral before leaving; the place is free again once it stands there. */
  const returnCart = (id: string) => () => { const shopper = shoppers.get(id); if (shopper) { shopper.pushing = false; shopper.corral = undefined; sceneRevision++; } };
  const patchLane = (id: CheckoutId, delta: number) => patchShop({ checkouts: records.shop.checkouts.map(lane => lane.id === id ? { ...lane, queue: Math.max(0, lane.queue + delta) } : lane) });
  const finishVisit = (id: string, unit?: string) => { if (unit) retire(unit); shoppers.set(id, { inside: false, items: 0, basket: false }); sceneRevision++; };
  /** The steps after paying or walking out: the cart back to the corral when the shopper has one, then out. */
  const leaving = (shopper: Shopper): BehaviorStep[] => shopper.corral !== undefined ? [CART_STEP('Returning the cart'), LEAVE] : [LEAVE];
  function checkoutSteps(id: string, lane: CheckoutId): Task & { bag: string } {
    const bag = spawn('bag', [CHECKOUT_X[lane], FLOOR_Y + 1, .25], 'Shopping bag', { hidden: true }), shopper = shoppers.get(id)!;
    heading.set(id, lane);
    return {
      bag,
      what: `Paying at checkout ${lane.slice(1)}`,
      steps: [{ kind: 'interact', node: `checkout:${lane}`, group: 'customer', seconds: 3.5, queue: queuePoints(lane), pose: 'placing', pickUp: [bag], label: 'Paying' }, ...leaving(shopper)],
      started: { 0: () => { patchLane(lane, -1); show(bag); } },
      ...(shopper.corral !== undefined ? { ended: { 1: returnCart(id) } } : {}),
      items: { 0: () => { heading.delete(id); patchShop({ sales: records.shop.sales + shopper.items * (12 + Math.floor(random() * 40)) }); shopper.basket = false; sceneRevision++; emit({ type: 'served', lane, items: shopper.items }); } },
      done: () => finishVisit(id, bag),
    };
  }
  function browseJob(id: string, gondolas: readonly (typeof GONDOLAS)[number][]): Task {
    const shopper = shoppers.get(id)!, lane = openLanes().sort((a, b) => a.queue - b.queue)[0], pay = checkoutSteps(id, lane.id);
    // A shopper with a cart takes it from the corral first and pushes it from then on.
    const cart = shopper.corral !== undefined ? 1 : 0, offset = cart + gondolas.length;
    const steps: BehaviorStep[] = [...(cart ? [CART_STEP(`Taking cart ${shopper.corral! + 1}`)] : []), ...gondolas.map((item): BehaviorStep => ({ kind: 'interact', node: item.id, group: 'browse', seconds: [2.5, 4.5], label: 'Browsing' })), ...pay.steps];
    const shift = (hooks: Record<number, () => void> | undefined) => Object.fromEntries(Object.entries(hooks ?? {}).map(([index, hook]) => [Number(index) + offset, hook]));
    const ended: Record<number, () => void> = shift(pay.ended);
    if (cart) ended[0] = () => { shopper.pushing = true; sceneRevision++; };
    gondolas.forEach((item, index) => { ended[cart + index] = () => {
      // The shopper reaches into the shelf: the facing leaves it and lands in the basket in the same moment.
      // With the sales channels a shopper takes two or three items from each gondola, as far as it has them.
      const taken = Math.min(records.shop.facings[item.department], channels ? 2 + index % 2 : 1);
      if (taken > 0) { patchShop({ facings: { ...records.shop.facings, [item.department]: records.shop.facings[item.department] - taken } }); shopper.items += taken; shopper.goods = item.department; sceneRevision++; }
      if (index === gondolas.length - 1) {
        patchShop({ browsing: Math.max(0, records.shop.browsing - 1) });
        const queue = records.shop.checkouts.find(value => value.id === lane.id)!.queue;
        if (options.walkOutAt !== undefined && queue >= options.walkOutAt) walkOut(id, pay.bag, lane.id); else patchLane(lane.id, 1);
      }
    }; });
    return { what: 'Shopping', steps, ended, started: { [offset]: pay.started![0] }, items: { [offset]: pay.items![0] }, done: pay.done };
  }
  /** A customer who will not queue leaves at once, without paying for the basket. */
  function walkOut(id: string, bag: string, lane: CheckoutId) {
    heading.delete(id); retire(bag);
    const shopper = shoppers.get(id)!; shopper.basket = false; sceneRevision++;
    give(id, { what: 'Leaving without paying', steps: leaving(shopper), ...(shopper.corral !== undefined ? { ended: { 0: returnCart(id) } } : {}), done: () => finishVisit(id) });
    log(`A customer left the queue at checkout ${lane.slice(1)}.`, 'warning');
    emit({ type: 'walked-out', lane });
  }
  // Shoppers pass empty departments by; with the sales channels they come for a department whatever it holds, so an empty one loses the sale.
  const shelvesFor = (count: number, first?: (typeof GONDOLAS)[number]) => { const list = [...GONDOLAS].filter(item => item !== first && (channels || records.shop.facings[item.department] > 0)), chosen = first ? [first] : []; while (chosen.length < count && list.length) chosen.push(list.splice(Math.floor(random() * list.length), 1)[0]); return chosen; };
  function arrive() {
    const id = shopperIds.find(item => !shoppers.get(item)!.inside && !tasks.has(item));
    if (!id || !openLanes().length) return;
    // Every other shopper takes a cart while one stands free in the corral; the others take a basket. Counting, not the random
    // stream, decides it, so the rest of the shift draws the same numbers.
    const corral = arrivals++ % 2 === 0 ? freeCart() : -1;
    shoppers.set(id, { inside: true, items: 0, basket: corral < 0, ...(corral >= 0 ? { corral } : {}) });
    patchShop({ browsing: records.shop.browsing + 1 });
    give(id, browseJob(id, shelvesFor(1 + Math.floor(random() * 2))));
  }
  function collectVisit() {
    const order = records.orders.find(value => value.stage === 'collect' && value.outlet !== 'lockers' && !claimed.has(value.id)), id = shopperIds.find(item => !shoppers.get(item)!.inside && !tasks.has(item));
    if (!order || !id) return;
    claimed.add(order.id);
    shoppers.set(id, { inside: true, items: 0, basket: false });
    patchShop({ collectWaiting: records.shop.collectWaiting + 1 });
    const parcel = spawn('parcel', [-12, FLOOR_Y + 1.1, 1.2], `Parcel · ${order.id}`, { orderId: order.id, hidden: true });
    give(id, {
      what: `Collecting ${order.id}`,
      steps: [{ kind: 'interact', node: 'collect:counter', group: 'customer', seconds: 4, pickUp: [parcel], label: 'Collecting the parcel' }, LEAVE],
      started: { 0: () => show(parcel) },
      items: { 0: () => { dropOrders([order.id]); claimed.delete(order.id); patch({ shippedToday: records.shippedToday + 1 }); patchShop({ collectWaiting: Math.max(0, records.shop.collectWaiting - 1) }); log(`${order.customer} collected order ${order.id}.`, 'success'); emit({ type: 'collected', order }); } },
      done: () => finishVisit(id, parcel),
    });
  }
  /** Sales channels: a customer opens a locker on the sidewalk and takes the parcel. */
  function lockerVisit() {
    const order = records.orders.find(value => value.stage === 'collect' && value.outlet === 'lockers' && !claimed.has(value.id)), id = shopperIds.find(item => !shoppers.get(item)!.inside && !tasks.has(item));
    if (!order || !id) return;
    claimed.add(order.id);
    shoppers.set(id, { inside: true, items: 0, basket: false });
    const parcel = spawn('parcel', [-19.5, .12 + 1.1, 6.75], `Parcel · ${order.id}`, { orderId: order.id, hidden: true });
    give(id, {
      what: `Collecting ${order.id} from the lockers`,
      steps: [{ kind: 'interact', node: 'collect:lockers', group: 'use', seconds: 3.5, pickUp: [parcel], label: 'Opening a locker' }, LEAVE],
      started: { 0: () => show(parcel) },
      items: { 0: () => { dropOrders([order.id]); claimed.delete(order.id); patch({ shippedToday: records.shippedToday + 1 }); patchShop({ lockers: Math.max(0, records.shop.lockers - 1) }); log(`${order.customer} collected order ${order.id} from the lockers.`, 'success'); emit({ type: 'collected', order }); } },
      done: () => finishVisit(id, parcel),
    });
  }
  /** Sales channels: the delivery bike leaves on its round with what is loaded, or skips it when empty; it waits for a cage on its way. */
  const BIKE_ROUND = 45, BIKE_AWAY = 25, BIKE_SPEED = 4;
  /** When the bike last rode off, and when it last set off back from the west; its node rides between them. */
  let bikeLeft = -Infinity, bikeBack = -Infinity;
  function bikeDue() {
    if (bookedCage === outletOf('bike').cage) { later(1, bikeDue); return; }
    const load = heldAt(records, 'bike');
    if (!load.length) { patch({ bike: { away: false, next: runner.time + BIKE_ROUND } }); later(BIKE_ROUND, bikeDue); return; }
    dropOrders(load.map(order => order.id));
    patch({ shippedToday: records.shippedToday + load.length, bike: { away: true, next: runner.time + BIKE_AWAY } });
    log(`The delivery bike left with ${load.length} ${load.length === 1 ? 'parcel' : 'parcels'}.`, 'success');
    emit({ type: 'bike-left', orders: load });
    bikeLeft = runner.time;
    // It sets off back early enough to reach the door when its round ends.
    const ride = pathLength([BIKE_FROM_WEST, BIKE_AT]) / BIKE_SPEED;
    later(BIKE_AWAY - ride, () => { bikeBack = runner.time; sceneRevision++; });
    later(BIKE_AWAY, () => { patch({ bike: { away: false, next: runner.time + BIKE_ROUND - BIKE_AWAY } }); later(BIKE_ROUND - BIKE_AWAY, bikeDue); });
  }
  /** The bike: at the door between rounds, riding off east when it leaves, and back from the west at the end of its round. */
  function bikeNode(time: number): AssetNode {
    const base = { id: 'courier-bike', kind: 'asset' as const, asset: 'cargo-bike', rotation: [0, Math.PI / 2, 0] as Vec3 }, loaded = heldAt(records, 'bike').length;
    if (records.bike?.away) {
      const back = bikeBack > bikeLeft, points = back ? [BIKE_FROM_WEST, BIKE_AT] : [BIKE_AT, BIKE_GONE_EAST];
      return { ...base, position: points[1], selectable: false, route: { points, speed: BIKE_SPEED, elapsed: time - (back ? bikeBack : bikeLeft) } };
    }
    return { ...base, entityId: 'bike', position: BIKE_AT, selectable: true, label: `Delivery bike · ${loaded}/${BIKE_CAPACITY} parcels`, labelMode: 'active', state: loaded ? 'busy' : 'normal' };
  }
  /** Customers set off from the same street point, so one waits for the next timer while the last is still close to it. */
  function fromStreet(visit: () => void) { if (runner.time - lastEntry < ENTRY_GAP) return; lastEntry = runner.time; visit(); }
  /** Whether a pick face can spare a carton for the shop: one of its SKUs stays at or above its minimum. */
  const spares = (face: LocationId) => Object.keys(SKUS).some(sku => SKUS[sku].pick === face && onHand[sku] >= minimum[sku] + UNITS_PER_CARTON);
  const departmentFull = (department: DepartmentId) => records.shop.facings[department] + (incomingFacings[department] ?? 0) >= departmentCapacity(department);
  function autoRestock(): Move | undefined {
    const transfer = transfers[0], low = DEPARTMENTS.map(item => item.id).filter(id => records.shop.facings[id] < departmentCapacity(id) * RESTOCK_BELOW).sort((a, b) => records.shop.facings[a] - records.shop.facings[b]);
    if (transfer) return { kind: 'restock', department: transfer, source: 'transfer' };
    const department = low.find(id => spares(DEPARTMENT_FACES[id]));
    return department && { kind: 'restock', department, source: 'face' };
  }
  function restockTask(department: DepartmentId, source: 'face' | 'transfer'): Task {
    const transfer = source === 'transfer';
    if (transfer) transfers.splice(transfers.indexOf(department), 1);
    incomingFacings[department] = (incomingFacings[department] ?? 0) + FACINGS_PER_CARTON;
    const face = DEPARTMENT_FACES[department], sku = Object.keys(SKUS).filter(item => SKUS[item].pick === face).sort((a, b) => onHand[b] - onHand[a])[0];
    // Cartons go to the department's gondolas in turn.
    const shelves = GONDOLAS.filter(item => item.department === department), gondola = shelves[Math.floor(records.shop.facings[department] / FACINGS_PER_CARTON) % shelves.length], x = replenishSpot(face)[0] + .75, carton = spawn('carton', [x, FLOOR_Y + 1, -4.35], `Carton · ${sku}`, { sku, hidden: true });
    return {
      what: `Restocking ${department} from ${face}`,
      steps: [{ kind: 'interact', node: `replen:${face}`, slot: 'shop', seconds: 1.8, pose: 'picking', pickUp: [carton], label: 'Taking a carton for the shop' }, { kind: 'interact', node: gondola.id, slot: 'fill', seconds: 3, putDown: 'all', putOn: handed(`${gondola.id}:fill`, [gondola.position[0] + .7, FLOOR_Y + 1, gondola.position[2] + .15]), label: 'Filling the gondola' }],
      started: { 0: () => show(carton) },
      items: {
        0: () => { if (!transfer) { onHand[sku] -= UNITS_PER_CARTON; faceUnits[face] = Math.max(0, faceUnits[face] - UNITS_PER_CARTON); occupy(face, Math.ceil(faceUnits[face] / UNITS_PER_CARTON)); refreshAlerts(); } },
        1: () => absorb(carton, () => { incomingFacings[department]! -= FACINGS_PER_CARTON; patchShop({ facings: { ...records.shop.facings, [department]: Math.min(departmentCapacity(department), records.shop.facings[department] + FACINGS_PER_CARTON) } }); log(`${departmentLabel(department)} gondola restocked with ${sku}.`, 'success'); emit({ type: 'restocked', department, sku, transfer }); }),
      },
    };
  }

  /* ── Scheduling: the director's decisions ─────────────────────────────── */

  /** Orders by the director's priority; equal priorities keep their order. */
  function ranked(orders: readonly Order[]): readonly Order[] { return [...orders].sort((a, b) => director.priority(b) - director.priority(a)); }
  const homeZone = (id: string): StaffZone => id.startsWith('picker:') ? 'picking' : id.startsWith('sorter:') ? 'sorting' : id.startsWith('packer:') ? 'packing' : id === 'replenisher' ? 'replenishing' : id === 'dispatcher' ? 'dispatch' : 'restocking';
  const zones = new Map(definitions.filter(item => item.agent === 'picker' || item.agent === 'staff').map(item => [item.id, homeZone(item.id)]));
  /** Each packing person's bench, and fetches on their way to a bench. */
  const benches = new Map(packers.map(id => [id, id.slice(7) as PackStationId])), fetching = new Map<PackStationId, number>();
  const freeBench = () => (Object.keys(PACK_X) as PackStationId[]).find(bench => ![...benches.values()].includes(bench));
  /** A person who packs owns the orders on their bench, and finishes them before moving. */
  const busy = (id: string) => tasks.has(id) || zones.get(id) === 'packing' && ((fetching.get(benches.get(id)!) ?? 0) > 0 || records.orders.some(order => order.at === benches.get(id)));
  function member(id: string): StaffMember {
    const zone = zones.get(id)!, station = zone === 'packing' ? benches.get(id) : zone === 'sorting' ? id.slice(7) as PutWallId : undefined;
    const movable = HAND_ZONES.includes(homeZone(id)), label = definitions.find(item => item.id === id)!.node.label ?? id;
    return { id, label, zone, zones: movable ? HAND_ZONES.filter(value => value !== 'packing' || zone === 'packing' || freeBench()) : [zone], ...(station ? { station } : {}), busy: busy(id) };
  }
  /** Apply the director's zone for a free person. */
  function rezone(id: string) {
    const person = member(id), zone = director.zone(person);
    if (zone === person.zone) return;
    if (!person.zones.includes(zone)) throw new Error(`${person.label} cannot move to ${zone} now; possible zones: ${person.zones.join(', ')}.`);
    if (person.zone === 'packing') benches.delete(id);
    if (zone === 'packing') benches.set(id, freeBench()!);
    zones.set(id, zone);
    log(`${person.label} moves to ${zone}${zone === 'packing' ? ` at bench ${benches.get(id)}` : ''}.`);
  }
  function directShop() {
    if (!start.shopOpen) return;
    for (const { id } of records.shop.checkouts) {
      const lane = records.shop.checkouts.find(item => item.id === id)!, open = director.checkoutOpen(lane), name = `Checkout ${id.slice(1)}`;
      if (open && closing.delete(id)) log(`${name} stays open.`);
      else if (open && !lane.open) {
        const cashier = lane.cashier ?? CASHIERS.find(value => !records.shop.checkouts.some(item => item.cashier === value));
        patchShop({ checkouts: records.shop.checkouts.map(item => item.id === id ? { ...item, open: true, ...(cashier ? { cashier } : {}) } : item) });
        log(`${name} opened.`);
      } else if (!open && lane.open && !closing.has(id)) { closing.add(id); log(`${name} closes once its queue is served.`); }
      // A closing lane takes no new customers; it closes once nobody queues or walks to it.
      if (closing.has(id) && !lane.queue && ![...heading.values()].includes(id)) {
        closing.delete(id);
        patchShop({ checkouts: records.shop.checkouts.map(item => item.id === id ? { ...item, open: false, queue: 0 } : item) });
        log(`${name} closed.`);
      }
    }
  }
  function directDocks() { for (const id of holding) if (director.unload(records.docks.find(dock => dock.id === id)!)) startUnloading(id); }
  function directOutbound() {
    const dock = outbound();
    // The truck waits for a cage on its way to it, not for one on its way to a shop outlet.
    const coming = bookedCage !== null && !(channels && cageOutlet(bookedCage));
    if (dock?.status === 'loading' && trucks.get(dock.id)?.docked && !coming && director.depart(dock)) departOutbound(dock);
  }
  function jobOf(id: string): Task | undefined {
    if (MACHINES.has(id) && !director.running(id)) return undefined;
    const role = roleOf(id);
    if (role) return commanded(id, role);
    if (id.startsWith('robot:')) return robotJob(id);
    switch (zones.get(id)) {
      case 'picking': return pickerJob(id);
      case 'packing': return packerJob(id);
      // Sorters take what the robots bring.
      default: return undefined;
    }
  }

  /* ── Commanded moves ──────────────────────────────────────────────────── */

  function roleOf(id: string): ActorRole | undefined {
    if (id === 'forklift' || id === 'reach-truck') return id;
    const zone = zones.get(id);
    return zone && ZONE_ROLES[zone];
  }
  const labelOf = (id: string) => definitions.find(item => item.id === id)?.node.label ?? id;
  function autoMove(role: ActorRole): Move | undefined {
    switch (role) {
      case 'forklift': return autoUnload();
      case 'reach-truck': return autoReach();
      case 'replenisher': return autoDecant();
      case 'shelf-filler': return autoRestock();
      case 'dispatcher': return autoShip();
    }
  }
  /** The move each actor works on, until it ends or the director gives another, and what an actor waits for. */
  const moving = new Map<string, Move>(), waits = new Map<string, { key: string; reason: string }>();
  const sameMove = (a: Move | undefined, b: Move) => !!a && JSON.stringify(a) === JSON.stringify(b);
  function endMove(actor: string, move: Move, outcome: MoveOutcome, reason: string) {
    moving.delete(actor); waits.delete(actor); recordsRevision++;
    emit({ type: 'move-ended', actor, move, outcome, reason });
  }
  /** Ask the director for an actor's next move and start it, wait for room, or report why it ended. */
  function commanded(id: string, role: ActorRole): Task | undefined {
    let automatic: Move | undefined;
    const move = director.job({ id, role, label: labelOf(id) }, () => automatic = autoMove(role));
    if (!move) { if (moving.delete(id) || waits.delete(id)) recordsRevision++; return undefined; }
    // A repeating move whose last task emptied its source or filled its target ends here once its records caught up after the task.
    // The automatic choice is valid by construction.
    const end = move !== automatic && sameMove(moving.get(id), move) ? moveEnd(move) : undefined;
    if (end) { endMove(id, move, end[0], end[1]); return undefined; }
    const result = checkMove(role, move);
    if (!result.ok && result.wait) {
      const key = JSON.stringify(move);
      if (waits.get(id)?.key !== key) { waits.set(id, { key, reason: result.reason }); moving.set(id, move); recordsRevision++; emit({ type: 'move-waiting', actor: id, move, reason: result.reason }); }
      return undefined;
    }
    if (!result.ok) { endMove(id, move, 'refused', result.reason); return undefined; }
    if (waits.delete(id)) recordsRevision++;
    moving.set(id, move);
    return { ...moveTask(move), move };
  }
  function moveTask(move: Move): Task {
    switch (move.kind) {
      case 'unload': return unloadTask(move.dock);
      case 'put-away': return putAwayTask(move.pallet, move.rack, move.level, move.position);
      case 'replenish': return replenishTask(move.pallet);
      case 'clear': return clearTask(move.face);
      case 'decant': return decantTask(move.face);
      case 'restock': return restockTask(move.department, move.source);
      case 'ship': return shipTask(move.cage);
    }
  }
  /** How a move ends after a task: a one-task move is done; a repeating one once its source is empty or its target full. */
  function moveEnd(move: Move): [MoveOutcome, string] | undefined {
    switch (move.kind) {
      case 'unload': return truckLoads.get(move.dock)?.length ? undefined : ['emptied', `The truck at ${move.dock} is empty.`];
      case 'decant': return cartonsLeft(move.face) > 0 ? undefined : ['emptied', `The pallet behind ${move.face} is empty.`];
      case 'restock': {
        if (move.source === 'transfer') return ['done', `Shop transfer for ${departmentLabel(move.department)} restocked.`];
        if (departmentFull(move.department)) return ['filled', `${departmentLabel(move.department)} is full.`];
        return spares(DEPARTMENT_FACES[move.department]) ? undefined : ['emptied', `${DEPARTMENT_FACES[move.department]} is at its minimum.`];
      }
      default: return ['done', describeMove(move)];
    }
  }
  function describeMove(move: Move): string {
    switch (move.kind) {
      case 'unload': return `Unload the truck at ${move.dock}.`;
      case 'put-away': return `${palletName(move.pallet)} put away to ${move.rack}.`;
      case 'replenish': return `${palletName(move.pallet)} brought behind ${SKUS[units.get(move.pallet)?.sku ?? '']?.pick ?? 'its pick face'}.`;
      case 'clear': return `Empty pallet from ${move.face} taken to the stack.`;
      case 'decant': return `Fill ${move.face} from its pallet.`;
      case 'restock': return `Restock ${departmentLabel(move.department)}.`;
      case 'ship': { const target = channels ? cageOutlet(move.cage) : undefined; return target ? `${move.cage} taken to the ${target.label.toLowerCase()}.` : `${move.cage} loaded on the truck.`; }
    }
  }
  const OK: MoveCheckResult = { ok: true };
  const refuse = (reason: string): MoveCheckResult => ({ ok: false, wait: false, reason });
  const waitFor = (reason: string): MoveCheckResult => ({ ok: false, wait: true, reason });
  function checkMove(role: ActorRole, move: Move): MoveCheckResult {
    if (!ROLE_MOVES[role].includes(move.kind)) return refuse(`The ${role.replace('-', ' ')} does not ${move.kind.replace('-', ' ')}; that is a move of the ${(Object.keys(ROLE_MOVES) as ActorRole[]).find(item => ROLE_MOVES[item].includes(move.kind))!.replace('-', ' ')}.`);
    switch (move.kind) {
      case 'unload': {
        const dock = records.docks.find(item => item.id === move.dock);
        if (!dock || dock.direction !== 'inbound') return refuse(`${move.dock} is not an inbound dock.`);
        if (!trucks.get(dock.id)?.docked || !(dock.status === 'unloading' || holding.has(dock.id))) return refuse(`No truck is docked at ${dock.id}.`);
        if (!truckLoads.get(dock.id)?.length) return refuse(`The truck at ${dock.id} is empty.`);
        return freeSpot() < 0 ? waitFor('Waits for room in staging.') : OK;
      }
      case 'put-away': {
        const unit = units.get(move.pallet);
        if (unit?.kind !== 'pallet') return refuse(`${move.pallet} is not a pallet.`);
        if (!staging.includes(move.pallet)) return refuse(`${palletName(move.pallet)} is not in staging.`);
        if (!RACKS.includes(move.rack)) return refuse(`${move.rack} is not a reserve rack.`);
        if (move.level !== undefined && !(Number.isInteger(move.level) && move.level >= 0 && move.level < RACK_LEVELS.length)) return refuse(`${move.rack} has levels 1 to ${RACK_LEVELS.length}.`);
        if (move.position !== undefined && (move.level === undefined || !(move.position === 0 || move.position === 1))) return refuse(`A position in ${move.rack} needs a level and is 1 or 2.`);
        // A place taken in the meantime, for example by an earlier command to the same place, falls back to the rack's lowest free place.
        return rackTarget(move.pallet, move.rack, move.level, move.position) ?? rackTarget(move.pallet, move.rack) ? OK : refuse(rackRefusal(move.pallet, move.rack));
      }
      case 'replenish': {
        const unit = units.get(move.pallet);
        if (unit?.kind !== 'pallet') return refuse(`${move.pallet} is not a pallet.`);
        if (!inRack(move.pallet)) return refuse(`${palletName(move.pallet)} is not in a rack.`);
        if (claimed.has(move.pallet)) return refuse(`${palletName(move.pallet)} is already on its way.`);
        const face = SKUS[unit.sku!].pick;
        return replenishing.has(face) ? waitFor(`Waits for room behind ${face}.`) : OK;
      }
      case 'clear': {
        const job = replenishing.get(move.face);
        if (!job) return refuse(`No pallet stands behind ${move.face}.`);
        if (!job.ready) return refuse(`The pallet for ${move.face} has not arrived yet.`);
        const load = units.get(job.pallet)?.load ?? 0;
        return load ? refuse(`The pallet behind ${move.face} still holds ${load} ${load === 1 ? 'carton' : 'cartons'}.`) : OK;
      }
      case 'decant': {
        const job = replenishing.get(move.face);
        if (!job) return refuse(`No pallet stands behind ${move.face}.`);
        if (!job.ready) return waitFor(`Waits for the pallet behind ${move.face}.`);
        if (cartonsLeft(move.face) <= 0) return refuse(`The pallet behind ${move.face} is empty.`);
        const lanes = Math.ceil((faceUnits[move.face] + (incomingUnits[move.face] ?? 0) + UNITS_PER_CARTON) / UNITS_PER_CARTON);
        return options.capacityRules && lanes > location(move.face).capacity ? waitFor(`Waits for room in the lanes of ${move.face}.`) : OK;
      }
      case 'restock': {
        const label = departmentLabel(move.department), face = DEPARTMENT_FACES[move.department];
        if (!face) return refuse(`${move.department} is not a department.`);
        if (move.source === 'transfer') return transfers.includes(move.department) ? OK : refuse(`No shop transfer waits for ${label}.`);
        if (departmentFull(move.department)) return refuse(`${label} is full.`);
        return spares(face) ? OK : refuse(`${face} is at its minimum.`);
      }
      case 'ship': {
        const target = channels ? cageOutlet(move.cage) : undefined;
        if (target) {
          const name = target.label.toLowerCase();
          if (bookedCage === move.cage) return refuse(`${move.cage} is already on its way.`);
          if (!stagedAt(records, target.id).length) return refuse(`No parcels for the ${name} are packed.`);
          if (target.id === 'bike' && records.bike?.away) return waitFor('Waits for the bike to come back from its round.');
          return outletRoom(target.id) > 0 ? OK : waitFor(`Waits for room ${target.id === 'bike' ? 'on the bike' : target.id === 'lockers' ? 'in the lockers' : 'at the counter'}.`);
        }
        const owner = CARRIERS.find(item => item.cages.includes(move.cage)), loading = loadingCarrier(), dock = outbound();
        if (!owner) return refuse(`${move.cage} is not a roll cage.`);
        if (!loading || !dock || !trucks.get(dock.id)?.docked) return refuse(`No truck is loading at the outbound dock.`);
        if (loading.id !== owner.id) return refuse(`The truck at ${dock.id} is ${loading.name}'s; ${move.cage} goes with ${owner.name}.`);
        if (bookedCage === move.cage) return refuse(`${move.cage} is already on its way.`);
        return stagedFor(records, owner.id).length ? OK : refuse(`No ${owner.name} parcels are staged.`);
      }
    }
  }
  function actorRole(id: string): ActorRole {
    const role = roleOf(id);
    if (!role) throw new Error(`${id} is not a commanded actor; commanded actors now: ${ROSTER.filter(roleOf).join(', ') || 'none'}.`);
    return role;
  }
  /** The pick face a subject names: the face, its replenishment spot, or the pallet standing there. */
  function faceOf(subject: string): LocationId | undefined {
    const [prefix, name] = subject.split(':');
    if (prefix === 'pallet') return faceOfPallet(subject);
    return (prefix === 'flow' || prefix === 'shelf' || prefix === 'replen') && FACES.includes(name as LocationId) ? name as LocationId : undefined;
  }
  /** Ghost places of a move that can start now: where its pallet, carton or roll cage would stand. */
  function previewsOf(move: Move): PickTarget[] {
    const PALLET_BOX: Vec3 = [1.3, 1.4, 1.3], CARTON_BOX: Vec3 = [.7, .7, .7], carton = { asset: ASSETS.carton, scale: SCALES.carton };
    switch (move.kind) {
      case 'unload': { const spot = freeSpot(); return spot < 0 ? [] : [{ position: STAGING_SPOTS[spot], size: PALLET_BOX, ghost: { asset: ASSETS.pallet, count: PALLET_CARTONS } }]; }
      case 'put-away': {
        const found = rackTarget(move.pallet, move.rack, move.level, move.position);
        return found ? [{ node: `rack:${move.rack}`, ...(found.placement.anchor ? { anchor: found.placement.anchor } : {}), offset: found.placement.offset, yaw: RACK_TURN * Math.PI / 180, size: PALLET_BOX, ghost: move.pallet }] : [];
      }
      case 'replenish': { const sku = units.get(move.pallet)?.sku; return sku ? [{ position: replenishSpot(SKUS[sku].pick), yaw: ALONG_Z, size: PALLET_BOX, ghost: move.pallet }] : []; }
      case 'clear': { const job = replenishing.get(move.face); return job ? [{ position: above(PALLET_STACK, records.emptyPallets * STACKED_PALLET), yaw: ALONG_Z, size: PALLET_BOX, ghost: job.pallet }] : []; }
      case 'decant': return [{ position: [replenishSpot(move.face)[0] + .35, FLOOR_Y + 1.4, -4.35], size: CARTON_BOX, ghost: carton }];
      case 'restock': return GONDOLAS.filter(item => item.department === move.department).map(item => ({ position: [item.position[0] + .7, FLOOR_Y + 1, item.position[2] + .15] as Vec3, size: CARTON_BOX, ghost: carton }));
      case 'ship': {
        const target = channels ? cageOutlet(move.cage) : undefined, drop = target ? OUTLET_DROPS[target.id] : { position: [DOCK_LOAD_X, FLOOR_Y, DOCK_Z.D3] as Vec3, yaw: Math.PI / 2 };
        return [{ position: drop.position, yaw: drop.yaw, size: [1, 2, 1], ghost: `cage:${move.cage}` }];
      }
    }
  }
  function choices(id: string, subject: string): MoveChoices {
    const role = actorRole(id), options: MoveOption[] = [], refused: MoveRefusal[] = [];
    const offer = (move: Move, target: string) => {
      const result = checkMove(role, move), previews = result.ok ? previewsOf(move) : [];
      if (result.ok) options.push({ move, target, ...(previews.length ? { previews } : {}) });
      else if (result.wait) options.push({ move, target, waits: result.reason });
      else refused.push({ kind: move.kind, target, reason: result.reason });
    };
    const [prefix, name] = subject.split(':'), face = faceOf(subject);
    switch (role) {
      case 'forklift':
        if ((prefix === 'dock' || prefix === 'truck') && records.docks.some(dock => dock.id === name && dock.direction === 'inbound')) offer({ kind: 'unload', dock: name as DockId }, 'Staging lane');
        break;
      case 'reach-truck':
        if (prefix === 'pallet' && staging.includes(subject)) {
          // Any pallet may take any free place: every free place of every rack, emptiest rack first, lowest place first. A full
          // rack is refused with its reason.
          for (const rack of [...RACKS].sort((a, b) => records.occupancy[a] - records.occupancy[b] || a.localeCompare(b))) {
            const places = freePlaces(subject, rack);
            if (!places.length) offer({ kind: 'put-away', pallet: subject, rack }, rack);
            for (const { level, position } of places) offer({ kind: 'put-away', pallet: subject, rack, level, position }, `${rack} · level ${level + 1} · place ${position + 1}`);
          }
        } else if (prefix === 'pallet' && inRack(subject)) {
          const sku = units.get(subject)!.sku!;
          offer({ kind: 'replenish', pallet: subject }, `Behind ${SKUS[sku].pick}`);
        } else if (face) offer({ kind: 'clear', face }, 'Empty-pallet stack');
        break;
      case 'replenisher':
        if (face) offer({ kind: 'decant', face }, `${face} lanes`);
        break;
      case 'shelf-filler': {
        const departments = prefix === 'gondola' ? DEPARTMENTS.filter(item => item.id === name).map(item => item.id) : face ? DEPARTMENTS.filter(item => DEPARTMENT_FACES[item.id] === face).map(item => item.id) : [];
        for (const department of departments) if (transfers.includes(department)) offer({ kind: 'restock', department, source: 'transfer' }, `${departmentLabel(department)} · shop transfer`);
        for (const department of [...departments].sort((a, b) => records.shop.facings[a] - records.shop.facings[b])) offer({ kind: 'restock', department, source: 'face' }, `${departmentLabel(department)} · from ${DEPARTMENT_FACES[department]}`);
        break;
      }
      case 'dispatcher':
        if (prefix === 'cage' && CARRIERS.some(item => item.cages.includes(name))) offer({ kind: 'ship', cage: name }, `Truck at ${outbound()?.id ?? 'D3'}`);
        else if (prefix === 'cage' && channels && cageOutlet(name)) offer({ kind: 'ship', cage: name }, cageOutlet(name)!.label);
        break;
    }
    return { options, refused };
  }
  const MACHINES = new Set(['forklift', 'reach-truck', ...robots]);
  /** Who looks for work, in this order each step. */
  const ROSTER = [...(forklift ? ['forklift'] : []), ...(reachTruck ? ['reach-truck'] : []), ...(replenisher ? ['replenisher'] : []), ...pickers, ...robots, ...packers, ...(dispatcher ? ['dispatcher'] : []), ...(filler ? ['shelf-filler'] : []), ...sorters];
  function dispatch() {
    directShop(); directDocks(); directOutbound();
    for (const agent of ROSTER) {
      if (tasks.has(agent)) continue;
      if (zones.has(agent) && !busy(agent)) rezone(agent);
      const task = jobOf(agent); if (task) give(agent, task);
    }
  }
  function handle(event: BehaviorEvent) {
    const task = tasks.get(event.agent);
    if (event.type === 'blocked') { log(`${event.agent} stopped: ${event.violations[0]?.message ?? 'blocked'}`, 'critical'); tasks.delete(event.agent); cached = null; recordsRevision++; return; }
    if (!task) return;
    if (event.type === 'interaction-started') task.started?.[event.step]?.();
    if (event.type === 'interaction-ended') task.ended?.[event.step]?.();
    if (event.type === 'finished') {
      tasks.delete(event.agent); task.done?.(); cached = null; recordsRevision++;
      const end = task.move && sameMove(moving.get(event.agent), task.move) ? moveEnd(task.move) : undefined;
      if (end) endMove(event.agent, task.move!, end[0], end[1]);
    }
  }
  function everySoFar(seconds: number, run: () => void) { const tick = () => { run(); later(seconds * (.7 + random() * .6), tick); }; later(seconds, tick); }
  function newOrder() {
    if (records.orders.filter(order => ['released', 'picking', 'sorting', 'packing'].includes(order.stage)).length >= MAX_OPEN_WORK) return;
    const sku = pick(Object.keys(SKUS)), roll = random(), quantity = 1 + Math.floor(random() * 2), id = `#${nextOrder++}`;
    // A fifth goes to click & collect. With the sales channels a quarter goes to the counter, a fifth each to the lockers and the
    // bike, and the rest to a carrier's truck.
    const outlet: OutletId | undefined = !channels ? roll < .2 ? 'counter' : undefined : roll < .25 ? 'counter' : roll < .45 ? 'lockers' : roll < .65 ? 'bike' : undefined;
    const collect = outlet === 'counter' || outlet === 'lockers';
    const order: Order = { id, customer: pick(CUSTOMERS), channel: collect ? 'click-collect' : random() < .3 ? 'marketplace' : 'web', stage: 'released', placed: records.time, value: 20 + Math.floor(random() * 120), lines: [{ sku, quantity, picked: 0 }], ...(outlet ? channels ? { outlet } : {} : { carrier: random() < .5 ? 'swift' as const : 'parcelo' as const }) };
    patch({ orders: [...records.orders, order], ordersToday: records.ordersToday + 1 });
    emit({ type: 'ordered', order });
  }

  // Starting state: docked trucks, people already at work in the shop, and the first deliveries.
  for (const dock of start.docks) if (dock.status === 'unloading' || dock.status === 'loading') { trucks.set(dock.id, { docked: true, color: dock.direction === 'outbound' ? '#c8553d' : '#4a7fb0' }); }
  for (const dock of start.docks) {
    if (dock.status === 'unloading' && dock.pallets) { const left = dock.pallets.total - dock.pallets.done; truckLoads.set(dock.id, inboundLoad(left)); if (!left) later(8, () => finishInbound(dock.id)); }
    if (dock.status === 'expected') later(45, () => arriveInbound(dock.id));
  }
  if (start.parceloVan) later(30, () => arriveOutbound('parcelo'));
  if (forklift && start.docks.every(dock => dock.status === 'free' || dock.direction === 'outbound')) later(30, bookInbound);
  if (start.crew.picking) everySoFar(channels ? 14 : 30, newOrder);
  if (start.shopOpen) { const target = start.shop.browsing + start.shop.checkouts.reduce((sum, lane) => sum + lane.queue, 0); everySoFar(6, () => { if (insideCount() < director.shoppers(target)) fromStreet(arrive); }); everySoFar(40, () => fromStreet(collectVisit)); }
  // The sales channels start with a few parcels in the lockers, as real orders, and the bike at the door.
  if (channels && start.shopOpen) {
    const skus = Object.keys(SKUS), waiting: Order[] = Array.from({ length: Math.min(start.shop.lockers, 6) }, (_, i) => ({ id: `#${nextOrder++}`, customer: CUSTOMERS[(i * 3) % CUSTOMERS.length], channel: 'click-collect', outlet: 'lockers', stage: 'collect', placed: start.time, value: 30 + i * 11, lines: [{ sku: skus[(i * 5) % skus.length], quantity: 1, picked: 1 }] }));
    // The shelves start less than half full, so they need restocking during the shift.
    const facings = Object.fromEntries(DEPARTMENTS.map(item => [item.id, Math.round(records.shop.facings[item.id] * .45)])) as Record<DepartmentId, number>;
    patch({ orders: [...records.orders, ...waiting], shop: { ...records.shop, lockers: waiting.length, facings }, bike: { away: false, next: BIKE_ROUND } });
    everySoFar(35, () => fromStreet(lockerVisit));
    later(BIKE_ROUND, bikeDue);
  }
  const placeShoppers = () => {
    let index = 0;
    const next = () => shopperIds[index++];
    // Queue members first, so they keep their order at the lanes.
    for (const { lane, place } of startQueues) { const id = next(); shoppers.set(id, { inside: true, items: 1 + place % 2, basket: true }); give(id, checkoutSteps(id, lane)); }
    startShelves.forEach((shelf, i) => { const id = next(); shoppers.set(id, { inside: true, items: 0, basket: true }); give(id, browseJob(id, shelvesFor(1 + i % 2, shelf))); });
    for (let i = 0; i < start.shop.collectWaiting; i++) collectVisit();
  };
  if (start.shopOpen) placeShoppers();
  dispatch();

  /* ── Scene layer ──────────────────────────────────────────────────────── */

  const describe = (at: ItemPlacement | undefined): string => {
    if (!at) return 'In transit';
    if ('holder' in at) return definitions.find(item => item.id === at.holder)?.node.label ?? 'Being carried';
    if ('node' in at) return at.node.replace('rack:', 'Rack ').replace('pack:', 'Bench ');
    return 'On the floor';
  };
  const unitRecords = (): UnitRecord[] => [...units].filter(([, unit]) => !unit.hidden).map(([id, unit]) => ({ id, kind: unit.kind, label: unit.label, ...(unit.sku ? { sku: unit.sku } : {}), ...(unit.orderId ? { orderId: unit.orderId } : {}), at: unit.ride ? 'On the conveyor' : describe(runner.getItems().get(id)) }));
  const taskRecords = () => [...tasks].filter(([id]) => !id.startsWith('shopper:') && !id.startsWith('robot:')).map(([id, task]) => ({ id, who: definitions.find(item => item.id === id)?.node.label ?? id, what: task.what }));
  function snapshot(): EcommerceSnapshot { return cached ??= { ...records, units: unitRecords(), tasks: taskRecords() }; }

  function unitNode(id: string, at: ItemPlacement, unit: Unit, time: number): AssetNode {
    // A pallet changes parent exactly where it stands, so it needs no hand-over animation.
    // A tote shows the goods of its order's first line.
    const goods = unit.kind === 'tote' && unit.orderId ? orderOf(unit.orderId)?.lines[0]?.sku : undefined;
    const base = { asset: ASSETS[unit.kind], scale: SCALES[unit.kind], ...(goods ? { options: { goods: skuGoods(goods) } } : {}), ...(unit.kind === 'pallet' ? {} : { transfer: { seconds: HAND_OVER, arc: 0 } }), selectable: true, entityId: id, label: unit.label, labelMode: 'active' as const, ...(unit.kind === 'pallet' ? { count: unit.load ?? 0 } : unit.kind === 'tote' ? { count: 2 } : {}) };
    const node = itemNode(id, at, base);
    return unit.ride ? { ...node, position: unit.ride.points[unit.ride.points.length - 1], rotation: [0, Math.PI / 2, 0], route: { points: unit.ride.points, speed: BELT_SPEED, elapsed: time - unit.ride.start } } : node;
  }
  function agentNodes(state: AgentState, time: number): SceneNode[] {
    const definition = definitions.find(item => item.id === state.id)!, shopper = shoppers.get(state.id);
    if (shopper && !shopper.inside) return [];
    const motion = forks.get(state.id), stopped = MACHINES.has(state.id) && !director.running(state.id);
    const pushing = shopper?.pushing && ['walking', 'idle', 'holding'].includes(state.pose);
    const node = behaviorNode(state, { ...definition.node, ...(motion ? { options: { ...definition.node.options, forks: motion } } : {}), ...(stopped ? { state: 'critical' as const } : {}) }, { time }), attached: AssetNode[] = [];
    // A shopper with a cart pushes it: the pose changes while walking or waiting, and the cart shows what was taken.
    if (pushing) node.variant = 'pushing';
    if (shopper?.pushing) attached.push({ id: `${state.id}:cart`, kind: 'asset', asset: 'shopping-cart', position: [0, 0, 0], count: Math.min(6, shopper.items), ...(shopper.goods ? { options: { goods: shopper.goods } } : {}), selectable: false, attachment: { nodeId: state.id, anchor: 'cart' } });
    if (state.id.startsWith('picker:')) attached.push({ id: `${state.id}:cart`, kind: 'asset', asset: 'picking-cart', position: [0, 0, 0], count: carts[state.id], selectable: false, attachment: { nodeId: state.id, anchor: 'cart' } });
    if (shopper?.basket) attached.push({ id: `${state.id}:basket`, kind: 'asset', asset: 'hand-basket', position: [0, 0, 0], count: Math.min(4, shopper.items), ...(shopper.goods ? { options: { goods: shopper.goods } } : {}), selectable: false, attachment: { nodeId: state.id, anchor: 'hand' } });
    return [node, ...attached];
  }
  function movers(): SceneNode[] {
    const time = runner.time, nodes: SceneNode[] = runner.getAgents().flatMap(state => agentNodes(state, time));
    for (const [id, at] of runner.getItems()) { const unit = units.get(id); if (unit && !unit.hidden) nodes.push(unitNode(id, at, unit, time)); }
    // The carts in the corral: every place whose cart no shopper pushes.
    const pushed = new Set([...shoppers.values()].flatMap(item => item.pushing && item.corral !== undefined ? [item.corral] : []));
    CART_CORRAL.forEach((position, i) => { if (!pushed.has(i)) nodes.push({ id: `shop-cart-${i}`, kind: 'asset', asset: 'shopping-cart', position, count: 0, selectable: false }); });
    if (records.bike) nodes.push(bikeNode(time));
    for (const [id, truck] of trucks) nodes.push({ id: `truck:${id}`, kind: 'asset', asset: 'truck', position: [truck.docked ? TRUCK_X : YARD_X, APRON_Y, DOCK_Z[id]], rotation: [0, Math.PI / 2, 0], color: truck.color, selectable: false, controller: { kind: 'dock-shunt', options: { speed: 3 } } });
    return nodes;
  }
  function cagePlacements() {
    const items = runner.getItems();
    return Object.fromEntries(cageIds.map(cage => { const { position, rotation, attachment } = itemNode(`cage:${cage}`, items.get(`cage:${cage}`)!, { asset: 'roll-cage' }); return [cage, { position, rotation, attachment }]; }));
  }

  /* ── Clock ────────────────────────────────────────────────────────────── */

  function tick() {
    runner.advance(STEP);
    for (const event of inbox.splice(0)) handle(event);
    const now = runner.time;
    while (timers.length && timers[0].at <= now) timers.shift()!.run();
    const nextMinute = minutesOf(start.time) + Math.floor(now / SECONDS_PER_MINUTE);
    if (nextMinute !== minute) { minute = nextMinute; patch({ time: clock(minute) }); }
    dispatch();
  }

  return {
    get time() { return runner.time; },
    get sceneRevision() { return sceneRevision; },
    get recordsRevision() { return recordsRevision; },
    advance(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Advance requires a finite, non-negative number of seconds.');
      carry += seconds;
      while (carry >= STEP - 1e-9) { carry -= STEP; tick(); }
    },
    snapshot,
    nodes: () => ecommerceNodes(snapshot(), { movers: movers(), cages: cagePlacements() }),
    staff: () => [...zones.keys()].map(member),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancel(orderId) {
      const order = orderOf(orderId);
      if (!order || claimed.has(orderId) || (order.stage !== 'released' && order.stage !== 'picking')) return false;
      dropOrders([orderId]); log(`Order ${orderId} cancelled.`, 'warning');
      return true;
    },
    actors: () => ROSTER.flatMap(id => {
      const role = roleOf(id), task = tasks.get(id), move = moving.get(id), wait = waits.get(id);
      return role ? [{ id, role, label: labelOf(id), ...(task ? { task: task.what } : {}), ...(move ? { move } : {}), ...(wait ? { waiting: wait.reason } : {}) }] : [];
    }),
    check: (actor, move) => checkMove(actorRole(actor), move),
    moves: choices,
    dispose() { stopEvents(); stopState(); runner.dispose(); },
  };
}

/** A scene store for a scenario's starting state; the dashboard then publishes `simulation.nodes()` to it. */
export function createEcommerceStore(scenario: EcommerceScenario = 'peak', simulation = createEcommerceSimulation(scenario)): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: simulation.nodes() }, { zoom: DEFAULT_ZOOM });
}
