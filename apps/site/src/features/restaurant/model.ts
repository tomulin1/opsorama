import { BOOTH, DINING_SEATS, DINING_TABLE, SERVING_PLATES } from '@opsorama/objects';
import { personHairColor, createSceneStore, routeDuration, routeTimes, type AssetNode, type NodeRoute, type SceneNode, type SceneStore, type Vec3, type VisualState } from '@opsorama/core';

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
/** The pass and pickup shelf show at most this many ready orders; the HTML keeps exact totals. */
export const PASS_CAPACITY = 6, PICKUP_CAPACITY = 9;

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
const FEMININE = { person: { figure: 'feminine' } } as const satisfies Partial<AssetNode>;
const decor = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });

/**
 * A floor point `[x, z]` walked through, or `[x, z, yaw, seconds, table]` where the person pauses facing `yaw` (0 faces
 * +z); `table` names the table a server sets plates on or clears from that pause.
 */
type Waypoint = readonly [x: number, z: number, yaw?: number, seconds?: number, table?: string];
/** A looping walk that returns to its first point; `elapsed` staggers people who share the floor. */
function walk(points: readonly Waypoint[], speed: number, elapsed = 0): NodeRoute {
  const stops = points.flatMap(([, , yaw, seconds], index) => yaw === undefined ? [] : [{ index, seconds: seconds ?? 3, yaw }]);
  return { points: [...points, points[0]].map(([x, z]) => v(x, z)), speed, loop: true, elapsed, stops };
}
/**
 * Two laps from the pass: the second visits the same stops in reverse order, so the table a server sets plates on in
 * one lap is the table cleared last in the other.
 */
const serviceLaps = (lap: readonly Waypoint[]): readonly Waypoint[] => [...lap, lap[0], ...lap.slice(1).reverse()];
/** A person who walks `route`; the route owns position and heading, so the node starts at its first point. */
const walking = (node: AssetNode, route: NodeRoute): AssetNode => ({ ...node, position: route.points[0], route });
/**
 * Service walks through the aisles: x −13.7 by the side wall, −10.75, −7.5/−7, −4.15 and −3.25 between the table columns and booths, z −3.95 along
 * the kitchen partitions, z −0.3 between the table rows and z 3.2 in front of them. Servers collect at the heated pass
 * (front edge z −5.1), pause at their tables and return.
 */
const PASS_Z = -4.4, N = 0, S = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;
const RUSH_LAPS: Readonly<Record<'ana' | 'ben' | 'cleo' | 'dan', readonly Waypoint[]>> = {
  // Tables 2 and 1.
  ana: [[-7.15, PASS_Z, S, 4], [-10.75, -4], [-10.75, -2.5, E, 5, 'T2'], [-10.75, -1.9, W, 5, 'T1'], [-10.75, -4]],
  // Table 3 (late mains) and table 4 (bill).
  ben: [[-6.25, PASS_Z, S, 3], [-4.15, -3.95], [-4.15, -2.2, W, 5, 'T3'], [-4.15, -.3], [-12.5, -.3, N, 6, 'T4'], [-7, -.5], [-7, -3.95]],
  // Booth 7 and lounge table 11, checking booth 8 and table 5 on the way.
  cleo: [[-5.8, PASS_Z, S, 3], [-3.25, -3.95], [-3.25, -2.9, E, 5, 'B7'], [-3.25, -1, E, 3], [-3.25, 2.25], [.1, 2.25], [4.1, .4, E, 5, 'T11'], [.1, 2.25], [-9, 3.25, S, 3], [-7, 3], [-7, -3.9]],
  // Terrace tables 13 and 12.
  dan: [[-6.7, PASS_Z, S, 4], [-7.5, -3.95], [-7.5, 3.3], [-7, 4.75, N, 5, 'T13'], [-11.5, 4.75, N, 5, 'T12'], [-7.5, 3.3]],
};
const RUSH_WALKS = {
  ana: walk(serviceLaps(RUSH_LAPS.ana), 1.1),
  ben: walk(serviceLaps(RUSH_LAPS.ben), 1.2, 9),
  cleo: walk(serviceLaps(RUSH_LAPS.cleo), 1.25, 3),
  dan: walk(serviceLaps(RUSH_LAPS.dan), 1.1, 14),
} as const;
const QUIET_LAP: readonly Waypoint[] = [[-6.7, PASS_Z, S, 5], [-7.5, -3.95], [-7.5, 3.3], [-11.5, 4.75, N, 6, 'T12'], [-7.5, 3.3]];
const QUIET_WALK = walk(serviceLaps(QUIET_LAP), 1);
/** After close, one server checks every table around the dining room. */
const CLOSING_WALK = walk([[-6.5, PASS_Z, S, 4], [-13.7, -3.95], [-13.7, 2.9, E, 3], [-3.6, 2.9, N, 3], [-3.6, -3.95]], .9);
/** The courier walks between the cargo bike and the pickup shelf. */
const COURIER_WALK = walk([[10, 6.6, W, 4], [13.15, .6, E, 6]], 1.2);
/** The arriving party walks in from the street once and waits at the host stand. */
const arrival = (from: Vec3, to: Vec3): NodeRoute => ({ points: [from, to], speed: 1, endYaw: S });

