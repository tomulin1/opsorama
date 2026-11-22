import { BOOTH, DINING_SEATS, DINING_TABLE, SERVING_PLATES, personHairColor } from '@opsorama/objects';
import { createSceneStore, type AssetNode, type NodeRoute, type SceneNode, type SceneStore, type Vec3, type VisualState } from '@opsorama/core';
import { closeWallJoints } from '../example-walls';
import { HAND_OFF, actorPose, compileService, platesAt, routeAtPhase, type FloorPoint, type PlateRest, type ServiceActor, type ServiceCycle, type ServicePlan, type ServiceStop } from './service';

/** Floor service status of one table, as reported by the host's POS or reservation source. */
export type TableStatus = 'free' | 'reserved' | 'seated' | 'ordered' | 'eating' | 'waiting' | 'bill';
export type TicketStatus = 'queued' | 'cooking' | 'late' | 'ready';
export type StationId = 'grill' | 'pizza' | 'cold' | 'bar' | 'pass' | 'pickup';
export type Channel = 'dine-in' | 'takeout' | 'delivery';
export type RestaurantScenario = 'rush' | 'quiet' | 'closed';

export const TABLE_STATUS: Readonly<Record<TableStatus, { label: string; color: string; state: VisualState }>> = {
  free: { label: 'Free', color: '#91a0b5', state: 'inactive' },
  reserved: { label: 'Reserved', color: '#8c7bc4', state: 'inactive' },
  seated: { label: 'Seated', color: '#5088ec', state: 'busy' },
  ordered: { label: 'Ordered', color: '#5088ec', state: 'busy' },
  eating: { label: 'Eating', color: '#38a88a', state: 'normal' },
  waiting: { label: 'Food delayed', color: '#df6470', state: 'critical' },
  bill: { label: 'Bill requested', color: '#dca644', state: 'warning' },
};
export const TICKET_STATUS: Readonly<Record<TicketStatus, { label: string; state: VisualState }>> = {
  queued: { label: 'Queued', state: 'inactive' },
  cooking: { label: 'Cooking', state: 'busy' },
  late: { label: 'Late', state: 'critical' },
  ready: { label: 'Ready', state: 'normal' },
};

export interface TableLayout { id: string; label: string; area: 'Dining room' | 'Booths' | 'Bar' | 'Lounge' | 'Terrace'; asset: 'dining-table' | 'booth-seating'; variant?: 'square' | 'round'; seats: number; position: readonly [number, number]; rotation?: number; }
/** Fixed floor plan. Positions are illustrative metres; table identities come from the host. */
export const TABLE_LAYOUT: readonly TableLayout[] = [
  { id: 'T1', label: 'Table 1', area: 'Dining room', asset: 'dining-table', variant: 'square', seats: 4, position: [-12.5, -2.2] },
  { id: 'T2', label: 'Table 2', area: 'Dining room', asset: 'dining-table', variant: 'round', seats: 4, position: [-9, -2.2] },
  { id: 'T3', label: 'Table 3', area: 'Dining room', asset: 'dining-table', variant: 'square', seats: 4, position: [-5.5, -2.2] },
  { id: 'T4', label: 'Table 4', area: 'Dining room', asset: 'dining-table', variant: 'round', seats: 4, position: [-12.5, 1.6] },
  { id: 'T5', label: 'Table 5', area: 'Dining room', asset: 'dining-table', variant: 'square', seats: 4, position: [-9, 1.6] },
  { id: 'T6', label: 'Table 6', area: 'Dining room', asset: 'dining-table', variant: 'round', seats: 4, position: [-5.5, 1.6] },
  { id: 'B7', label: 'Booth 7', area: 'Booths', asset: 'booth-seating', seats: 4, position: [-1.4, -2.9], rotation: Math.PI / 2 },
  { id: 'B8', label: 'Booth 8', area: 'Booths', asset: 'booth-seating', seats: 4, position: [-1.4, -1], rotation: Math.PI / 2 },
  { id: 'B9', label: 'Booth 9', area: 'Booths', asset: 'booth-seating', seats: 4, position: [-1.4, .9], rotation: Math.PI / 2 },
  { id: 'T10', label: 'Table 10', area: 'Bar', asset: 'dining-table', variant: 'round', seats: 4, position: [12, -8.2] },
  { id: 'T11', label: 'Table 11', area: 'Lounge', asset: 'dining-table', variant: 'square', seats: 4, position: [5.4, .4] },
  { id: 'T12', label: 'Table 12', area: 'Terrace', asset: 'dining-table', variant: 'round', seats: 4, position: [-11.5, 6.1] },
  { id: 'T13', label: 'Table 13', area: 'Terrace', asset: 'dining-table', variant: 'round', seats: 4, position: [-7, 6.1] },
  { id: 'T14', label: 'Table 14', area: 'Terrace', asset: 'dining-table', variant: 'square', seats: 4, position: [-2.5, 6.1] },
];

export interface TableSession { tableId: string; status: TableStatus; party: number; server?: string; minutes?: number; guestName?: string; note: string; }
export interface KitchenTicket { id: string; channel: Channel; tableId?: string; station: Exclude<StationId, 'pass' | 'pickup'>; status: TicketStatus; items: readonly string[]; minutes: number; target: number; }
export interface RestaurantSnapshot { scenario: RestaurantScenario; time: string; tables: readonly TableSession[]; tickets: readonly KitchenTicket[]; barGuests: number; cooler: { celsius: number; limit: number }; open: boolean; }

export const STATIONS: readonly { id: StationId; label: string; description: string }[] = [
  { id: 'grill', label: 'Grill line', description: 'Hot line for mains and burgers.' },
  { id: 'pizza', label: 'Pizza oven', description: 'Wood-fired oven for pizzas and flatbreads.' },
  { id: 'cold', label: 'Cold prep', description: 'Starters, salads and desserts.' },
  { id: 'bar', label: 'Bar & coffee', description: 'Drinks, cocktails and espresso.' },
  { id: 'pass', label: 'Pass', description: 'Plated dine-in orders waiting for a server.' },
  { id: 'pickup', label: 'Pickup', description: 'Bagged takeout and delivery orders.' },
];
/** The pickup shelf shows at most this many ready orders; the HTML keeps exact totals. */
export const PICKUP_CAPACITY = 9;

