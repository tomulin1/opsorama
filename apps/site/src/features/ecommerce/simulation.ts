import { behaviorNode, createBehaviorRunner, createHandlingState, createSceneStore, finalForkPose, forkMoveSeconds, itemNode, personHairColor, type AgentState, type AssetHandling, type AssetNode, type BehaviorAgent, type BehaviorEvent, type BehaviorStep, type CarryRule, type FloorPlacement, type ForkMotion, type ForkMove, type ForkPose, type ItemPlacement, type SceneNode, type SceneStore, type Vec3 } from '@opsorama/core';
import { assetHandling, handlingProfiles } from '@opsorama/objects';
import {
  CARRIERS, DEPARTMENTS, FACINGS_PER_GONDOLA, LOCATIONS, SCENARIOS, SKUS, carrier as carrierOf, location, minutesOf, reserveOf, stagedFor,
  type ActivityEvent, type CarrierId, type CheckoutId, type DepartmentId, type Dock, type DockId, type EcommerceScenario, type EcommerceSnapshot, type LocationId, type Order, type PackStationId, type PutWallId, type StockAlert, type UnitKind, type UnitRecord,
} from './model';
import {
  APRON_Y, BELT_END_X, BELT_Y, BELT_Z, CAGE_X, CAGE_Z, CART_AT_INDUCT, CHECKOUT_X, DEFAULT_ZOOM, DOCK_Z, FEMININE, FLOOR_Y, GONDOLAS, PACK_X, PALLET_STACK, PUT_WALL_X, RACK_LEVELS, ROBOT_DECK, SHOPPERS, STACKED_PALLET, STAFF, STAGING_SPOTS, TRUCK_X, YARD_X,
  ALONG_Z, RACK_TURN, dockMouth, ecommerceNodes, ecommerceSlots, queuePoints, replenishSpot, warehouseNavigation,
} from './scene';

/** Fixed simulation step in seconds, so the outcome does not depend on the frame rate. */
const STEP = .1;
/** Simulated seconds per minute on the site clock. */
const SECONDS_PER_MINUTE = 15;
/** Cartons on a full pallet; each decanted carton fills one lane and adds `UNITS_PER_CARTON` sellable units. */
const PALLET_CARTONS = 9, UNITS_PER_CARTON = 3, PALLETS_PER_TRUCK = 6;
const DEFAULT_ON_HAND = 24, DEFAULT_MIN = 10;
/** A department gets a restock below this many facings, and one carton adds this many. */
const RESTOCK_BELOW = 30, FACINGS_PER_CARTON = 8, MAX_FACINGS = FACINGS_PER_GONDOLA * 2;
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
/** Where each department's stock is picked. The newer departments come first, so `FACE_DEPARTMENT` names the original one. */
const DEPARTMENT_FACES: Readonly<Record<DepartmentId, LocationId>> = { garden: 'F3', bath: 'F2', party: 'S2', audio: 'S1', kitchen: 'F1', home: 'F2', outdoor: 'F3', toys: 'F4', tech: 'S1', gifts: 'S2' };
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
}
interface Unit { kind: UnitKind; label: string; sku?: string; orderId?: string; /** Cartons left on a pallet. */ load?: number; /** Waiting unseen for its hand-over. */ hidden?: boolean; /** Riding the conveyor. */ ride?: { points: readonly Vec3[]; start: number }; }
interface Truck { docked: boolean; color: string; }
interface Shopper { inside: boolean; items: number; basket: boolean; }
interface Replenishment { pallet: string; sku: string; ready: boolean; }

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
  dispose(): void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
const seeded = (seed: number) => () => { seed = seed + 0x6d2b79f5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const above = ([x, y, z]: Vec3, height: number): Vec3 => [x, y + height, z];
const cageHome = (cage: string): Vec3 => [CAGE_X[cage], FLOOR_Y, CAGE_Z];
const pathLength = (points: readonly Vec3[]) => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - points[i][0], point[1] - points[i][1], point[2] - points[i][2]), 0);