export type PlateLoad = 'full' | 'empty';
/** Two plates a server carries together: in the server's hands, or set down on the settings of `table`. */
export interface PlatePair { readonly load: PlateLoad; readonly table?: string; }
/** A pause where a server's plates move: at the pass, or at a table. `carry` is where the carry anchor rests then. */
export interface PlateVisit { readonly carry: Vec3; readonly stop: Vec3; readonly table?: string; }
/**
 * A server's plate service over the two laps of the walk. `pairs[k]` is where the plates are after `visits[k]`; the
 * walk starts at the pass with full plates in hand, and `start` is the visit already reached at the walk's stagger.
 */
export interface PlateRun { readonly server: string; readonly visits: readonly PlateVisit[]; readonly pairs: readonly (readonly PlatePair[])[]; readonly start: number; }
/**
 * Plates after a visit. At the pass the plates in hand fill and guests finish the dishes set down earlier. At a table the
 * plates in hand are set down when it has none of the server's plates, and its plates are picked up when the hands are
 * free; otherwise nothing moves.
 */
export function applyPlateVisit(pairs: readonly PlatePair[], table?: string): readonly PlatePair[] {
  if (!table) return pairs.map(pair => pair.table === undefined ? { load: 'full' } : pair.load === 'full' ? { ...pair, load: 'empty' } : pair);
  const hands = pairs.findIndex(pair => pair.table === undefined), there = pairs.findIndex(pair => pair.table === table);
  if (hands >= 0 && there < 0) return pairs.map((pair, i) => i === hands ? { ...pair, table } : pair);
  if (hands < 0 && there >= 0) return pairs.map((pair, i) => i === there ? { load: pair.load } : pair);
  return pairs;
}
/** The carry anchor sits this far in front of a standing server. */
const CARRY_AHEAD = .49;
function plateRun(server: string, lap: readonly Waypoint[], route: NodeRoute): PlateRun {
  const laps = serviceLaps(lap), times = routeTimes(route);
  const visits = laps.flatMap(([x, z, yaw, , table], index) => yaw === undefined || (!table && index % lap.length) ? [] : [{ index, visit: { carry: v(x + Math.sin(yaw) * CARRY_AHEAD, z + Math.cos(yaw) * CARRY_AHEAD), stop: v(x, z), ...(table ? { table } : {}) } }]);
  // The walk leaves the pass with full plates; the table cleared last in the first lap holds the second pair.
  const tables = lap.flatMap(([, , , , table]) => table ? [table] : []), cleared = tables.at(-1);
  const pairs: (readonly PlatePair[])[] = [cleared && cleared !== tables[0] ? [{ load: 'full' }, { load: 'empty', table: cleared }] : [{ load: 'full' }]];
  for (const { visit } of visits.slice(1)) pairs.push(applyPlateVisit(pairs.at(-1)!, visit.table));
  const elapsed = (route.elapsed ?? 0) % routeDuration(route), start = visits.findLastIndex(({ index }) => times[index].arrive <= elapsed);
  return { server, visits: visits.map(({ visit }) => visit), pairs, start: Math.max(0, start) };
}
const RUSH_RUNS = [plateRun('staff:ana', RUSH_LAPS.ana, RUSH_WALKS.ana), plateRun('staff:ben', RUSH_LAPS.ben, RUSH_WALKS.ben), plateRun('staff:cleo', RUSH_LAPS.cleo, RUSH_WALKS.cleo), plateRun('staff:dan', RUSH_LAPS.dan, RUSH_WALKS.dan)];
const QUIET_RUNS = [plateRun('staff:dan', QUIET_LAP, QUIET_WALK)];
/** Servers who carry plates in this snapshot. */
export const plateRuns = (snapshot: RestaurantSnapshot): readonly PlateRun[] => !snapshot.open ? [] : snapshot.scenario === 'rush' ? RUSH_RUNS : snapshot.scenario === 'quiet' ? QUIET_RUNS : [];
/** Within this distance of a visit's carry point the server has arrived and turned to the pass or table. */
const PLATE_REACH = .3;
const placeOf = (visit: PlateVisit) => visit.table ?? 'pass';
/**
 * The visit reached after the server's carry anchor is seen at `carry`, from the `current` one. Arriving at another
 * place moves to the next visit there, so a visit missed while the page was hidden resynchronizes the plates at the
 * next pause; the host can poll the anchor at any rate.
 */