const T = (tableId: string, status: TableStatus, party: number, note: string, extra: Partial<TableSession> = {}): TableSession => ({ tableId, status, party, note, ...extra });
const free = (tableId: string) => T(tableId, 'free', 0, 'Clean and ready for the next party.');
export const SCENARIOS: Readonly<Record<RestaurantScenario, RestaurantSnapshot>> = {
  rush: { scenario: 'rush', time: '19:42', open: true, barGuests: 3, cooler: { celsius: 5.8, limit: 5 }, tables: [
    T('T1', 'eating', 4, 'Mains served 12 minutes ago. Dessert menu next.', { server: 'Ana', minutes: 52 }),
    T('T2', 'ordered', 2, 'Starters firing on cold prep.', { server: 'Ana', minutes: 14 }),
    T('T3', 'waiting', 3, 'Mains are 9 minutes over the 18-minute target. Check the grill ticket.', { server: 'Ben', minutes: 38 }),
    T('T4', 'bill', 2, 'Guests asked for the bill; card terminal requested.', { server: 'Ben', minutes: 71 }),
    T('T5', 'seated', 4, 'Menus and water delivered; drinks order pending.', { server: 'Cleo', minutes: 4 }),
    T('T6', 'reserved', 4, 'Reservation at 19:45. Covers laid for four.', { guestName: 'Novák' }),
    T('B7', 'eating', 4, 'Dessert ready at the pass.', { server: 'Cleo', minutes: 64 }),
    T('B8', 'ordered', 3, 'Burgers on the grill.', { server: 'Cleo', minutes: 21 }),
    free('B9'),
    T('T10', 'seated', 2, 'Drinks at the bar ticket.', { server: 'Dan', minutes: 9 }),
    T('T11', 'eating', 3, 'Sharing plates; mains finished.', { server: 'Cleo', minutes: 46 }),
    T('T12', 'eating', 2, 'Pizzas waiting at the pass for a runner.', { server: 'Dan', minutes: 33 }),
    T('T13', 'ordered', 4, 'Pizzas in the oven.', { server: 'Dan', minutes: 17 }),
    free('T14'),
  ], tickets: [
    { id: '#2041', channel: 'dine-in', tableId: 'T3', station: 'grill', status: 'late', items: ['Ribeye ×2', 'Sea bass'], minutes: 27, target: 18 },
    { id: '#2045', channel: 'takeout', station: 'pizza', status: 'ready', items: ['Margherita', 'Diavola'], minutes: 14, target: 15 },
    { id: '#2046', channel: 'delivery', station: 'grill', status: 'ready', items: ['Burger ×2', 'Fries ×2'], minutes: 16, target: 18 },
    { id: '#2047', channel: 'dine-in', tableId: 'T2', station: 'cold', status: 'cooking', items: ['Burrata', 'Caesar salad'], minutes: 6, target: 10 },
    { id: '#2048', channel: 'dine-in', tableId: 'T12', station: 'pizza', status: 'ready', items: ['Margherita', 'Quattro formaggi'], minutes: 13, target: 12 },
    { id: '#2049', channel: 'dine-in', tableId: 'B8', station: 'grill', status: 'cooking', items: ['Burger ×3', 'Fries ×3'], minutes: 11, target: 16 },
    { id: '#2050', channel: 'dine-in', tableId: 'T13', station: 'pizza', status: 'cooking', items: ['Diavola ×2', 'Margherita ×2'], minutes: 5, target: 12 },
    { id: '#2051', channel: 'delivery', station: 'pizza', status: 'queued', items: ['Capricciosa', 'Tiramisu'], minutes: 1, target: 15 },
    { id: '#2052', channel: 'takeout', station: 'cold', status: 'ready', items: ['Caprese', 'Panna cotta'], minutes: 9, target: 10 },
    { id: '#2053', channel: 'dine-in', tableId: 'T10', station: 'bar', status: 'cooking', items: ['Espresso ×2', 'Negroni'], minutes: 2, target: 5 },
    { id: '#2054', channel: 'dine-in', tableId: 'B7', station: 'cold', status: 'ready', items: ['Tiramisu ×2', 'Affogato ×2'], minutes: 7, target: 8 },
    { id: '#2055', channel: 'delivery', station: 'grill', status: 'queued', items: ['Steak frites'], minutes: 0, target: 18 },
  ] },
  quiet: { scenario: 'quiet', time: '15:10', open: true, barGuests: 1, cooler: { celsius: 3.2, limit: 5 }, tables: [
    free('T1'), free('T2'), free('T3'), free('T4'),
    T('T5', 'eating', 2, 'Late lunch, mains served.', { server: 'Ana', minutes: 41 }),
    free('T6'),
    T('B7', 'seated', 2, 'Coffee order expected.', { server: 'Ana', minutes: 3 }),
    free('B8'), free('B9'),
    T('T10', 'bill', 1, 'Paying at the bar.', { server: 'Dan', minutes: 26 }),
    free('T11'),
    T('T12', 'ordered', 2, 'Salads on cold prep.', { server: 'Dan', minutes: 8 }),
    free('T13'), free('T14'),
  ], tickets: [
    { id: '#3011', channel: 'dine-in', tableId: 'T12', station: 'cold', status: 'cooking', items: ['Niçoise', 'Caesar salad'], minutes: 4, target: 10 },
    { id: '#3012', channel: 'takeout', station: 'pizza', status: 'ready', items: ['Margherita'], minutes: 11, target: 15 },
  ] },
  closed: { scenario: 'closed', time: '23:58', open: false, barGuests: 0, cooler: { celsius: 2.9, limit: 5 }, tables: TABLE_LAYOUT.map(table => free(table.id)), tickets: [] },
};