/**
 * The mock feed: a seeded shift that starts from a scenario snapshot and keeps
 * going. Pallets, totes, cartons, parcels, bags and roll cages are real units in
 * one `HandlingState`, moved by agents in one behavior runner, so a record changes
 * when the object arrives: rack occupancy when the pallet lands, an order's stage
 * when its tote reaches the put wall. Count-based fixtures (flow lanes, gondolas,
 * put walls, cages, the counter) absorb a unit on arrival and show it in their
 * count. A real host replaces this file with its WMS and shop events.
 */
export function createEcommerceSimulation(scenario: EcommerceScenario = 'peak', seed = 7): EcommerceSimulation {
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
  const skuForInbound = () => Object.keys(SKUS).sort((a, b) => records.occupancy[SKUS[a].reserve] - records.occupancy[SKUS[b].reserve] || a.localeCompare(b))[Math.floor(random() * 3)];
  for (let i = 0; i < Math.min(STAGING_SPOTS.length, start.staging); i++) {
    const sku = skuForInbound(), id = spawn('pallet', STAGING_SPOTS[i], '', { sku, load: PALLET_CARTONS });
    units.get(id)!.label = palletLabel(id, sku); staging[i] = id;
  }
  // Roll cages are real wheeled units too; their nodes keep showing the snapshot's parcel count.
  for (const cage of Object.keys(CAGE_X)) { handling.register([{ id: `cage:${cage}`, asset: 'roll-cage' }]); handling.move([{ unit: `cage:${cage}`, to: { position: cageHome(cage), yaw: 0 } }]); }

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
    ...pickers.map((id, i) => ({ id, agent: 'picker', start: ['flow:F1:pick', 'flow:F3:pick', 'shelf:S1:pick-0'][i], travelPose: 'pushing', idlePose: 'pushing', handling: 'worker', node: staffNode(`Picker ${i + 1}`, i % 2 === 1) })),
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
    graph: warehouseNavigation, slots: ecommerceSlots, seed, handling,
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
      truckLoads.set(id, Array.from({ length: dock.pallets?.total ?? PALLETS_PER_TRUCK }, () => skuForInbound()));
      patchDock(id, { status: 'unloading', late: false, note: 'Forklift is unloading into the staging lane.' });
      log(`${dock.partner} docked at ${id}; ${dock.reference} unloading started.`);
      refreshAlerts();
    });
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
  function forkliftJob(): Task | undefined {
    const dock = records.docks.find(item => item.direction === 'inbound' && item.status === 'unloading' && item.pallets && item.pallets.done < item.pallets.total), spot = staging.findIndex((value, i) => !value && !stagingBooked.has(i));
    if (!dock || spot < 0 || !dock.pallets || !truckLoads.get(dock.id)?.length) return undefined;
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
        2: () => { stagingBooked.delete(spot); staging[spot] = pallet; patch({ staging: staging.filter(Boolean).length }); },
      },
    };
  }

  /* ── Reach truck: put-away, replenishment and empty pallets ───────────── */

  function reachJob(): Task | undefined {
    for (const [face, job] of replenishing) if (job.ready && (units.get(job.pallet)?.load ?? 0) === 0) return emptyJob(face, job);
    const low = Object.keys(onHand).filter(sku => onHand[sku] < minimum[sku] && !replenishing.has(SKUS[sku].pick) && reservePallets(sku).length).sort((a, b) => onHand[a] - onHand[b])[0];
    if (low) return replenishJob(low);
    return putAwayJob();
  }
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
  function emptyJob(face: string, job: Replenishment): Task {
    const top = records.emptyPallets * STACKED_PALLET;
    const take = reachVisit(0, reachTake(0), { kind: 'interact', node: `replen:${face}`, slot: 'drop', seconds: 0, pickUp: [job.pallet], label: 'Picking up the empty pallet' });
    const put = reachVisit(2, reachPut(top), { kind: 'interact', node: 'pallet-stack', slot: 'drop', seconds: 0, putDown: 'all', putOn: { position: above(PALLET_STACK, top), yaw: ALONG_Z }, label: 'Adding it to the stack' });
    return reachTask(`Taking an empty pallet from ${face} to the stack`, take, put, { 0: () => { replenishing.delete(face); refreshAlerts(); }, 2: () => absorb(job.pallet, () => patch({ emptyPallets: Math.min(MAX_EMPTY_PALLETS, records.emptyPallets + 1) }), .1) });
  }
  function replenishJob(sku: string): Task {
    const { pick: face } = SKUS[sku], pallet = reservePallets(sku)[0], rack = inRack(pallet)!, job: Replenishment = { pallet, sku, ready: false }, place = rackPlace(pallet);
    claimed.add(pallet); replenishing.set(face, job); refreshAlerts();
    log(`${sku} is below its minimum; replenishment from ${rack} to ${face} started.`, onHand[sku] ? 'info' : 'critical');
    const take = reachVisit(0, reachTake(place.level), { kind: 'interact', node: `rack:${rack}`, slot: place.slot, seconds: 0, pickUp: [pallet], label: 'Taking the pallet out of the rack' });
    const put = reachVisit(2, reachPut(0), { kind: 'interact', node: `replen:${face}`, slot: 'drop', seconds: 0, putDown: 'all', putOn: { position: replenishSpot(face), yaw: ALONG_Z }, label: 'Setting it down behind the pick face' });
    return reachTask(`Replenishing ${face} from ${rack}`, take, put, { 0: () => occupy(rack, handling.contents(`rack:${rack}`).length), 2: () => { job.ready = true; claimed.delete(pallet); } });
  }
  function putAwayJob(): Task | undefined {
    const spot = staging.findIndex(Boolean);
    if (spot < 0) return undefined;
    // The emptiest rack of the SKU's family comes first, so both rows fill evenly; any free rack is the fallback.
    const pallet = staging[spot]!, sku = units.get(pallet)!.sku!, allRacks = LOCATIONS.filter(value => value.kind === 'rack').map(value => value.id);
    const racks = [...allRacks.filter(id => reserveOf(id) === SKUS[sku].reserve).sort((a, b) => records.occupancy[a] - records.occupancy[b]), ...allRacks];
    const target = racks.flatMap(id => handling.targets(pallet, { containers: [`rack:${id}`], limit: 1 }).map(found => ({ id, found })))[0];
    if (!target) return undefined;
    const { receptacle, position } = target.found.target, level = RACK_LEVELS[Number(receptacle.slice(6))];
    const take = reachVisit(0, reachTake(0), { kind: 'interact', node: `staging:${spot}`, slot: 'reach', seconds: 0, pickUp: [pallet], label: 'Taking a pallet from staging' });
    const put = reachVisit(2, reachPut(level), { kind: 'interact', node: `rack:${target.id}`, slot: `load-${position ?? 0}`, seconds: 0, putDown: 'all', putOn: { receptacle, position, turn: RACK_TURN }, label: `Lifting the pallet into ${target.id}` });
    return reachTask(`Putting ${sku} away to ${target.id}`, take, put, {
      0: () => { staging[spot] = null; patch({ staging: staging.filter(Boolean).length }); },
      2: () => { occupy(target.id, handling.contents(`rack:${target.id}`).length); refreshAlerts(); log(`Pallet ${pallet.slice(7)} of ${sku} put away to ${target.id}.`, 'success'); },
    });
  }

  /* ── Replenisher: carton by carton from the pallet into the pick face ─── */

  function replenisherJob(): Task | undefined {
    const entry = [...replenishing].find(([, job]) => job.ready && (units.get(job.pallet)?.load ?? 0) > 0);
    if (!entry) return undefined;
    const [face, job] = entry, sku = job.sku, x = replenishSpot(face)[0], carton = spawn('carton', [x - .35, FLOOR_Y + .75, -5.35], `Carton · ${sku}`, { sku, hidden: true });
    return {
      what: `Filling ${face} with ${sku}`,
      steps: [{ kind: 'interact', node: `replen:${face}`, slot: 'take', seconds: 1.8, pose: 'picking', pickUp: [carton], label: 'Taking a carton off the pallet' }, { kind: 'interact', node: `replen:${face}`, slot: 'fill', seconds: 1.8, pose: 'placing', putDown: 'all', putOn: handed(`replen:${face}:fill`, [x + .35, FLOOR_Y + 1.4, -4.35]), label: 'Filling the lane' }],
      started: { 0: () => show(carton) },
      items: {
        0: () => { const pallet = units.get(job.pallet); if (pallet?.load) { pallet.load--; sceneRevision++; } },
        1: () => absorb(carton, () => { onHand[sku] += UNITS_PER_CARTON; faceUnits[face] += UNITS_PER_CARTON; occupy(face as LocationId, Math.ceil(faceUnits[face] / UNITS_PER_CARTON)); refreshAlerts(); }),
      },
    };
  }

  /* ── Orders: picker → conveyor → robot → put wall → packer → cage ─────── */

  function pickerJob(id: string): Task | undefined {
    const order = [...records.orders.filter(value => value.stage === 'picking'), ...records.orders.filter(value => value.stage === 'released')].find(value => !claimed.has(value.id) && canPick(value));
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
    const bench = id.slice(7) as PackStationId, here = records.orders.find(order => order.at === bench && !claimed.has(order.id));
    if (here) return packJob(id, bench, here);
    const order = records.orders.find(value => value.at?.startsWith('P') && !claimed.has(value.id));
    if (!order) return undefined;
    claimed.add(order.id);
    const wall = order.at as PutWallId, carton = spawn('carton', [PUT_WALL_X[wall], FLOOR_Y + 1.1, -.95], `Goods · ${order.id}`, { orderId: order.id, hidden: true });
    return {
      what: `Fetching ${order.id} from put wall ${wall}`,
      steps: [{ kind: 'interact', node: `putwall:${wall}`, group: 'pick', seconds: 1.8, pose: 'picking', pickUp: [carton], label: 'Taking the order from the wall' }, { kind: 'interact', node: `pack:${bench}`, group: 'work', seconds: 1.6, pose: 'placing', putDown: 'all', putOn: { receptacle: 'surface' }, label: 'Putting it on the bench' }],
      started: { 0: () => show(carton) },
      items: { 0: () => patchOrder(order.id, { at: undefined, stage: 'packing' }), 1: () => absorb(carton, () => { patchOrder(order.id, { at: bench }); claimed.delete(order.id); }) },
    };
  }
  function packJob(id: string, bench: PackStationId, order: Order): Task {
    claimed.add(order.id);
    const home = PACK_X[bench], parcel = spawn('parcel', [home, FLOOR_Y + 1.2, 2.9], `Parcel · ${order.id}`, { orderId: order.id, hidden: true });
    const steps: BehaviorStep[] = [{ kind: 'interact', node: `pack:${bench}`, group: 'work', seconds: [6, 9], pickUp: [parcel], label: `Packing ${order.id}` }];
    const deliver = order.carrier ? freeCage(order.carrier) ?? carrierOf(order.carrier).cages[0] : undefined;
    if (deliver) steps.push({ kind: 'interact', node: `cage:${deliver}`, group: 'load', seconds: 1.5, pose: 'placing', putDown: 'all', putOn: handed(`cage:${deliver}:load`, above(cageHome(deliver), .6)), label: `Loading the ${carrierOf(order.carrier!).name} cage` });
    else steps.push({ kind: 'interact', node: 'collect:counter', slot: 'handover', seconds: 1.5, putDown: 'all', putOn: handed('collect:counter:handover', [-11.1, FLOOR_Y + 1.1, .8]), label: 'Handing over at click & collect' });
    return {
      what: `Packing ${order.id}`, steps,
      items: {
        0: () => { show(parcel); patchOrder(order.id, { at: undefined }); },
        1: () => absorb(parcel, () => { claimed.delete(order.id); patchOrder(order.id, { stage: deliver ? 'staged' : 'collect' }); log(deliver ? `Order ${order.id} staged for ${carrierOf(order.carrier!).name}.` : `Order ${order.id} is ready to collect.`, 'success'); }),
      },
    };
  }

  /* ── Dispatch: a full cage is pushed to the outbound truck ────────────── */

  const outbound = () => records.docks.find(dock => dock.direction === 'outbound');
  const loadingCarrier = () => { const dock = outbound(); return dock?.status === 'loading' ? CARRIERS.find(item => item.name === dock.partner) : undefined; };
  function dispatcherJob(): Task | undefined {
    const value = loadingCarrier();
    if (!value || !value.cages.length) return undefined;
    const parcels = stagedFor(records, value.id).length, dock = outbound()!;
    if (!parcels || outboundTrips >= 3) { departOutbound(dock); return undefined; }
    const cage = value.cages[0], unit = `cage:${cage}`;
    bookedCage = cage; outboundTrips++;
    return {
      what: `Loading ${value.name} at ${dock.id}`,
      steps: [{ kind: 'interact', node: unit, group: 'load', seconds: 1.4, pickUp: [unit], label: 'Taking the roll cage' }, { kind: 'interact', node: 'dock:D3', slot: 'load', seconds: 3, label: `Loading ${dock.reference}` }, { kind: 'interact', node: unit, group: 'load', seconds: 1.2, putDown: 'all', putOn: { position: cageHome(cage), yaw: 0 }, label: 'Returning the empty cage' }],
      ended: { 1: () => {
        const shipped = stagedFor(records, value.id).slice(0, 12);
        dropOrders(shipped.map(order => order.id)); patch({ shippedToday: records.shippedToday + shipped.length });
        log(`${shipped.length} parcels loaded on ${dock.reference} for ${value.name}.`, 'success');
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

  const openLanes = () => records.shop.checkouts.filter(lane => lane.open);
  const insideCount = () => [...shoppers.values()].filter(item => item.inside).length;
  const LEAVE: BehaviorStep = { kind: 'move', to: 'street', label: 'Leaving the shop' };
  const patchLane = (id: CheckoutId, delta: number) => patchShop({ checkouts: records.shop.checkouts.map(lane => lane.id === id ? { ...lane, queue: Math.max(0, lane.queue + delta) } : lane) });
  const finishVisit = (id: string, unit?: string) => { if (unit) retire(unit); shoppers.set(id, { inside: false, items: 0, basket: false }); sceneRevision++; };
  function checkoutSteps(id: string, lane: CheckoutId): Task {
    const bag = spawn('bag', [CHECKOUT_X[lane], FLOOR_Y + 1, .25], 'Shopping bag', { hidden: true }), shopper = shoppers.get(id)!;
    return {
      what: `Paying at checkout ${lane.slice(1)}`,
      steps: [{ kind: 'interact', node: `checkout:${lane}`, group: 'customer', seconds: 3.5, queue: queuePoints(lane), pose: 'placing', pickUp: [bag], label: 'Paying' }, LEAVE],
      started: { 0: () => { patchLane(lane, -1); show(bag); } },
      items: { 0: () => { patchShop({ sales: records.shop.sales + shopper.items * (12 + Math.floor(random() * 40)) }); shopper.basket = false; sceneRevision++; } },
      done: () => finishVisit(id, bag),
    };
  }
  function browseJob(id: string, gondolas: readonly (typeof GONDOLAS)[number][]): Task {
    const shopper = shoppers.get(id)!, lane = openLanes().sort((a, b) => a.queue - b.queue)[0], pay = checkoutSteps(id, lane.id), offset = gondolas.length;
    const steps: BehaviorStep[] = [...gondolas.map((item): BehaviorStep => ({ kind: 'interact', node: item.id, group: 'browse', seconds: [2.5, 4.5], label: 'Browsing' })), ...pay.steps];
    const ended = Object.fromEntries(gondolas.map((item, index) => [index, () => {
      // The shopper reaches into the shelf: the facing leaves it and lands in the basket in the same moment.
      if (records.shop.facings[item.department] > 0) { patchShop({ facings: { ...records.shop.facings, [item.department]: records.shop.facings[item.department] - 1 } }); shopper.items++; }
      if (index === gondolas.length - 1) { patchShop({ browsing: Math.max(0, records.shop.browsing - 1) }); patchLane(lane.id, 1); }
    }]));
    return { what: 'Shopping', steps, ended, started: { [offset]: pay.started![0] }, items: { [offset]: pay.items![0] }, done: pay.done };
  }
  const shelvesFor = (count: number, first?: (typeof GONDOLAS)[number]) => { const list = [...GONDOLAS].filter(item => item !== first && records.shop.facings[item.department] > 0), chosen = first ? [first] : []; while (chosen.length < count && list.length) chosen.push(list.splice(Math.floor(random() * list.length), 1)[0]); return chosen; };
  function arrive() {
    const id = shopperIds.find(item => !shoppers.get(item)!.inside && !tasks.has(item));
    if (!id || !openLanes().length) return;
    shoppers.set(id, { inside: true, items: 0, basket: true });
    patchShop({ browsing: records.shop.browsing + 1 });
    give(id, browseJob(id, shelvesFor(1 + Math.floor(random() * 2))));
  }
  function collectVisit() {
    const order = records.orders.find(value => value.stage === 'collect' && !claimed.has(value.id)), id = shopperIds.find(item => !shoppers.get(item)!.inside && !tasks.has(item));
    if (!order || !id) return;
    claimed.add(order.id);
    shoppers.set(id, { inside: true, items: 0, basket: false });
    patchShop({ collectWaiting: records.shop.collectWaiting + 1 });
    const parcel = spawn('parcel', [-12, FLOOR_Y + 1.1, 1.2], `Parcel · ${order.id}`, { orderId: order.id, hidden: true });
    give(id, {
      what: `Collecting ${order.id}`,
      steps: [{ kind: 'interact', node: 'collect:counter', group: 'customer', seconds: 4, pickUp: [parcel], label: 'Collecting the parcel' }, LEAVE],
      started: { 0: () => show(parcel) },
      items: { 0: () => { dropOrders([order.id]); claimed.delete(order.id); patch({ shippedToday: records.shippedToday + 1 }); patchShop({ collectWaiting: Math.max(0, records.shop.collectWaiting - 1) }); log(`${order.customer} collected order ${order.id}.`, 'success'); } },
      done: () => finishVisit(id, parcel),
    });
  }
  /** Customers set off from the same street point, so one waits for the next timer while the last is still close to it. */
  function fromStreet(visit: () => void) { if (runner.time - lastEntry < ENTRY_GAP) return; lastEntry = runner.time; visit(); }
  function fillerJob(): Task | undefined {
    const transfer = transfers[0], low = DEPARTMENTS.map(item => item.id).filter(id => records.shop.facings[id] < RESTOCK_BELOW).sort((a, b) => records.shop.facings[a] - records.shop.facings[b]);
    const department = transfer ?? low.find(id => Object.keys(SKUS).some(sku => SKUS[sku].pick === DEPARTMENT_FACES[id] && onHand[sku] >= minimum[sku] + UNITS_PER_CARTON));
    if (!department) return undefined;
    if (transfer) transfers.shift();
    const face = DEPARTMENT_FACES[department], sku = Object.keys(SKUS).filter(item => SKUS[item].pick === face).sort((a, b) => onHand[b] - onHand[a])[0];
    const gondola = GONDOLAS.filter(item => item.department === department)[records.shop.facings[department] % 2], x = replenishSpot(face)[0] + .75, carton = spawn('carton', [x, FLOOR_Y + 1, -4.35], `Carton · ${sku}`, { sku, hidden: true });
    return {
      what: `Restocking ${department} from ${face}`,
      steps: [{ kind: 'interact', node: `replen:${face}`, slot: 'shop', seconds: 1.8, pose: 'picking', pickUp: [carton], label: 'Taking a carton for the shop' }, { kind: 'interact', node: gondola.id, slot: 'fill', seconds: 3, putDown: 'all', putOn: handed(`${gondola.id}:fill`, [gondola.position[0] + .7, FLOOR_Y + 1, gondola.position[2] + .15]), label: 'Filling the gondola' }],
      started: { 0: () => show(carton) },
      items: {
        0: () => { if (!transfer) { onHand[sku] -= UNITS_PER_CARTON; faceUnits[face] = Math.max(0, faceUnits[face] - UNITS_PER_CARTON); occupy(face, Math.ceil(faceUnits[face] / UNITS_PER_CARTON)); refreshAlerts(); } },
        1: () => absorb(carton, () => { patchShop({ facings: { ...records.shop.facings, [department]: Math.min(MAX_FACINGS, records.shop.facings[department] + FACINGS_PER_CARTON) } }); log(`${DEPARTMENTS.find(item => item.id === department)!.label} gondola restocked with ${sku}.`, 'success'); }),
      },
    };
  }

  /* ── Scheduling ───────────────────────────────────────────────────────── */

  const JOBS: readonly (readonly [string, () => Task | undefined])[] = [
    ...(forklift ? [['forklift', forkliftJob] as const] : []), ...(reachTruck ? [['reach-truck', reachJob] as const] : []), ...(replenisher ? [['replenisher', replenisherJob] as const] : []),
    ...pickers.map(id => [id, () => pickerJob(id)] as const), ...robots.map(id => [id, () => robotJob(id)] as const), ...packers.map(id => [id, () => packerJob(id)] as const),
    ...(dispatcher ? [['dispatcher', dispatcherJob] as const] : []), ...(filler ? [['shelf-filler', fillerJob] as const] : []),
  ];
  function dispatch() { for (const [agent, job] of JOBS) { if (tasks.has(agent)) continue; const task = job(); if (task) give(agent, task); } }
  function handle(event: BehaviorEvent) {
    const task = tasks.get(event.agent);
    if (event.type === 'blocked') { log(`${event.agent} stopped: ${event.violations[0]?.message ?? 'blocked'}`, 'critical'); tasks.delete(event.agent); cached = null; recordsRevision++; return; }
    if (!task) return;
    if (event.type === 'interaction-started') task.started?.[event.step]?.();
    if (event.type === 'interaction-ended') task.ended?.[event.step]?.();
    if (event.type === 'finished') { tasks.delete(event.agent); task.done?.(); cached = null; recordsRevision++; }
  }
  function everySoFar(seconds: number, run: () => void) { const tick = () => { run(); later(seconds * (.7 + random() * .6), tick); }; later(seconds, tick); }
  function newOrder() {
    if (records.orders.filter(order => ['released', 'picking', 'sorting', 'packing'].includes(order.stage)).length >= MAX_OPEN_WORK) return;
    const sku = pick(Object.keys(SKUS)), collect = random() < .2, quantity = 1 + Math.floor(random() * 2), id = `#${nextOrder++}`;
    const order: Order = { id, customer: pick(CUSTOMERS), channel: collect ? 'click-collect' : random() < .3 ? 'marketplace' : 'web', stage: 'released', placed: records.time, value: 20 + Math.floor(random() * 120), lines: [{ sku, quantity, picked: 0 }], ...(collect ? {} : { carrier: random() < .5 ? 'swift' as const : 'parcelo' as const }) };
    patch({ orders: [...records.orders, order], ordersToday: records.ordersToday + 1 });
  }

  // Starting state: docked trucks, people already at work in the shop, and the first deliveries.
  for (const dock of start.docks) if (dock.status === 'unloading' || dock.status === 'loading') { trucks.set(dock.id, { docked: true, color: dock.direction === 'outbound' ? '#c8553d' : '#4a7fb0' }); }
  for (const dock of start.docks) {
    if (dock.status === 'unloading' && dock.pallets) { const left = dock.pallets.total - dock.pallets.done; truckLoads.set(dock.id, Array.from({ length: left }, () => skuForInbound())); if (!left) later(8, () => finishInbound(dock.id)); }
    if (dock.status === 'expected') later(45, () => arriveInbound(dock.id));
  }
  if (start.parceloVan) later(30, () => arriveOutbound('parcelo'));
  if (forklift && start.docks.every(dock => dock.status === 'free' || dock.direction === 'outbound')) later(30, bookInbound);
  if (start.crew.picking) everySoFar(30, newOrder);
  if (start.shopOpen) { const target = start.shop.browsing + start.shop.checkouts.reduce((sum, lane) => sum + lane.queue, 0); everySoFar(6, () => { if (insideCount() < target) fromStreet(arrive); }); everySoFar(40, () => fromStreet(collectVisit)); }
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
    const base = { asset: ASSETS[unit.kind], scale: SCALES[unit.kind], ...(unit.kind === 'pallet' ? {} : { transfer: { seconds: HAND_OVER, arc: 0 } }), selectable: true, entityId: id, label: unit.label, labelMode: 'active' as const, ...(unit.kind === 'pallet' ? { count: unit.load ?? 0 } : unit.kind === 'tote' ? { count: 2 } : {}) };
    const node = itemNode(id, at, base);
    return unit.ride ? { ...node, position: unit.ride.points[unit.ride.points.length - 1], rotation: [0, Math.PI / 2, 0], route: { points: unit.ride.points, speed: BELT_SPEED, elapsed: time - unit.ride.start } } : node;
  }
  function agentNodes(state: AgentState, time: number): SceneNode[] {
    const definition = definitions.find(item => item.id === state.id)!, shopper = shoppers.get(state.id);
    if (shopper && !shopper.inside) return [];
    const motion = forks.get(state.id), node = behaviorNode(state, { ...definition.node, ...(motion ? { forks: motion } : {}) }, { time }), attached: AssetNode[] = [];
    if (state.id.startsWith('picker:')) attached.push({ id: `${state.id}:cart`, kind: 'asset', asset: 'picking-cart', position: [0, 0, 0], count: carts[state.id], selectable: false, attachment: { nodeId: state.id, anchor: 'cart' } });
    if (shopper?.basket) attached.push({ id: `${state.id}:basket`, kind: 'asset', asset: 'hand-basket', position: [0, 0, 0], count: Math.min(4, shopper.items), selectable: false, attachment: { nodeId: state.id, anchor: 'hand' } });
    return [node, ...attached];
  }
  function movers(): SceneNode[] {
    const time = runner.time, nodes: SceneNode[] = runner.getAgents().flatMap(state => agentNodes(state, time));
    for (const [id, at] of runner.getItems()) { const unit = units.get(id); if (unit && !unit.hidden) nodes.push(unitNode(id, at, unit, time)); }
    for (const [id, truck] of trucks) nodes.push({ id: `truck:${id}`, kind: 'asset', asset: 'truck', position: [truck.docked ? TRUCK_X : YARD_X, APRON_Y, DOCK_Z[id]], rotation: [0, Math.PI / 2, 0], color: truck.color, selectable: false, controller: { kind: 'dock-shunt', options: { speed: 3 } } });
    return nodes;
  }
  function cagePlacements() {
    const items = runner.getItems();
    return Object.fromEntries(Object.keys(CAGE_X).map(cage => { const { position, rotation, attachment } = itemNode(`cage:${cage}`, items.get(`cage:${cage}`)!, { asset: 'roll-cage' }); return [cage, { position, rotation, attachment }]; }));
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
    dispose() { stopEvents(); stopState(); runner.dispose(); },
  };
}

/** A scene store for a scenario's starting state; the dashboard then publishes `simulation.nodes()` to it. */
export function createEcommerceStore(scenario: EcommerceScenario = 'peak', simulation = createEcommerceSimulation(scenario)): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: simulation.nodes() }, { zoom: DEFAULT_ZOOM });
}