export function nextPlateVisit(run: PlateRun, carry: readonly [number, number, number], current: number): number {
  const reached = run.visits.find(visit => Math.hypot(carry[0] - visit.carry[0], carry[2] - visit.carry[2]) < PLATE_REACH);
  if (!reached || placeOf(reached) === placeOf(run.visits[current])) return current;
  for (let step = 1; step <= run.visits.length; step++) { const next = (current + step) % run.visits.length; if (placeOf(run.visits[next]) === placeOf(reached)) return next; }
  return current;
}
/**
 * The carry anchor is the base of a load held between the arms; plates rest on top of the level forearms and hands of
 * the holding pose instead, this much higher. The lift is inside the rig, so it follows the feminine scale and the gait.
 */
export const PLATE_LIFT = .3;
/** A plate set down rests on a place setting's plate, which is this high above the table top. */
const ON_SETTING = .016;
/** Plates move between hands and table along a short arc. */
const PLATE_TRANSFER = { seconds: .8, arc: .25 } as const;
const coversAt = (snapshot: RestaurantSnapshot, layout: TableLayout) => { const session = snapshot.tables.find(table => table.tableId === layout.id); return !session || session.status === 'free' ? 0 : Math.min(layout.seats, session.party); };
/**
 * The two settings of `layout` that plates go on: occupied seats first, then the seats nearest to where the server
 * stands. Positions and yaw are local to the table's top anchor.
 */
function plateSettings(layout: TableLayout, covers: number, from: Vec3): { position: Vec3; yaw: number }[] {
  const turn = layout.rotation ?? 0, settings = layout.asset === 'booth-seating'
    ? BOOTH.seats.map(([x, z]) => ({ x, z: Math.sign(z) * BOOTH.settingZ, yaw: z > 0 ? 0 : Math.PI }))
    : DINING_SEATS.map(([x, z]) => ({ x: x * DINING_TABLE.settingOffset, z: z * DINING_TABLE.settingOffset, yaw: Math.atan2(x, z) }));
  const distance = ({ x, z }: { x: number; z: number }) => Math.hypot(layout.position[0] + x * Math.cos(turn) + z * Math.sin(turn) - from[0], layout.position[1] - x * Math.sin(turn) + z * Math.cos(turn) - from[2]);
  return settings.map((setting, seat) => ({ setting, seat })).sort((a, b) => Number(b.seat < covers) - Number(a.seat < covers) || distance(a.setting) - distance(b.setting))
    .slice(0, 2).map(({ setting }) => ({ position: [setting.x, ON_SETTING, setting.z], yaw: setting.yaw }));
}
/** The plate nodes of `run` after visit `visit`: two single plates per pair, in the server's hands or on table settings. */
function plateNodes(snapshot: RestaurantSnapshot, run: PlateRun, visit: number): AssetNode[] {
  return run.pairs[visit].flatMap((pair, index) => {
    const layout = pair.table ? TABLE_LAYOUT.find(table => table.id === pair.table)! : undefined;
    const settings = layout ? plateSettings(layout, coversAt(snapshot, layout), run.visits.find(item => item.table === pair.table)!.stop) : [];
    return SERVING_PLATES.offsets.map((x, plate): AssetNode => ({
      id: `plate:${run.server}:${index}:${plate}`, kind: 'asset', asset: 'serving-plates', variant: pair.load, count: 1, transfer: PLATE_TRANSFER, selectable: false,
      ...(layout ? { attachment: { nodeId: `table:${layout.id}`, anchor: 'top' }, position: settings[plate].position, rotation: [0, settings[plate].yaw, 0] } : { attachment: { nodeId: run.server, anchor: 'carry' }, position: [x, PLATE_LIFT, 0] }),
    }));
  });
}