export const isOccupied = (session: TableSession) => !['free', 'reserved'].includes(session.status);
export function restaurantMetrics(snapshot: RestaurantSnapshot) {
  const occupied = snapshot.tables.filter(isOccupied), open = snapshot.tickets;
  return {
    guests: occupied.reduce((sum, table) => sum + table.party, 0) + snapshot.barGuests, occupied: occupied.length, tables: TABLE_LAYOUT.length,
    tickets: open.length, late: open.filter(ticket => ticket.status === 'late').length, ready: open.filter(ticket => ticket.status === 'ready').length,
  };
}
/** Tickets a station currently holds: kitchen stations own unfinished work, the pass and pickup shelf own ready orders. */
export function stationTickets(snapshot: RestaurantSnapshot, station: StationId): KitchenTicket[] {
  if (station === 'pass') return snapshot.tickets.filter(ticket => ticket.status === 'ready' && ticket.channel === 'dine-in');
  if (station === 'pickup') return snapshot.tickets.filter(ticket => ticket.status === 'ready' && ticket.channel !== 'dine-in');
  return snapshot.tickets.filter(ticket => ticket.station === station && ticket.status !== 'ready');
}
export function stationState(snapshot: RestaurantSnapshot, station: StationId): VisualState {
  const tickets = stationTickets(snapshot, station);
  if (!snapshot.open) return 'inactive';
  if (tickets.some(ticket => ticket.status === 'late')) return 'critical';
  return tickets.length ? 'busy' : 'normal';
}

const v = (x: number, z: number, y = 0): Vec3 => [x, y, z];
const GUEST_TONES = ['#6489d6', '#d08b5b', '#7fae8e', '#b07cc6', '#e0b44c', '#5f9fb8', '#c46b6b', '#8a9bb0'] as const;
const SERVER = '#2f3e4f';
/** Guests alternate between two person characters so tables read as the public, not staff. */
const GUEST_ASSETS = ['visitor', 'office-worker'] as const;
/** A standing person; `asset` picks the character (chef, worker, visitor, ...) and `color` its main color role. */
const person = (id: string, asset: string, position: Vec3, rotation: number, variant: string, color?: string, label?: string, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, kind: 'asset', asset, variant, ...(color ? { color } : {}), position, rotation: [0, rotation, 0], ...(label ? { label, labelMode: 'active' as const } : {}), selectable: false, materials: { hair: personHairColor(id) }, ...extra });
const worker = (id: string, position: Vec3, rotation: number, variant: string, color: string, label?: string) => person(id, 'worker', position, rotation, variant, color, label);
const chef = (id: string, position: Vec3, rotation: number, variant: string, label: string, extra: Partial<AssetNode> = {}) => person(id, 'chef', position, rotation, variant, undefined, label, extra);
/** Mixed crews and guests: some people use the feminine figure. */
const FEMININE = { options: { person: { figure: 'feminine' } } } as const satisfies Partial<AssetNode>;
const decor = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });

/** A floor point `[x, z]` walked through, or `[x, z, yaw, seconds]` where the person pauses facing `yaw` (0 faces +z). */
type Waypoint = readonly [x: number, z: number, yaw?: number, seconds?: number];
/** A looping walk that returns to its first point; `elapsed` staggers people who share the floor. */
function walk(points: readonly Waypoint[], speed: number, elapsed = 0): NodeRoute {
  const stops = points.flatMap(([, , yaw, seconds], index) => yaw === undefined ? [] : [{ index, seconds: seconds ?? 3, yaw }]);
  return { points: [...points, points[0]].map(([x, z]) => v(x, z)), speed, loop: true, elapsed, stops };
}
/** A person who walks `route`; the route owns position and heading, so the node starts at its first point. */
const walking = (node: AssetNode, route: NodeRoute): AssetNode => ({ ...node, position: route.points[0], route });
const N = 0, S = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;
/** After close, one server checks every table around the dining room. */
const CLOSING_WALK = walk([[-6.5, -4.4, S, 4], [-13.7, -3.95], [-13.7, 2.9, E, 3], [-3.6, 2.9, N, 3], [-3.6, -3.95]], .9);
/** The courier walks between the cargo bike and the pickup shelf. */
const COURIER_WALK = walk([[10, 6.6, W, 4], [13.15, .6, E, 6]], 1.2);
/** The arriving party walks in from the street once and waits at the host stand. */
const arrival = (from: Vec3, to: Vec3): NodeRoute => ({ points: [from, to], speed: 1, endYaw: S });

/*
 * The service loop. Each dine-in kitchen ticket of the snapshot is one course: its cook plates it at the station,
 * carries it to the pass and goes back; the table's server collects it, sets one plate on each of up to two occupied
 * place settings, comes back once the guests have finished, clears the empty plates and drops them at the dish machine,
 * where they go in to be washed. The loop lasts `SERVICE_PERIOD` seconds and starts at the snapshot: ready tickets wait
 * on the pass, the others are still at their stations.
 */

/** Seconds of one service loop. */
export const SERVICE_PERIOD = 150;
/** A person's carry anchor sits this far in front of the root. Plates in hand rest `PLATE_LIFT` higher, on the forearms and hands of the holding pose; the lift is inside the rig, so it follows the feminine scale and the gait. */
export const CARRY_AHEAD = .49, PLATE_LIFT = .3;
/** A plate set down rests on a place setting's plate, which is this high above the table top. */
const ON_SETTING = .016;
/** Plates move between hands, stations, the pass, tables and the dish machine along a short arc. */
const PLATE_TRANSFER = { seconds: .8, arc: .25 } as const;

/**
 * Kitchen and service walkways. Cooks walk the cook lane (z −7.5) between their stations and the kitchen side of the
 * pass; servers enter the kitchen through the door west of the pass (x −7.9) and walk the server lane (z −6.85) to the
 * dish machine's inlet table, which faces the door. In the dining room they use the aisles x −10.75, −7.5, −4.15 and
 * −3.25, z −3.75 along the kitchen partitions (z −4.1 past booth 7 to the lounge aisle x 0), z −0.3 between the table rows
 * and z 3.3 in front of them. Servers step up
 * from the partition aisle to the pass, so people walking the aisle pass behind anyone standing at it.
 */
