import { personHairColor, createSceneStore, type AssetNode, type NodeRoute, type SceneNode, type SceneStore, type Vec3, type VisualState } from '@opsorama/core';

/** Floor service status of one table, as reported by the host's POS or reservation source. */
export type TableStatus = 'free' | 'reserved' | 'seated' | 'ordered' | 'eating' | 'waiting' | 'bill';
export type TicketStatus = 'queued' | 'cooking' | 'late' | 'ready';
export type StationId = 'grill' | 'pizza' | 'cold' | 'bar' | 'pass' | 'pickup';
export type Channel = 'dine-in' | 'takeout' | 'delivery';
export type RestaurantScenario = 'rush' | 'quiet' | 'closed';

export const TABLE_STATUS: Readonly<Record<TableStatus, { label: string; color: string; symbol: string; state: VisualState }>> = {
  free: { label: 'Free', color: '#91a0b5', symbol: '○', state: 'inactive' },
  reserved: { label: 'Reserved', color: '#8c7bc4', symbol: 'R', state: 'inactive' },
  seated: { label: 'Seated', color: '#5088ec', symbol: '◔', state: 'busy' },
  ordered: { label: 'Ordered', color: '#5088ec', symbol: '◑', state: 'busy' },
  eating: { label: 'Eating', color: '#38a88a', symbol: '●', state: 'normal' },
  waiting: { label: 'Food delayed', color: '#df6470', symbol: '!', state: 'critical' },
  bill: { label: 'Bill requested', color: '#dca644', symbol: '€', state: 'warning' },
};
export const TICKET_STATUS: Readonly<Record<TicketStatus, { label: string; color: string; symbol: string }>> = {
  queued: { label: 'Queued', color: '#91a0b5', symbol: '…' },
  cooking: { label: 'Cooking', color: '#5088ec', symbol: '↻' },
  late: { label: 'Late', color: '#df6470', symbol: '!' },
  ready: { label: 'Ready', color: '#38a88a', symbol: '✓' },
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

/** A floor point `[x, z]` walked through, or `[x, z, yaw, seconds]` where the person pauses facing `yaw` (0 faces +z). */
type Waypoint = readonly [x: number, z: number, yaw?: number, seconds?: number];
/** A looping walk that returns to its first point; `elapsed` staggers people who share the floor. */
function walk(points: readonly Waypoint[], speed: number, elapsed = 0): NodeRoute {
  const stops = points.flatMap(([, , yaw, seconds], index) => yaw === undefined ? [] : [{ index, seconds: seconds ?? 3, yaw }]);
  return { points: [...points, points[0]].map(([x, z]) => v(x, z)), speed, loop: true, elapsed, stops };
}
/** A person who walks `route`; the route owns position and heading, so the node starts at its first point. */
const walking = (node: AssetNode, route: NodeRoute): AssetNode => ({ ...node, position: route.points[0], route });
/**
 * Service walks through the aisles: x −13.7 by the side wall, −10.75, −7.5/−7, −4.15 and −3.25 between the table columns and booths, z −3.95 along
 * the kitchen partitions, z −0.3 between the table rows and z 3.2 in front of them. Servers collect at the heated pass
 * (front edge z −5.1), pause at their tables and return.
 */
const PASS_Z = -4.4, N = 0, S = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;
const RUSH_WALKS = {
  // Tables 1 and 2: plates from the pass.
  ana: walk([[-7.15, PASS_Z, S, 4], [-10.75, -4], [-10.75, -2.5, E, 5], [-10.75, -1.9, W, 4], [-10.75, -4]], 1.1),
  // Table 3 (late mains) and table 4 (bill).
  ben: walk([[-6.25, PASS_Z, S, 3], [-4.15, -3.95], [-4.15, -2.2, W, 5], [-4.15, -.3], [-12.5, -.3, N, 6], [-7, -.5], [-7, -3.95]], 1.2, 9),
  // Booths 7 and 8, lounge table 11 and table 5.
  cleo: walk([[-5.8, PASS_Z, S, 3], [-3.25, -3.95], [-3.25, -2.9, E, 4], [-3.25, -1, E, 4], [-3.25, 2.25], [.1, 2.25], [4.1, .4, E, 5], [.1, 2.25], [-9, 3.25, S, 5], [-7, 3], [-7, -3.9]], 1.25, 3),
  // Pizzas for terrace tables 13 and 12.
  dan: walk([[-6.7, PASS_Z, S, 4], [-7.5, -3.95], [-7.5, 3.3], [-7, 4.75, N, 5], [-11.5, 4.75, N, 5], [-7.5, 3.3]], 1.1, 14),
} as const;
const QUIET_WALK = walk([[-6.7, PASS_Z, S, 5], [-7.5, -3.95], [-7.5, 3.3], [-11.5, 4.75, N, 6], [-7.5, 3.3]], 1);
/** After close, one server checks every table around the dining room. */
const CLOSING_WALK = walk([[-6.5, PASS_Z, S, 4], [-13.7, -3.95], [-13.7, 2.9, E, 3], [-3.6, 2.9, N, 3], [-3.6, -3.95]], .9);
/** The courier walks between the cargo bike and the pickup shelf. */
const COURIER_WALK = walk([[10, 6.6, W, 4], [13.15, .6, E, 6]], 1.2);
/** The arriving party walks in from the street once and waits at the host stand. */
const arrival = (from: Vec3, to: Vec3): NodeRoute => ({ points: [from, to], speed: 1, endYaw: S });

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

/** Snapshot-dependent nodes: table states and covers, attached guests, station states, ready-order counts and staff. */
export function restaurantNodes(snapshot: RestaurantSnapshot): SceneNode[] {
  const nodes: SceneNode[] = [...restaurantBase];
  let tone = 0;
  for (const layout of TABLE_LAYOUT) {
    const session = snapshot.tables.find(table => table.tableId === layout.id) ?? free(layout.id), status = TABLE_STATUS[session.status];
    const covers = session.status === 'free' ? 0 : Math.min(layout.seats, session.party);
    nodes.push({ id: `table:${layout.id}`, entityId: layout.id, kind: 'asset', asset: layout.asset, ...(layout.variant ? { variant: layout.variant } : {}), position: v(...layout.position), ...(layout.rotation ? { rotation: [0, layout.rotation, 0] as Vec3 } : {}), count: covers, state: status.state, label: `${layout.label} · ${status.label}`, labelMode: 'active', selectable: true });
    nodes.push({ id: `table-status:${layout.id}`, entityId: layout.id, kind: 'asset', asset: 'map-pin', attachment: { nodeId: `table:${layout.id}`, anchor: 'top' }, position: [.18, .06, 0], scale: [.25, .25, .25], color: status.color, ...(status.state === 'warning' || status.state === 'critical' ? { state: status.state } : {}), localMotion: false, selectable: true });
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
  const servers = snapshot.scenario === 'rush'
    ? [walking(worker('staff:ana', v(0, 0), S, 'carrying', SERVER, 'Ana'), RUSH_WALKS.ana), walking(worker('staff:ben', v(0, 0), S, 'walking', SERVER, 'Ben'), RUSH_WALKS.ben), walking(worker('staff:cleo', v(0, 0), S, 'walking', SERVER, 'Cleo'), RUSH_WALKS.cleo), walking(worker('staff:dan', v(0, 0), S, 'carrying', SERVER, 'Dan'), RUSH_WALKS.dan)]
    : [worker('staff:ana', v(-7.2, 1.6), W, 'idle', SERVER, 'Ana'), walking(worker('staff:dan', v(0, 0), S, 'walking', SERVER, 'Dan'), QUIET_WALK)];
  // Every other server uses the feminine figure.
  nodes.push(...servers.map((server, i) => i % 2 ? server : { ...server, ...FEMININE }));
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