/** Floors, fixtures and decoration that do not depend on the service snapshot. */
export const restaurantBase: readonly SceneNode[] = [
  { id: 'ground', kind: 'ground', size: [34, 22], position: [0, 0, -1.6], color: '#e9edf2' },
  decor('floor-dining', 'floor', v(0, -.3), { variant: 'wood', footprint: [30, 8.6], interior: true }),
  decor('floor-kitchen', 'floor', v(-7.5, -7.9), { variant: 'tiles', footprint: [15, 6.6], interior: true }),
  decor('floor-bar', 'floor', v(7.5, -7.9), { variant: 'wood', footprint: [15, 6.6], interior: true }),
  decor('terrace', 'terrain', v(-6.5, 6.1), { variant: 'pavers', footprint: [17, 3.6] }),
  decor('umbrella-1', 'patio-umbrella', v(-9.25, 6.1), { color: '#d9644a' }),
  decor('umbrella-2', 'patio-umbrella', v(-4.75, 6.1), { color: '#3d8a6e' }),
  decor('umbrella-3', 'patio-umbrella', v(-13.9, 6.1), { variant: 'closed', color: '#d9644a' }),
  { id: 'menu-board', kind: 'asset', asset: 'menu-board', position: v(3.6, 6.2), rotation: [0, -.35, 0], label: 'Menu board', labelMode: 'active', selectable: true, surfaceLabel: { kind: 'text', layout: 'multiline', text: "TODAY'S SPECIALS\nBurrata  9.5\nRibeye  29\nDiavola  13\nTiramisu  7", color: '#eef1f2' } },
  decor('cargo-bike', 'cargo-bike', v(8.5, 7.4), { rotation: [0, Math.PI / 2, 0] }),
  ...([[.7, 3.4], [-14.4, 3.4], [14.4, 3.4], [14.4, -4.2], [.6, -10.6], [3.4, -1.6], [7.4, -1.6]] as const).map(([x, z], i) => decor(`plant-${i}`, 'potted-plant', v(x, z))),
  decor('lamp-1', 'lamp-post', v(1.2, 7.6)), decor('lamp-2', 'lamp-post', v(-15.6, 7.6)),
  { id: 'equipment:dish', kind: 'asset', asset: 'dish-machine', position: v(-12.3, -6), rotation: [0, Math.PI, 0], label: 'Dish machine', labelMode: 'active', selectable: true },
  decor('bench', 'bench', v(13.4, -2.6), { rotation: [0, -Math.PI / 2, 0] }),
  // Back and side walls frame the interior; the camera side stays open like a cutaway.
  ...[-13, -9, -5, -1, 3, 7, 11].map((x, i) => decor(`wall-back-${i}`, 'wall-segment', v(x, -11.3), { variant: x > 1 && x < 9 ? 'solid' : 'window', color: '#efe7dc' })),
  decor('wall-back-7', 'wall-segment', v(14, -11.3), { scale: [.5, 1, 1], color: '#efe7dc' }),
  ...[-9.2, -5.2, -1.2, 2.2].map((z, i) => decor(`wall-left-${i}`, 'wall-segment', v(-15.08, z), { variant: i === 0 ? 'door' : 'window', rotation: [0, Math.PI / 2, 0], color: '#efe7dc', ...(i === 3 ? { scale: [.6, 1, 1] as Vec3 } : {}) })),
  // Low kitchen partitions leave the pass and the aisles open.
  decor('partition-1', 'wall-segment', v(-13, -4.75), { scale: [1, .42, 1], color: '#d9c7b4' }),
  decor('partition-2', 'wall-segment', v(-9.6, -4.75), { scale: [.6, .42, 1], color: '#d9c7b4' }),
  decor('partition-3', 'wall-segment', v(-3.3, -4.75), { scale: [1, .42, 1], color: '#d9c7b4' }),
  ...[5.8, 6.6, 7.4, 8.2].map((x, i) => decor(`stool:${i}`, 'bar-stool', v(x, -7.85))),
];