const COOK_LANE = -7.5, SERVER_LANE = -6.85, DOOR_X = -7.9, ALONG_PARTITIONS = -3.75, BEHIND_BOOTHS = -4.1;
/** Each kitchen station uses one pair of pass slots; the cook and the server stand in front of the pair. */
type PassPair = 'left' | 'middle' | 'right';
const PASS_X: Readonly<Record<PassPair, number>> = { left: -7.1, middle: -6.5, right: -5.9 };
const PASS_SLOTS: Readonly<Record<PassPair, readonly [number, number]>> = { left: [0, 1], middle: [2, 3], right: [4, 5] };
const PASS_COOK_Z = -6.2, PASS_SERVER_Z = -4.55;
type CookStation = Exclude<StationId, 'bar' | 'pass' | 'pickup'>;
/** Where each cook works, facing the station, and where its plated dishes wait (local to the station node). */
const KITCHEN: Readonly<Record<CookStation, { spot: FloorPoint; pass: PassPair; plating: readonly Vec3[] }>> = {
  grill: { spot: [-12, -9.45], pass: 'left', plating: [[.45, .92, .1], [.75, .92, .1]] },
  pizza: { spot: [-8.2, -8.45], pass: 'middle', plating: [[-.66, .98, .6], [-.36, .98, .94]] },
  cold: { spot: [-4.4, -9.45], pass: 'right', plating: [[-.55, .93, .05], [-.25, .93, .05]] },
};
const DISH: FloorPoint = [-9.15, SERVER_LANE];
/** Through the kitchen door to the dish machine, from the aisle along the partitions. */
const TO_DISH: readonly FloorPoint[] = [[DOOR_X, ALONG_PARTITIONS], [DOOR_X, SERVER_LANE]];
/** From the dish machine back out through the door to the pass. */
const DISH_TO_PASS: readonly FloorPoint[] = [[DOOR_X, SERVER_LANE], [DOOR_X, ALONG_PARTITIONS]];

const covers = (snapshot: RestaurantSnapshot, tableId: string) => { const layout = TABLE_LAYOUT.find(table => table.id === tableId)!, session = snapshot.tables.find(table => table.tableId === tableId); return !session || session.status === 'free' ? 0 : Math.min(layout.seats, session.party); };
/**
 * The place settings of `layout` that plates go on: occupied seats first, then the seats nearest to where the server
 * stands. Positions and yaw are local to the table's top anchor.
 */
function plateSettings(layout: TableLayout, occupied: number, from: FloorPoint): { position: Vec3; yaw: number }[] {
  const turn = layout.rotation ?? 0, settings = layout.asset === 'booth-seating'
    ? BOOTH.seats.map(([x, z]) => ({ x, z: Math.sign(z) * BOOTH.settingZ, yaw: z > 0 ? 0 : Math.PI }))
    : DINING_SEATS.map(([x, z]) => ({ x: x * DINING_TABLE.settingOffset, z: z * DINING_TABLE.settingOffset, yaw: Math.atan2(x, z) }));
  const distance = ({ x, z }: { x: number; z: number }) => Math.hypot(layout.position[0] + x * Math.cos(turn) + z * Math.sin(turn) - from[0], layout.position[1] - x * Math.sin(turn) + z * Math.cos(turn) - from[1]);
  return settings.map((setting, seat) => ({ setting, seat })).sort((a, b) => Number(b.seat < occupied) - Number(a.seat < occupied) || distance(a.setting) - distance(b.setting))
    .map(({ setting }) => ({ position: [setting.x, ON_SETTING, setting.z], yaw: setting.yaw }));
}

/** A course's table, station and plate count (one per guest, at most the two a person carries). */
interface CourseInfo { table: string; station: CookStation; plates: number; }
function courseOf(snapshot: RestaurantSnapshot, ticketId: string): CourseInfo {
  const ticket = snapshot.tickets.find(item => item.id === ticketId);
  if (!ticket?.tableId || ticket.channel !== 'dine-in' || ticket.station === 'bar') throw new Error(`Service course ${ticketId} needs a dine-in kitchen ticket with a table in the ${snapshot.scenario} snapshot.`);
  const plates = Math.min(2, covers(snapshot, ticket.tableId));
  if (!plates) throw new Error(`Service course ${ticketId} is for table ${ticket.tableId}, which has no guests in the ${snapshot.scenario} snapshot.`);
  return { table: ticket.tableId, station: ticket.station as CookStation, plates };
}

/** Stops of a cook who plates `courses` (ticket, leave time) in order and carries each to the pass. */
function cookStops(snapshot: RestaurantSnapshot, station: CookStation, courses: readonly (readonly [ticket: string, leave: number])[]): ServiceStop[] {
  const { spot, pass } = KITCHEN[station], passSpot: FloorPoint = [PASS_X[pass], PASS_COOK_Z];
  const toPass: FloorPoint[] = [[spot[0], COOK_LANE], [passSpot[0], COOK_LANE]], back = [...toPass].reverse();
  return courses.flatMap(([ticket, leave]): ServiceStop[] => {
    const { plates } = courseOf(snapshot, ticket);
    return [
      { via: back, at: spot, yaw: S, pose: 'working', leave, action: { take: ticket } },
      { via: toPass, at: passSpot, yaw: N, dwell: 2.5, action: { put: ticket, on: PASS_SLOTS[pass].slice(0, plates).map(slot => ({ node: 'station:pass', anchor: `slot-${slot}`, offset: [0, 0, 0] })) } },
    ];
  });
}
const passX = (snapshot: RestaurantSnapshot, ticket: string) => PASS_X[KITCHEN[courseOf(snapshot, ticket).station].pass];
/** A server's stop at the pass that collects `ticket`, stepping up from the partition aisle. */
const collect = (snapshot: RestaurantSnapshot, ticket: string, leave: number, via: readonly FloorPoint[]): ServiceStop => ({ via: [...via, [passX(snapshot, ticket), ALONG_PARTITIONS]], at: [passX(snapshot, ticket), PASS_SERVER_Z], yaw: S, leave, action: { take: ticket } });
/**
 * A server's stop at a table that sets `ticket`'s plates on the guests' settings. It follows the stop that collected
 * the ticket, so the walk starts by stepping back from the pass.
 */
function serve(snapshot: RestaurantSnapshot, ticket: string, at: FloorPoint, yaw: number, via: readonly FloorPoint[] = []): ServiceStop {
  const { table, plates } = courseOf(snapshot, ticket), layout = TABLE_LAYOUT.find(item => item.id === table)!;
  const on = plateSettings(layout, covers(snapshot, table), at).slice(0, plates).map(({ position, yaw: heading }): PlateRest => ({ node: `table:${table}`, anchor: 'top', offset: position, yaw: heading }));
  return { via: [[passX(snapshot, ticket), ALONG_PARTITIONS], ...via], at, yaw, dwell: 3, action: { put: ticket, on } };
}
/** A server's stop at a table that clears `ticket`'s empty plates. */
const clear = (ticket: string, at: FloorPoint, yaw: number, leave: number, via?: readonly FloorPoint[]): ServiceStop => ({ ...(via ? { via } : {}), at, yaw, leave, action: { take: ticket } });
/** A server's stop at the dish machine inlet that drops `ticket`'s plates. */
const dropAtDish = (snapshot: RestaurantSnapshot, ticket: string, via: readonly FloorPoint[]): ServiceStop => ({
  via, at: DISH, yaw: N, dwell: 2.5,
  action: { put: ticket, on: (courseOf(snapshot, ticket).plates === 1 ? [0] : [-.14, .14]).map((z): PlateRest => ({ node: 'equipment:dish', anchor: 'inlet', offset: [0, 0, z] })) },
});

/** One person of the service loop: the plan's stops and the node it walks as; the loop sets its pose. */
export interface ServicePerson { actor: ServiceActor; node: Omit<AssetNode, 'id' | 'route'>; }
const chefNode = (label: string, extra: Partial<AssetNode> = {}): ServicePerson['node'] => ({ kind: 'asset', asset: 'chef', variant: 'working', label, labelMode: 'active', selectable: false, ...extra });
const serverNode = (label: string, extra: Partial<AssetNode> = {}): ServicePerson['node'] => ({ kind: 'asset', asset: 'worker', variant: 'walking', color: SERVER, label, labelMode: 'active', selectable: false, ...extra });
/** Servers' tables: the stop beside each table, and the heading toward it. */
const AT: Readonly<Record<string, readonly [FloorPoint, number]>> = {
  T1: [[-10.75, -1.9], W], T2: [[-10.75, -2.5], E], T3: [[-4.15, -2.2], W], T4: [[-12.5, -.3], N], T6: [[-5.5, -.3], N],
  B7: [[-3.25, -2.9], E], B8: [[0, -1], W], T11: [[4.1, .4], E], T12: [[-11.5, 4.75], N], T13: [[-7, 4.75], N], T14: [[-2.5, 4.75], N],
};
/** A server's stop beside `table` without plates: an order, a bill or a check. */
const stopAt = (table: string, timing: { dwell: number } | { leave: number }, via?: readonly FloorPoint[]): ServiceStop => ({ ...(via ? { via } : {}), at: AT[table][0], yaw: AT[table][1], ...timing });