/**
 * Snapshot-dependent nodes: table states and covers, attached guests, station states, ready-order counts and staff.
 * `visits` keeps the visit each plate carrier last reached (`nextPlateVisit`); carriers missing from it start at the
 * visit their walk's stagger has reached.
 */
export function restaurantNodes(snapshot: RestaurantSnapshot, visits: Readonly<Record<string, number>> = {}): SceneNode[] {
  const nodes: SceneNode[] = [...restaurantBase];
  let tone = 0;
  for (const layout of TABLE_LAYOUT) {
    const session = snapshot.tables.find(table => table.tableId === layout.id) ?? free(layout.id), status = TABLE_STATUS[session.status];
    const covers = coversAt(snapshot, layout);
    nodes.push({ id: `table:${layout.id}`, entityId: layout.id, kind: 'asset', asset: layout.asset, ...(layout.variant ? { variant: layout.variant } : {}), position: v(...layout.position), ...(layout.rotation ? { rotation: [0, layout.rotation, 0] as Vec3 } : {}), count: covers, state: status.state, label: `${layout.label} · ${status.label}`, labelMode: 'active', selectable: true });
    // Guests sit on the seat anchors; their feet return to the floor below the 0.52 m seat height.
    if (isOccupied(session)) for (let seat = 0; seat < covers; seat++) nodes.push({ id: `guest:${layout.id}:${seat}`, materials: { hair: personHairColor(`guest:${layout.id}:${seat}`) }, kind: 'asset', asset: GUEST_ASSETS[tone % GUEST_ASSETS.length], ...((tone >> 1) % 2 ? {} : FEMININE), variant: 'seated', color: GUEST_TONES[tone++ % GUEST_TONES.length], attachment: { nodeId: `table:${layout.id}`, anchor: `seat-${seat}` }, position: [0, -.52, 0], selectable: false });
  }
  for (let seat = 0; seat < Math.min(4, snapshot.barGuests); seat++) nodes.push({ id: `bar-guest:${seat}`, materials: { hair: personHairColor(`bar-guest:${seat}`) }, kind: 'asset', asset: GUEST_ASSETS[(seat + 1) % GUEST_ASSETS.length], ...(seat % 2 ? {} : FEMININE), variant: 'seated', color: GUEST_TONES[(tone++ + 3) % GUEST_TONES.length], attachment: { nodeId: `stool:${[0, 1, 3, 2][seat]}`, anchor: 'seat' }, position: [0, -.52, 0], rotation: [0, Math.PI, 0], selectable: false });
  const station = (id: StationId, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id: `station:${id}`, entityId: id, kind: 'asset', asset, position, state: stationState(snapshot, id), label: STATIONS.find(item => item.id === id)!.label, labelMode: 'active', selectable: true, ...extra });
  const passReady = stationTickets(snapshot, 'pass').length, pickupReady = stationTickets(snapshot, 'pickup').length;
  nodes.push(
    station('grill', 'kitchen-station', v(-12, -10.2), { variant: 'cooking' }),
    station('pizza', 'pizza-oven', v(-8.2, -9.8), { heatEnabled: snapshot.open }),
    station('cold', 'kitchen-station', v(-4.4, -10.2), { variant: 'prep', color: '#d9e8e1' }),
    station('pass', 'heated-pass', v(-6.5, -5.4), { heatEnabled: snapshot.open, count: Math.min(PASS_CAPACITY, passReady), color: '#3a4c60' }),
    station('bar', 'bar-counter', v(7, -8.6)),
    station('pickup', 'pickup-shelf', v(14, .6), { rotation: [0, -Math.PI / 2, 0], count: Math.min(PICKUP_CAPACITY, pickupReady), color: '#3d8a6e', surfaceLabel: { kind: 'text', text: 'PICKUP', color: '#ffffff' } }),
    { id: 'equipment:espresso', kind: 'asset', asset: 'espresso-machine', attachment: { nodeId: 'station:bar', anchor: 'top' }, heatEnabled: snapshot.open, selectable: false },
    { id: 'equipment:cooler', entityId: 'cooler', kind: 'asset', asset: 'walk-in-cooler', position: v(-1.5, -9.6), state: snapshot.cooler.celsius > snapshot.cooler.limit ? 'warning' : 'normal', label: 'Walk-in cooler', labelMode: 'active', selectable: true, surfaceLabel: { kind: 'text', text: `${snapshot.cooler.celsius.toFixed(1)} °C`, color: snapshot.cooler.celsius > snapshot.cooler.limit ? '#ffd27a' : '#bff3df', background: '#102438' } },
    { id: 'host-stand', kind: 'asset', asset: 'host-stand', position: v(9.2, 2.6), label: 'Host stand', labelMode: 'active', selectable: true },
  );
  if (!snapshot.open) { nodes.push(walking(worker('staff:closing', v(-6.5, PASS_Z), S, 'walking', SERVER), CLOSING_WALK)); return nodes; }
  nodes.push(
    chef('staff:grill', v(-12, -9.45), Math.PI, 'working', 'Grill cook'),
    chef('staff:pizza', v(-8.2, -8.45), Math.PI, 'working', 'Pizzaiolo', FEMININE),
    chef('staff:cold', v(-4.4, -9.45), Math.PI, 'working', 'Cold prep'),
    chef('staff:expo', v(-6.5, -6.15), 0, 'placing', 'Expo', FEMININE),
    worker('staff:dish', v(-12.3, -6.8), 0, 'working', '#9fb3c8', 'Dish'),
    worker('staff:bar', v(7, -9.3), 0, 'working', '#5a3b2e', 'Bartender'),
    person('staff:host', 'office-worker', v(9.2, 2.05), 0, 'idle', '#8a5a3c', 'Host', FEMININE),
  );
  // A server with plates in hand holds them; with free hands the arms swing.
  const runs = plateRuns(snapshot), visitOf = (run: PlateRun) => visits[run.server] ?? run.start;
  const server = (id: string, label: string, route: NodeRoute) => { const run = runs.find(item => item.server === id); return walking(worker(id, v(0, 0), S, run && !run.pairs[visitOf(run)].some(pair => !pair.table) ? 'walking' : 'holding', SERVER, label), route); };
  const servers = snapshot.scenario === 'rush'
    ? [server('staff:ana', 'Ana', RUSH_WALKS.ana), server('staff:ben', 'Ben', RUSH_WALKS.ben), server('staff:cleo', 'Cleo', RUSH_WALKS.cleo), server('staff:dan', 'Dan', RUSH_WALKS.dan)]
    : [worker('staff:ana', v(-7.2, 1.6), W, 'idle', SERVER, 'Ana'), server('staff:dan', 'Dan', QUIET_WALK)];
  // Every other server uses the feminine figure.
  nodes.push(...servers.map((server, i) => i % 2 ? server : { ...server, ...FEMININE }));
  // Plates move between servers' hands and table settings as the host reports each server reaching the pass or a table.
  nodes.push(...runs.flatMap(run => plateNodes(snapshot, run, visitOf(run))));
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