function rushService(snapshot: RestaurantSnapshot): ServicePerson[] {
  const id = (name: string) => `staff:rush:${name}`;
  const toTerrace: FloorPoint[] = [[-7.5, ALONG_PARTITIONS], [-7.5, 3.3]], fromTerrace: FloorPoint[] = [[-7.5, 3.3], [-7.5, ALONG_PARTITIONS]];
  return [
    { actor: { id: id('grill'), speed: 1, stops: cookStops(snapshot, 'grill', [['#2049', 8], ['#2041', 40]]) }, node: chefNode('Grill cook') },
    { actor: { id: id('pizza'), speed: 1, stops: cookStops(snapshot, 'pizza', [['#2050', 28], ['#2048', 125]]) }, node: chefNode('Pizzaiolo', FEMININE) },
    { actor: { id: id('cold'), speed: 1, stops: cookStops(snapshot, 'cold', [['#2047', 20], ['#2054', 128]]) }, node: chefNode('Cold prep') },
    // Table 2, and the dessert menu at table 1.
    { actor: { id: id('ana'), speed: 1.1, stops: [
      collect(snapshot, '#2047', 40, [[AT.T1[0][0], ALONG_PARTITIONS], [-7.5, ALONG_PARTITIONS]]),
      serve(snapshot, '#2047', ...AT.T2, [[AT.T2[0][0], ALONG_PARTITIONS]]),
      stopAt('T1', { leave: 90 }),
      clear('#2047', ...AT.T2, 94),
      dropAtDish(snapshot, '#2047', [[AT.T2[0][0], ALONG_PARTITIONS], ...TO_DISH]),
      stopAt('T1', { leave: 29 }, [...DISH_TO_PASS.slice(0, 1), [DOOR_X, ALONG_PARTITIONS], [AT.T1[0][0], ALONG_PARTITIONS]]),
    ] }, node: serverNode('Ana', FEMININE) },
    // Table 3 (late mains), the bill at table 4 and the reserved table 6.
    { actor: { id: id('ben'), speed: 1.2, stops: [
      collect(snapshot, '#2041', 58, [[AT.T3[0][0], -.3], [AT.T3[0][0], ALONG_PARTITIONS]]),
      serve(snapshot, '#2041', ...AT.T3, [[AT.T3[0][0], ALONG_PARTITIONS]]),
      stopAt('T4', { leave: 100 }, [[AT.T3[0][0], -.3]]),
      clear('#2041', ...AT.T3, 122.5, [[AT.T3[0][0], -.3]]),
      dropAtDish(snapshot, '#2041', [[AT.T3[0][0], ALONG_PARTITIONS], ...TO_DISH]),
      stopAt('T6', { leave: 48 }, [...DISH_TO_PASS.slice(0, 1), [DOOR_X, ALONG_PARTITIONS], [AT.T3[0][0], ALONG_PARTITIONS], [AT.T3[0][0], -.3]]),
    ] }, node: serverNode('Ben') },
    // Booth 7 from the dining room, booth 8 from the lounge side where two of its guests sit, and lounge table 11.
    { actor: { id: id('cleo'), speed: 1.25, stops: [
      collect(snapshot, '#2054', 4, DISH_TO_PASS),
      serve(snapshot, '#2054', ...AT.B7, [[AT.B7[0][0], ALONG_PARTITIONS]]),
      collect(snapshot, '#2049', 22, [[AT.B7[0][0], ALONG_PARTITIONS]]),
      serve(snapshot, '#2049', ...AT.B8, [[AT.B7[0][0], BEHIND_BOOTHS], [AT.B8[0][0], BEHIND_BOOTHS]]),
      stopAt('T11', { leave: 57 }),
      clear('#2054', ...AT.B7, 70, [[.1, 2.25], [AT.B7[0][0], 2.25]]),
      dropAtDish(snapshot, '#2054', [[AT.B7[0][0], ALONG_PARTITIONS], ...TO_DISH]),
      clear('#2049', ...AT.B8, 103, [[DOOR_X, SERVER_LANE], [DOOR_X, ALONG_PARTITIONS], [AT.B7[0][0], ALONG_PARTITIONS], [AT.B7[0][0], BEHIND_BOOTHS], [AT.B8[0][0], BEHIND_BOOTHS]]),
      dropAtDish(snapshot, '#2049', [[AT.B8[0][0], BEHIND_BOOTHS], [AT.B7[0][0], BEHIND_BOOTHS], [AT.B7[0][0], ALONG_PARTITIONS], ...TO_DISH]),
    ] }, node: serverNode('Cleo', FEMININE) },
    // Terrace tables 12 and 13.
    { actor: { id: id('dan'), speed: 1.2, stops: [
      collect(snapshot, '#2048', 6, DISH_TO_PASS),
      serve(snapshot, '#2048', ...AT.T12, toTerrace),
      stopAt('T13', { dwell: 4 }),
      collect(snapshot, '#2050', 45, fromTerrace),
      serve(snapshot, '#2050', ...AT.T13, toTerrace),
      clear('#2048', ...AT.T12, 76),
      dropAtDish(snapshot, '#2048', [...fromTerrace, ...TO_DISH]),
      clear('#2050', ...AT.T13, 132, [...[...TO_DISH].reverse(), ...toTerrace]),
      dropAtDish(snapshot, '#2050', [...fromTerrace, ...TO_DISH]),
    ] }, node: serverNode('Dan') },
  ];
}
function quietService(snapshot: RestaurantSnapshot): ServicePerson[] {
  const id = (name: string) => `staff:quiet:${name}`;
  return [
    { actor: { id: id('cold'), speed: 1, stops: cookStops(snapshot, 'cold', [['#3011', 20]]) }, node: chefNode('Cold prep') },
    // Salads for table 12, checking the free terrace table 14 while the guests eat.
    { actor: { id: id('dan'), speed: 1.1, stops: [
      collect(snapshot, '#3011', 40, DISH_TO_PASS),
      serve(snapshot, '#3011', ...AT.T12, [[-7.5, ALONG_PARTITIONS], [-7.5, 3.3]]),
      stopAt('T14', { leave: 100 }),
      clear('#3011', ...AT.T12, 110),
      dropAtDish(snapshot, '#3011', [[-7.5, 3.3], [-7.5, ALONG_PARTITIONS], ...TO_DISH]),
    ] }, node: serverNode('Dan') },
  ];
}
/**
 * The people and courses of a snapshot's service loop. The loops are written for the mock snapshots in `SCENARIOS`, so
 * any other snapshot (a live host feed, a test fixture) and the closed restaurant have none and show staff at their posts.
 */
function servicePeople(snapshot: RestaurantSnapshot): ServicePerson[] {
  if (!snapshot.open || snapshot !== SCENARIOS[snapshot.scenario]) return [];
  return snapshot.scenario === 'rush' ? rushService(snapshot) : snapshot.scenario === 'quiet' ? quietService(snapshot) : [];
}
/** Seconds before its cook collects it that a course appears plated at its station. */
const PLATING_SECONDS = 12;
function servicePlan(snapshot: RestaurantSnapshot, people: readonly ServicePerson[]): ServicePlan {
  const courses = people.flatMap(({ actor }) => actor.stops.flatMap(stop => {
    if (!stop.action || !('take' in stop.action) || stop.pose !== 'working') return [];
    const { table, station, plates } = courseOf(snapshot, stop.action.take);
    return [{ id: stop.action.take, table: `table:${table}`, platedAt: ((stop.leave! - HAND_OFF - PLATING_SECONDS) % SERVICE_PERIOD + SERVICE_PERIOD) % SERVICE_PERIOD, plated: KITCHEN[station].plating.slice(0, plates).map((offset): PlateRest => ({ node: `station:${station}`, offset })) }];
  }));
  return { period: SERVICE_PERIOD, actors: people.map(person => person.actor), courses };
}
const cycles = new WeakMap<RestaurantSnapshot, { people: ServicePerson[]; cycle: ServiceCycle } | null>();
/** The compiled service loop of `snapshot`, or null when nothing is served. Cached per snapshot object. */
export function serviceLoop(snapshot: RestaurantSnapshot): { people: readonly ServicePerson[]; cycle: ServiceCycle } | null {
  if (!cycles.has(snapshot)) { const people = servicePeople(snapshot); cycles.set(snapshot, people.length ? { people, cycle: compileService(servicePlan(snapshot, people)) } : null); }
  return cycles.get(snapshot)!;
}
/**
 * The nodes the service loop moves at `phase` (seconds into the loop): the walking cooks and servers, each in the
 * pose of what it does, and every plate where it is. Hosts upsert these as the phase advances.
 */
export function serviceNodes(snapshot: RestaurantSnapshot, phase: number): AssetNode[] {
  const loop = serviceLoop(snapshot);
  if (!loop) return [];
  const { people, cycle } = loop;
  const staff = people.map(({ actor, node }, i): AssetNode => {
    const compiled = cycle.actors[i];
    return { ...node, id: actor.id, variant: actorPose(cycle, compiled, phase), position: compiled.route.points[0], route: routeAtPhase(compiled, cycle.period, phase), materials: { hair: personHairColor(actor.id) } };
  });
  const plates = platesAt(cycle, phase).map((plate): AssetNode => ({
    id: plate.id, kind: 'asset', asset: 'serving-plates', variant: plate.load, count: 1, transfer: PLATE_TRANSFER, selectable: false,
    ...(plate.holder
      ? { attachment: { nodeId: plate.holder, anchor: 'carry' }, position: [plate.count === 1 ? 0 : SERVING_PLATES.offsets[plate.slot], PLATE_LIFT, 0] }
      : { attachment: { nodeId: plate.rest!.node, ...(plate.rest!.anchor ? { anchor: plate.rest!.anchor } : {}) }, position: plate.rest!.offset, ...(plate.rest!.yaw ? { rotation: [0, plate.rest!.yaw, 0] as Vec3 } : {}) }),
  }));
  return [...staff, ...plates];
}

/** Floors, fixtures and decoration that do not depend on the service snapshot. */
export const restaurantBase: readonly SceneNode[] = closeWallJoints([
  { id: 'ground', kind: 'ground', size: [34, 22], position: [0, 0, -1.6], color: '#e9edf2' },
  decor('floor-dining', 'floor', v(0, -.3), { variant: 'wood', footprint: [30, 8.6], interior: true }),
  decor('floor-kitchen', 'floor', v(-7.5, -7.9), { variant: 'tiles', footprint: [15, 6.6], interior: true }),
  decor('floor-bar', 'floor', v(7.5, -7.9), { variant: 'wood', footprint: [15, 6.6], interior: true }),
  decor('terrace', 'terrain', v(-6.5, 6.1), { variant: 'pavers', footprint: [17, 3.6] }),
  decor('umbrella-1', 'patio-umbrella', v(-9.25, 6.1), { color: '#d9644a' }),
  decor('umbrella-2', 'patio-umbrella', v(-4.75, 6.1), { color: '#3d8a6e' }),
  decor('umbrella-3', 'patio-umbrella', v(-13.9, 6.1), { variant: 'closed', color: '#d9644a' }),
  { id: 'menu-board', kind: 'asset', asset: 'menu-board', position: v(3.6, 6.2), rotation: [0, -.35, 0], label: 'Menu board', labelMode: 'active', selectable: true, options: { surfaceLabel: { kind: 'text', layout: 'multiline', text: "TODAY'S SPECIALS\nBurrata  9.5\nRibeye  29\nDiavola  13\nTiramisu  7", color: '#eef1f2' } } },
  decor('cargo-bike', 'cargo-bike', v(8.5, 7.4), { rotation: [0, Math.PI / 2, 0] }),
  ...([[.7, 3.4], [-14.4, 3.4], [14.4, 3.4], [14.4, -4.2], [.6, -10.6], [3.4, -1.6], [7.4, -1.6]] as const).map(([x, z], i) => decor(`plant-${i}`, 'potted-plant', v(x, z))),
  decor('lamp-1', 'lamp-post', v(1.2, 7.6)), decor('lamp-2', 'lamp-post', v(-15.6, 7.6)),
  { id: 'equipment:dish', kind: 'asset', asset: 'dish-machine', position: v(-9.9, -6), rotation: [0, Math.PI, 0], label: 'Dish machine', labelMode: 'active', selectable: true },
  decor('bench', 'bench', v(13.4, -2.6), { rotation: [0, -Math.PI / 2, 0] }),
  // Back and side walls frame the interior; the camera side stays open like a cutaway.
  ...[-13, -9, -5, -1, 3, 7, 11].map((x, i) => decor(`wall-back-${i}`, 'wall-segment', v(x, -11.3), { variant: x > 1 && x < 9 ? 'solid' : 'window', color: '#efe7dc' })),
  decor('wall-back-7', 'wall-segment', v(14, -11.3), { scale: [.5, 1, 1], color: '#efe7dc' }),
  // The left wall runs without gaps from the back wall (z −11.2) to the terrace (z 3.4).
  ...[-9.2, -5.2, -1.2, 2.1].map((z, i) => decor(`wall-left-${i}`, 'wall-segment', v(-15.08, z), { variant: i === 0 ? 'door' : 'window', rotation: [0, Math.PI / 2, 0], color: '#efe7dc', ...(i === 3 ? { scale: [.65, 1, 1] as Vec3 } : {}) })),
  // Low kitchen partitions leave the pass and the aisles open.
  decor('partition-1', 'wall-segment', v(-13, -4.75), { scale: [1, .42, 1], color: '#d9c7b4' }),
  decor('partition-2', 'wall-segment', v(-9.6, -4.75), { scale: [.6, .42, 1], color: '#d9c7b4' }),
  decor('partition-3', 'wall-segment', v(-3.3, -4.75), { scale: [1, .42, 1], color: '#d9c7b4' }),
  ...[5.8, 6.6, 7.4, 8.2].map((x, i) => decor(`stool:${i}`, 'bar-stool', v(x, -7.85))),
]);

/**
 * Snapshot-dependent nodes: table states and covers, attached guests, station states, ready-order counts, staff and the
 * service loop at `phase` seconds (`serviceNodes`). Staff IDs include the scenario, so a scenario change gives the
 * renderer new walkers that start at the loop's phase instead of joining from the previous scenario's routes.
 */
export function restaurantNodes(snapshot: RestaurantSnapshot, phase = 0): SceneNode[] {
  const nodes: SceneNode[] = [...restaurantBase];
  let tone = 0;
  for (const layout of TABLE_LAYOUT) {
    const session = snapshot.tables.find(table => table.tableId === layout.id) ?? free(layout.id), status = TABLE_STATUS[session.status];
    const seated = covers(snapshot, layout.id);
    nodes.push({ id: `table:${layout.id}`, entityId: layout.id, kind: 'asset', asset: layout.asset, ...(layout.variant ? { variant: layout.variant } : {}), position: v(...layout.position), ...(layout.rotation ? { rotation: [0, layout.rotation, 0] as Vec3 } : {}), count: seated, state: status.state, label: `${layout.label} · ${status.label}`, labelMode: 'active', selectable: true });
    // Guests sit on the seat anchors; their feet return to the floor below the 0.52 m seat height.
    if (isOccupied(session)) for (let seat = 0; seat < seated; seat++) nodes.push({ id: `guest:${layout.id}:${seat}`, materials: { hair: personHairColor(`guest:${layout.id}:${seat}`) }, kind: 'asset', asset: GUEST_ASSETS[tone % GUEST_ASSETS.length], ...((tone >> 1) % 2 ? {} : FEMININE), variant: 'seated', color: GUEST_TONES[tone++ % GUEST_TONES.length], attachment: { nodeId: `table:${layout.id}`, anchor: `seat-${seat}` }, position: [0, -.52, 0], selectable: false });
  }
  for (let seat = 0; seat < Math.min(4, snapshot.barGuests); seat++) nodes.push({ id: `bar-guest:${seat}`, materials: { hair: personHairColor(`bar-guest:${seat}`) }, kind: 'asset', asset: GUEST_ASSETS[(seat + 1) % GUEST_ASSETS.length], ...(seat % 2 ? {} : FEMININE), variant: 'seated', color: GUEST_TONES[(tone++ + 3) % GUEST_TONES.length], attachment: { nodeId: `stool:${[0, 1, 3, 2][seat]}`, anchor: 'seat' }, position: [0, -.52, 0], rotation: [0, Math.PI, 0], selectable: false });
  const station = (id: StationId, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id: `station:${id}`, entityId: id, kind: 'asset', asset, position, state: stationState(snapshot, id), label: STATIONS.find(item => item.id === id)!.label, labelMode: 'active', selectable: true, ...extra });
  const pickupReady = stationTickets(snapshot, 'pickup').length;
  nodes.push(
    station('grill', 'kitchen-station', v(-12, -10.2), { variant: 'cooking' }),
    station('pizza', 'pizza-oven', v(-8.2, -9.8), { options: { heatEnabled: snapshot.open } }),
    station('cold', 'kitchen-station', v(-4.4, -10.2), { variant: 'prep', color: '#d9e8e1' }),
    station('pass', 'heated-pass', v(-6.5, -5.4), { options: { heatEnabled: snapshot.open }, count: 0, color: '#3a4c60' }),
    station('bar', 'bar-counter', v(7, -8.6)),
    station('pickup', 'pickup-shelf', v(14, .6), { rotation: [0, -Math.PI / 2, 0], count: Math.min(PICKUP_CAPACITY, pickupReady), color: '#3d8a6e', options: { surfaceLabel: { kind: 'text', text: 'PICKUP', color: '#ffffff' } } }),
    { id: 'equipment:espresso', kind: 'asset', asset: 'espresso-machine', attachment: { nodeId: 'station:bar', anchor: 'top' }, options: { heatEnabled: snapshot.open }, selectable: false },
    { id: 'equipment:cooler', entityId: 'cooler', kind: 'asset', asset: 'walk-in-cooler', position: v(-1.5, -9.6), state: snapshot.cooler.celsius > snapshot.cooler.limit ? 'warning' : 'normal', label: 'Walk-in cooler', labelMode: 'active', selectable: true, options: { surfaceLabel: { kind: 'text', text: `${snapshot.cooler.celsius.toFixed(1)} °C`, color: snapshot.cooler.celsius > snapshot.cooler.limit ? '#ffd27a' : '#bff3df', background: '#102438' } } },
    { id: 'host-stand', kind: 'asset', asset: 'host-stand', position: v(9.2, 2.6), label: 'Host stand', labelMode: 'active', selectable: true },
  );
  if (!snapshot.open) { nodes.push(walking(worker('staff:closing', v(-6.5, PASS_SERVER_Z), S, 'walking', SERVER), CLOSING_WALK)); return nodes; }
  // People the service loop moves walk it; the others stay at their posts.
  const id = (name: string) => `staff:${snapshot.scenario}:${name}`, loop = serviceLoop(snapshot), moving = new Set(loop?.people.map(person => person.actor.id) ?? []);
  const posts: AssetNode[] = [
    chef(id('grill'), v(-12, -9.45), S, 'working', 'Grill cook'),
    chef(id('pizza'), v(-8.2, -8.45), S, 'working', 'Pizzaiolo', FEMININE),
    chef(id('cold'), v(-4.4, -9.45), S, 'working', 'Cold prep'),
    { ...worker(id('ana'), v(-13.3, -.3), E, 'idle', SERVER, 'Ana'), ...FEMININE },
  ];
  nodes.push(
    ...posts.filter(node => !moving.has(node.id)),
    // The expo calls orders from the end of the pass, clear of the cooks who set plates on it.
    chef(id('expo'), v(-4.95, -5.9), W, 'placing', 'Expo', FEMININE),
    worker(id('dish'), v(-9.9, -6.8), 0, 'working', '#9fb3c8', 'Dish'),
    worker(id('bar'), v(7, -9.3), 0, 'working', '#5a3b2e', 'Bartender'),
    person(id('host'), 'office-worker', v(9.2, 2.05), 0, 'idle', '#8a5a3c', 'Host', FEMININE),
    ...serviceNodes(snapshot, phase),
  );
  if (pickupReady) nodes.push(walking(worker('courier', v(0, 0), E, 'walking', '#3d8a6e', 'Courier'), COURIER_WALK));
  if (snapshot.scenario === 'rush') nodes.push(
    walking(person('arrival-1', 'visitor', v(0, 0), S, 'walking', '#b07cc6', 'Novák party', FEMININE), arrival(v(11.6, 7), v(8.8, 3.5))),
    walking(person('arrival-2', 'office-worker', v(0, 0), S, 'walking', '#e0b44c'), arrival(v(12.4, 7.3), v(9.6, 3.6))),
  );
  return nodes;
}

export function createRestaurantStore(scenario: RestaurantScenario = 'rush'): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: restaurantNodes(SCENARIOS[scenario]) }, { zoom: 1.05 });
}
/** Replace with a confirmed host snapshot. Nothing in the UI changes the service state optimistically. */
export function applyRestaurantSnapshot(store: SceneStore, snapshot: RestaurantSnapshot): void { store.replace(restaurantNodes(snapshot)); }
