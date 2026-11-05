import type { VisualState } from '@opsorama/core';

/**
 * Host-side mock data for the online shop and fulfilment centre. Everything in
 * this file is plain records: the scene, metrics and panels are derived from
 * one `EcommerceSnapshot`, and the host stays the source of truth for orders,
 * stock, docks and the shop floor. `SCENARIOS` are the starting points of the
 * mock feed in `simulation.ts`; no order is changed by the dashboard itself.
 */
export type EcommerceScenario = 'peak' | 'steady' | 'night';
export type AreaId = 'shop' | 'checkout' | 'collect' | 'receiving' | 'storage' | 'picking' | 'sorting' | 'packing' | 'dispatch' | 'returns';
export type OrderStage = 'released' | 'picking' | 'sorting' | 'packing' | 'staged' | 'collect';
export type Channel = 'web' | 'marketplace' | 'click-collect' | 'store';
export type CarrierId = 'swift' | 'parcelo' | 'freight';
export type DockId = 'D1' | 'D2' | 'D3';
export type LocationId = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10' | 'R11' | 'R12' | 'R13' | 'R14' | 'F1' | 'F2' | 'F3' | 'F4' | 'S1' | 'S2';
export type PackStationId = 'K1' | 'K2' | 'K3';
export type PutWallId = 'P1' | 'P2';
export type CheckoutId = 'C1' | 'C2' | 'C3';
export type DepartmentId = 'garden' | 'bath' | 'party' | 'audio' | 'kitchen' | 'home' | 'outdoor' | 'toys' | 'tech' | 'gifts';

/** Floor rectangle in metres: [west x, east x, back z, front z]. */
export type Rect = readonly [number, number, number, number];
export interface AreaLayout { id: AreaId; label: string; site: 'Shop' | 'Warehouse'; description: string; rect: Rect; color: string; }
/** Process areas tile the building; each is one selectable zone in the scene. Positions are illustrative metres. */
export const AREAS: readonly AreaLayout[] = [
  { id: 'shop', label: 'Shop floor', site: 'Shop', description: 'Gondolas by department; shoppers browse with carts and baskets.', rect: [-26, -9, -20.4, -1], color: '#e2eaf3' },
  { id: 'checkout', label: 'Checkouts', site: 'Shop', description: 'Three staffed lanes; the queue forms toward the shop floor.', rect: [-26, -15, -1, 5], color: '#e9e4f3' },
  { id: 'collect', label: 'Click & collect', site: 'Shop', description: 'Online orders picked in the warehouse wait at the counter or in the lockers.', rect: [-15, -9, -1, 5], color: '#f4e7dc' },
  { id: 'receiving', label: 'Receiving', site: 'Warehouse', description: 'The forklift unloads docks D1–D2 into the staging lane, next to the receiving check.', rect: [14, 22, -20.4, -5], color: '#e1eee5' },
  { id: 'storage', label: 'Reserve storage', site: 'Warehouse', description: 'Two rows of pallet racks, R01–R14, on two aisles. The reach truck puts pallets away and brings them to the pick faces.', rect: [-8, 14, -20.4, -5], color: '#e6e9ef' },
  { id: 'picking', label: 'Forward picking', site: 'Warehouse', description: 'Carton flow racks F1–F4 and shelves S1–S2, replenished from reserve.', rect: [-8, 8, -5, 0], color: '#edf0dc' },
  { id: 'sorting', label: 'Sortation', site: 'Warehouse', description: 'Picked totes ride the conveyor onto a robot; a sorter takes each tote off the robot into the put wall.', rect: [8, 22, -5, 0], color: '#dfedf1' },
  { id: 'packing', label: 'Packing', site: 'Warehouse', description: 'Three packing benches with scales and label printers.', rect: [2, 14, 0, 5], color: '#f3ecde' },
  { id: 'dispatch', label: 'Dispatch', site: 'Warehouse', description: 'Roll cages per carrier, pallet wrapping and outbound dock D3.', rect: [14, 22, 0, 5], color: '#ece2f1' },
  { id: 'returns', label: 'Returns', site: 'Warehouse', description: 'Returned items are inspected, restocked or held in quarantine.', rect: [-8, 2, 0, 5], color: '#f3e3e3' },
];
export const area = (id: AreaId) => AREAS.find(item => item.id === id)!;

export const ORDER_STAGES: readonly { id: OrderStage; label: string; area: AreaId; color: string }[] = [
  { id: 'released', label: 'Released', area: 'picking', color: '#91a0b5' },
  { id: 'picking', label: 'Picking', area: 'picking', color: '#5088ec' },
  { id: 'sorting', label: 'Sorting', area: 'sorting', color: '#3a9fb5' },
  { id: 'packing', label: 'Packing', area: 'packing', color: '#c98a2e' },
  { id: 'staged', label: 'Ready to ship', area: 'dispatch', color: '#38a88a' },
  { id: 'collect', label: 'Ready to collect', area: 'collect', color: '#8c6fd1' },
];
export const stage = (id: OrderStage) => ORDER_STAGES.find(item => item.id === id)!;
export const CHANNEL_LABELS: Readonly<Record<Channel, string>> = { web: 'Web shop', marketplace: 'Marketplace', 'click-collect': 'Click & collect', store: 'Shop transfer' };

export interface Carrier { id: CarrierId; name: string; service: string; cutoff: string; /** Roll cages (or the wrapper for pallets) that hold this carrier's staged orders. */ cages: readonly string[]; }
/** Fictional carriers. Each roll cage shows at most `CAGE_CAPACITY` parcels; exact totals stay in the panels. */
export const CARRIERS: readonly Carrier[] = [
  { id: 'swift', name: 'SwiftPost', service: 'Next-day parcels', cutoff: '11:30', cages: ['swift-1', 'swift-2'] },
  { id: 'parcelo', name: 'Parcelo', service: 'Economy parcels', cutoff: '16:00', cages: ['parcelo-1', 'parcelo-2'] },
  { id: 'freight', name: 'NordFreight', service: 'Wrapped pallets', cutoff: '17:00', cages: [] },
];
export const carrier = (id: CarrierId) => CARRIERS.find(item => item.id === id)!;
export const CAGE_CAPACITY = 12, PUT_WALL_CAPACITY = 20, COLLECT_CAPACITY = 8, LOCKER_CAPACITY = 16, STAGING_CAPACITY = 6, RETURNS_TOTE_CAPACITY = 9, HOLD_CAPACITY = 8;
/** Orders whose carrier cut-off is closer than this, and which are not yet staged, are at risk. */
export const CUTOFF_RISK_MINUTES = 60;

const RESERVE_FAMILIES = ['Kitchen reserve', 'Kitchen reserve', 'Home reserve', 'Outdoor reserve', 'Toys reserve', 'Tech reserve', 'Bulky & overflow'] as const;
export interface LocationLayout { id: LocationId; kind: 'rack' | 'flow' | 'shelf'; family: string; capacity: number; }
export const LOCATIONS: readonly LocationLayout[] = [
  { id: 'R01', kind: 'rack', family: 'Kitchen reserve', capacity: 6 },
  { id: 'R02', kind: 'rack', family: 'Kitchen reserve', capacity: 6 },
  { id: 'R03', kind: 'rack', family: 'Home reserve', capacity: 6 },
  { id: 'R04', kind: 'rack', family: 'Outdoor reserve', capacity: 6 },
  { id: 'R05', kind: 'rack', family: 'Toys reserve', capacity: 6 },
  { id: 'R06', kind: 'rack', family: 'Tech reserve', capacity: 6 },
  { id: 'R07', kind: 'rack', family: 'Bulky & overflow', capacity: 6 },
  // The back row repeats the seven reserve families of the front row, bay by bay.
  ...(['R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'R14'] as const).map((id, i): LocationLayout => ({ id, kind: 'rack', family: `${RESERVE_FAMILIES[i]} · back row`, capacity: 6 })),
  { id: 'F1', kind: 'flow', family: 'Kitchen', capacity: 12 },
  { id: 'F2', kind: 'flow', family: 'Home', capacity: 12 },
  { id: 'F3', kind: 'flow', family: 'Outdoor', capacity: 12 },
  { id: 'F4', kind: 'flow', family: 'Toys', capacity: 12 },
  { id: 'S1', kind: 'shelf', family: 'Tech accessories', capacity: 12 },
  { id: 'S2', kind: 'shelf', family: 'Gifts & bulky', capacity: 12 },
];
export const LOCATION_UNITS: Readonly<Record<LocationLayout['kind'], string>> = { rack: 'pallet positions', flow: 'lanes', shelf: 'bins' };
export const location = (id: LocationId) => LOCATIONS.find(item => item.id === id)!;
/** The front-row rack whose family a rack shares: R08 holds what R01 holds. */
export const reserveOf = (id: LocationId): LocationId => `R0${(Number(id.slice(1)) - 1) % 7 + 1}` as LocationId;

export const SKUS: Readonly<Record<string, { name: string; pick: LocationId; reserve: LocationId }>> = {
  'KIT-104': { name: 'Stoneware mug set', pick: 'F1', reserve: 'R01' },
  'KIT-221': { name: 'Chef’s knife', pick: 'F1', reserve: 'R02' },
  'HOM-118': { name: 'Linen throw', pick: 'F2', reserve: 'R03' },
  'HOM-330': { name: 'Desk lamp', pick: 'F2', reserve: 'R03' },
  'OUT-142': { name: 'Camping lantern', pick: 'F3', reserve: 'R04' },
  'OUT-215': { name: 'Insulated bottle', pick: 'F3', reserve: 'R04' },
  'TOY-120': { name: 'Wooden train set', pick: 'F4', reserve: 'R05' },
  'TOY-208': { name: 'Puzzle, 1000 pieces', pick: 'F4', reserve: 'R05' },
  'TEC-301': { name: 'Wireless speaker', pick: 'S1', reserve: 'R06' },
  'TEC-415': { name: 'USB-C charger', pick: 'S1', reserve: 'R06' },
  'GFT-510': { name: 'Gift box', pick: 'S2', reserve: 'R07' },
  'GFT-602': { name: 'Floor cushion', pick: 'S2', reserve: 'R07' },
};

/** Gondola rows run from the back of the shop to the front, two departments per row. */
export const DEPARTMENTS: readonly { id: DepartmentId; label: string }[] = [
  { id: 'garden', label: 'Garden' }, { id: 'bath', label: 'Bath' }, { id: 'party', label: 'Party' }, { id: 'audio', label: 'Audio' },
  { id: 'kitchen', label: 'Kitchen' }, { id: 'home', label: 'Home' }, { id: 'outdoor', label: 'Outdoor' },
  { id: 'toys', label: 'Toys' }, { id: 'tech', label: 'Tech' }, { id: 'gifts', label: 'Gifts' },
];
/** Each department has two gondolas; a gondola shows at most this many stocked facings. */
export const FACINGS_PER_GONDOLA = 24;

export interface OrderLine { sku: string; quantity: number; picked: number; }
export interface Order {
  id: string; customer: string; channel: Channel; stage: OrderStage; placed: string; value: number; lines: readonly OrderLine[];
  /** Delivery orders only; click & collect and shop transfers have none. */
  carrier?: CarrierId;
  /** Where the order is right now when it is more precise than its area: a put wall, packing bench or roll cage. */
  at?: PutWallId | PackStationId | 'wrapper';
  issue?: string;
}
export interface StockAlert { sku: string; onHand: number; min: number; task: string; }
export interface Dock {
  id: DockId; direction: 'inbound' | 'outbound';
  status: 'free' | 'expected' | 'unloading' | 'loading' | 'departed';
  partner: string; reference: string; time: string; pallets?: { done: number; total: number }; note: string; late?: boolean;
}
export interface Checkout { id: CheckoutId; open: boolean; queue: number; cashier?: string; }
export interface ActivityEvent { id: string; time: string; text: string; tone?: 'info' | 'success' | 'warning' | 'critical'; }
export type UnitKind = 'pallet' | 'tote' | 'carton' | 'parcel' | 'bag';
/** One physical object that moves through the site; its ID is its scene node ID. */
export interface UnitRecord { id: string; kind: UnitKind; label: string; sku?: string; orderId?: string; /** Where it is now, in words. */ at: string; }
/** What one working agent is doing now; `id` is its scene node ID. */
export interface TaskRecord { id: string; who: string; what: string; }

export interface EcommerceSnapshot {
  scenario: EcommerceScenario; day: string; time: string; shopOpen: boolean;
  ordersToday: number; shippedToday: number;
  orders: readonly Order[];
  /** Occupied positions per storage location (pallets, lanes or bins). */
  occupancy: Readonly<Record<LocationId, number>>;
  alerts: readonly StockAlert[];
  docks: readonly Dock[];
  /** Received pallets waiting for put-away in the receiving lanes. */
  staging: number;
  /** The Parcelo van waits in the yard for its collection. */
  parceloVan: boolean;
  /** People working in each warehouse area; the scene draws one figure per person up to the stations available. */
  crew: Readonly<Record<'receiving' | 'storage' | 'replenishing' | 'picking' | 'sorting' | 'packing' | 'dispatch' | 'shelving' | 'returns', number>>;
  robots: number;
  /** Empty pallets on the stack, 1–12. Inbound trucks take surplus pallets back. */
  emptyPallets: number;
  /** Physical objects outside their count-based fixtures, newest last. Empty until the mock feed fills it. */
  units: readonly UnitRecord[];
  /** Current jobs of the working agents. Empty until the mock feed fills it. */
  tasks: readonly TaskRecord[];
  returns: { awaiting: number; held: number; inspected: number };
  shop: { browsing: number; checkouts: readonly Checkout[]; collectWaiting: number; lockers: number; sales: number; facings: Readonly<Record<DepartmentId, number>> };
  events: readonly ActivityEvent[];
}

/** Occupied positions of the back rack row, bay by bay. */
const backRow = (counts: readonly number[]) => Object.fromEntries(counts.map((count, i) => [`R${String(i + 8).padStart(2, '0')}`, count])) as Readonly<Record<'R08' | 'R09' | 'R10' | 'R11' | 'R12' | 'R13' | 'R14', number>>;
const line = (sku: string, quantity: number, picked = quantity): OrderLine => ({ sku, quantity, picked });
const order = (id: string, customer: string, channel: Channel, stage: OrderStage, placed: string, value: number, lines: readonly OrderLine[], extra: Partial<Order> = {}): Order =>
  ({ id, customer, channel, stage, placed, value, lines, ...(channel === 'web' || channel === 'marketplace' ? { carrier: 'swift' as const } : {}), ...extra });
/** Staged parcels waiting in a carrier's roll cages; generated so cage counts match the order list exactly. */
const staged = (prefix: number, count: number, carrierId: CarrierId, customers: readonly string[], sku: string): Order[] =>
  Array.from({ length: count }, (_, i) => order(`#${prefix + i}`, customers[i % customers.length], i % 3 === 2 ? 'marketplace' : 'web', 'staged', `0${7 + (i % 3)}:${String(10 + i * 4).padStart(2, '0')}`, 24 + (i * 17) % 90, [line(sku, 1 + (i % 2))], { carrier: carrierId }));
const CUSTOMERS = ['M. Larsen', 'A. Okafor', 'J. Petrov', 'S. Haddad', 'L. Moreau', 'K. Tanaka', 'R. Silva', 'E. Novak', 'T. Brennan', 'I. Rossi'];

export const SCENARIOS: Readonly<Record<EcommerceScenario, EcommerceSnapshot>> = {
  peak: {
    scenario: 'peak', day: 'Monday', time: '10:40', shopOpen: true, ordersToday: 214, shippedToday: 126,
    orders: [
      order('#50431', 'H. Varga', 'web', 'released', '10:31', 58, [line('KIT-221', 1, 0)]),
      order('#50432', 'D. Ahmed', 'marketplace', 'released', '10:33', 112, [line('HOM-330', 1, 0), line('TEC-415', 2, 0)], { carrier: 'parcelo' }),
      order('#50433', 'Shop transfer', 'store', 'released', '10:35', 0, [line('OUT-215', 12, 0)], { issue: 'Waits for the F3 replenishment from R04.' }),
      order('#50419', 'N. Fischer', 'web', 'picking', '09:58', 64, [line('OUT-215', 2, 0), line('OUT-142', 1, 1)], { issue: 'Short pick: F3 lane for OUT-215 is empty. Replenishment from R04 is under way.' }),
      order('#50421', 'P. Costa', 'web', 'picking', '10:02', 39, [line('KIT-104', 1, 0)], { carrier: 'parcelo' }),
      order('#50424', 'G. Lindqvist', 'click-collect', 'picking', '10:09', 86, [line('TOY-208', 2, 1)]),
      order('#50426', 'B. Mensah', 'marketplace', 'picking', '10:14', 148, [line('TEC-301', 1, 1), line('TEC-415', 1, 0)], { carrier: 'parcelo' }),
      order('#50412', 'C. Dubois', 'web', 'sorting', '09:41', 72, [line('HOM-118', 1), line('KIT-104', 1)], { at: 'P1' }),
      order('#50414', 'Y. Kim', 'web', 'sorting', '09:47', 45, [line('TOY-208', 1)], { at: 'P1', carrier: 'parcelo' }),
      order('#50416', 'F. Ortega', 'marketplace', 'sorting', '09:50', 133, [line('OUT-142', 2), line('GFT-510', 1)], { at: 'P2', carrier: 'parcelo' }),
      order('#50405', 'W. Becker', 'web', 'packing', '09:22', 98, [line('TEC-301', 1)], { at: 'K1' }),
      order('#50407', 'O. Nilsen', 'web', 'packing', '09:26', 54, [line('KIT-221', 1), line('GFT-510', 1)], { at: 'K2', carrier: 'parcelo' }),
      order('#50409', 'U. Ivanova', 'click-collect', 'packing', '09:31', 77, [line('HOM-330', 1)], { at: 'K3' }),
      ...staged(50360, 9, 'swift', CUSTOMERS, 'KIT-104'),
      ...staged(50380, 6, 'parcelo', CUSTOMERS.slice(4), 'HOM-118'),
      order('#50301', 'Atelier Nord (B2B)', 'web', 'staged', '08:05', 1840, [line('GFT-602', 40)], { carrier: 'freight', at: 'wrapper' }),
      order('#50388', 'L. Moreau', 'click-collect', 'collect', '08:12', 45, [line('TOY-120', 1)]),
      order('#50391', 'J. Petrov', 'click-collect', 'collect', '08:20', 129, [line('TEC-301', 1), line('TEC-415', 1)]),
      order('#50395', 'A. Okafor', 'click-collect', 'collect', '08:34', 62, [line('HOM-118', 1)]),
      order('#50398', 'R. Silva', 'click-collect', 'collect', '08:51', 38, [line('KIT-104', 1)]),
    ],
    occupancy: { R01: 4, R02: 6, R03: 5, R04: 3, R05: 1, R06: 5, R07: 2, ...backRow([2, 3, 2, 1, 0, 3, 1]), F1: 11, F2: 12, F3: 9, F4: 10, S1: 11, S2: 8 },
    alerts: [
      { sku: 'OUT-215', onHand: 0, min: 12, task: 'Reach truck is bringing a pallet from R04 to F3.' },
      { sku: 'KIT-104', onHand: 5, min: 10, task: 'Replenishment from R01 queued after the current wave.' },
      { sku: 'TOY-120', onHand: 3, min: 6, task: 'No reserve stock. Waits for PO-7782 on dock D2.' },
    ],
    docks: [
      { id: 'D1', direction: 'inbound', status: 'unloading', partner: 'Baltic Home Supply', reference: 'PO-7779', time: '10:05', pallets: { done: 8, total: 14 }, note: 'Unloading; five pallets wait in the receiving lanes for put-away.' },
      { id: 'D2', direction: 'inbound', status: 'expected', partner: 'Toyworks', reference: 'PO-7782', time: '10:15', pallets: { done: 0, total: 10 }, note: 'Not arrived 25 minutes after the booked slot. Carries the TOY-120 restock.', late: true },
      { id: 'D3', direction: 'outbound', status: 'loading', partner: 'SwiftPost', reference: 'Route SP-12', time: '11:30', note: 'Trailer docked; loading roll cages until the 11:30 cut-off.' },
    ],
    staging: 5, parceloVan: false,
    crew: { receiving: 2, storage: 1, replenishing: 1, picking: 3, sorting: 2, packing: 3, dispatch: 1, shelving: 1, returns: 1 },
    robots: 2, emptyPallets: 8, units: [], tasks: [],
    returns: { awaiting: 6, held: 2, inspected: 14 },
    shop: { browsing: 9, checkouts: [{ id: 'C1', open: true, queue: 2, cashier: 'Mira' }, { id: 'C2', open: true, queue: 3, cashier: 'Jonas' }, { id: 'C3', open: false, queue: 0 }], collectWaiting: 1, lockers: 11, sales: 8940, facings: { garden: 36, bath: 38, party: 33, audio: 41, kitchen: 40, home: 44, outdoor: 19, toys: 31, tech: 42, gifts: 37 } },
    events: [
      { id: 'e6', time: '10:38', text: 'SwiftPost trailer docked at D3; loading started.', tone: 'info' },
      { id: 'e5', time: '10:35', text: 'F3 lane empty for OUT-215 Insulated bottle; replenishment from R04 started.', tone: 'critical' },
      { id: 'e4', time: '10:31', text: 'Order #50419 short-picked: OUT-215 ×2.', tone: 'warning' },
      { id: 'e3', time: '10:22', text: 'D1: 8 of 14 pallets of PO-7779 received.', tone: 'success' },
      { id: 'e2', time: '10:15', text: 'PO-7782 from Toyworks missed its D2 slot.', tone: 'warning' },
      { id: 'e1', time: '10:02', text: 'Wave 14 released: 12 orders.', tone: 'info' },
    ],
  },
  steady: {
    scenario: 'steady', day: 'Wednesday', time: '14:40', shopOpen: true, ordersToday: 161, shippedToday: 139,
    orders: [
      order('#51208', 'E. Novak', 'web', 'released', '14:32', 44, [line('KIT-221', 1, 0)], { carrier: 'parcelo' }),
      order('#51203', 'S. Haddad', 'marketplace', 'picking', '14:21', 92, [line('HOM-118', 1, 1), line('GFT-510', 1, 0)], { carrier: 'parcelo' }),
      order('#51199', 'K. Tanaka', 'click-collect', 'sorting', '14:48', 57, [line('TOY-208', 1)], { at: 'P1' }),
      order('#51195', 'T. Brennan', 'web', 'packing', '14:36', 120, [line('TEC-301', 1)], { at: 'K2', carrier: 'parcelo' }),
      ...staged(51150, 11, 'parcelo', CUSTOMERS, 'HOM-330'),
      order('#51120', 'I. Rossi', 'click-collect', 'collect', '12:40', 66, [line('KIT-104', 1)]),
      order('#51131', 'M. Larsen', 'click-collect', 'collect', '13:15', 210, [line('TEC-301', 2)]),
    ],
    occupancy: { R01: 3, R02: 5, R03: 4, R04: 2, R05: 4, R06: 5, R07: 3, ...backRow([2, 2, 3, 2, 2, 3, 1]), F1: 12, F2: 11, F3: 12, F4: 11, S1: 10, S2: 9 },
    alerts: [{ sku: 'KIT-104', onHand: 8, min: 10, task: 'Replenishment from R01 planned for the evening shift.' }],
    docks: [
      { id: 'D1', direction: 'inbound', status: 'free', partner: '—', reference: '—', time: '—', note: 'No booking until tomorrow 07:00.' },
      { id: 'D2', direction: 'inbound', status: 'free', partner: 'Toyworks', reference: 'PO-7782', time: '13:10', pallets: { done: 10, total: 10 }, note: 'Received at 13:10 and put away.' },
      { id: 'D3', direction: 'outbound', status: 'departed', partner: 'SwiftPost', reference: 'Route SP-12', time: '11:30', note: 'Departed on time with 94 parcels. Parcelo collects from the yard at 16:00.' },
    ],
    staging: 0, parceloVan: true,
    crew: { receiving: 0, storage: 1, replenishing: 1, picking: 1, sorting: 1, packing: 1, dispatch: 1, shelving: 1, returns: 1 },
    robots: 1, emptyPallets: 6, units: [], tasks: [],
    returns: { awaiting: 3, held: 1, inspected: 22 },
    shop: { browsing: 5, checkouts: [{ id: 'C1', open: true, queue: 1, cashier: 'Mira' }, { id: 'C2', open: false, queue: 0 }, { id: 'C3', open: true, queue: 0, cashier: 'Ada' }], collectWaiting: 0, lockers: 7, sales: 14320, facings: { garden: 40, bath: 37, party: 39, audio: 36, kitchen: 38, home: 41, outdoor: 40, toys: 36, tech: 39, gifts: 35 } },
    events: [
      { id: 'e4', time: '14:25', text: 'Parcelo van arrived in the yard for the 16:00 collection.', tone: 'info' },
      { id: 'e3', time: '13:10', text: 'PO-7782 received at D2; TOY-120 restocked.', tone: 'success' },
      { id: 'e2', time: '11:30', text: 'SwiftPost route SP-12 departed with 94 parcels.', tone: 'success' },
      { id: 'e1', time: '11:02', text: 'F3 replenished from R04.', tone: 'success' },
    ],
  },
  night: {
    scenario: 'night', day: 'Sunday', time: '22:10', shopOpen: false, ordersToday: 58, shippedToday: 0,
    orders: [
      ...['M. Larsen', 'A. Okafor', 'K. Tanaka', 'R. Silva', 'E. Novak'].map((customer, i) => order(`#5230${i}`, customer, i % 2 ? 'marketplace' : 'web', 'released', `2${i < 3 ? 0 : 1}:${String(12 + i * 9).padStart(2, '0')}`, 35 + i * 21, [line(Object.keys(SKUS)[i * 2], 1, 0)])),
      order('#52288', 'S. Haddad', 'click-collect', 'collect', '17:40', 49, [line('HOM-118', 1)]),
      order('#52291', 'L. Moreau', 'click-collect', 'collect', '18:05', 88, [line('TOY-208', 2)]),
    ],
    occupancy: { R01: 5, R02: 6, R03: 5, R04: 4, R05: 3, R06: 4, R07: 2, ...backRow([3, 2, 2, 2, 1, 2, 1]), F1: 12, F2: 12, F3: 11, F4: 12, S1: 12, S2: 10 },
    alerts: [{ sku: 'OUT-215', onHand: 6, min: 12, task: 'Reach truck replenishes F3 from R04 tonight.' }],
    docks: [
      { id: 'D1', direction: 'inbound', status: 'free', partner: '—', reference: '—', time: '—', note: 'Next booking Monday 06:30.' },
      { id: 'D2', direction: 'inbound', status: 'unloading', partner: 'Baltic Home Supply', reference: 'PO-7790', time: '21:40', pallets: { done: 6, total: 6 }, note: 'Overnight delivery unloaded; pallets wait for put-away.' },
      { id: 'D3', direction: 'outbound', status: 'free', partner: 'SwiftPost', reference: 'Route SP-12', time: '11:30', note: 'No Sunday collection.' },
    ],
    staging: 6, parceloVan: false,
    crew: { receiving: 1, storage: 1, replenishing: 1, picking: 0, sorting: 0, packing: 0, dispatch: 0, shelving: 0, returns: 0 },
    robots: 0, emptyPallets: 9, units: [], tasks: [],
    returns: { awaiting: 4, held: 1, inspected: 0 },
    shop: { browsing: 0, checkouts: [{ id: 'C1', open: false, queue: 0 }, { id: 'C2', open: false, queue: 0 }, { id: 'C3', open: false, queue: 0 }], collectWaiting: 0, lockers: 9, sales: 0, facings: { garden: 44, bath: 46, party: 43, audio: 45, kitchen: 46, home: 47, outdoor: 41, toys: 45, tech: 44, gifts: 42 } },
    events: [
      { id: 'e3', time: '22:02', text: 'Night replenishment started: F3 from R04.', tone: 'info' },
      { id: 'e2', time: '21:58', text: 'PO-7790 unloaded at D2: 6 pallets in receiving.', tone: 'success' },
      { id: 'e1', time: '18:00', text: 'Shop closed. Two click & collect orders wait for Monday.', tone: 'info' },
    ],
  },
};

export const minutesOf = (time: string) => { const [hours, minutes] = time.split(':').map(Number); return hours * 60 + minutes; };
const PRE_STAGE: readonly OrderStage[] = ['released', 'picking', 'sorting', 'packing'];
/** Minutes left until the order's carrier cut-off when the order is not yet staged and the cut-off is within `CUTOFF_RISK_MINUTES`. */
export function cutoffRisk(snapshot: EcommerceSnapshot, value: Order): number | null {
  if (!value.carrier || !PRE_STAGE.includes(value.stage) || !snapshot.shopOpen) return null;
  const left = minutesOf(carrier(value.carrier).cutoff) - minutesOf(snapshot.time);
  return left >= 0 && left <= CUTOFF_RISK_MINUTES ? left : null;
}
/** Area that currently holds the order. */
export const orderArea = (value: Order): AreaId => stage(value.stage).area;
export const ordersIn = (snapshot: EcommerceSnapshot, id: AreaId) => snapshot.orders.filter(value => orderArea(value) === id);
export const stagedFor = (snapshot: EcommerceSnapshot, id: CarrierId) => snapshot.orders.filter(value => value.stage === 'staged' && value.carrier === id);
/** Parcels shown in each roll cage: cages fill in order, `CAGE_CAPACITY` each; any overflow is disclosed in the panels. */
export function cageCounts(snapshot: EcommerceSnapshot, id: CarrierId): number[] {
  let left = stagedFor(snapshot, id).length;
  return carrier(id).cages.map(() => { const count = Math.min(CAGE_CAPACITY, left); left -= count; return count; });
}
export const alertStatus = (alert: StockAlert): 'out' | 'low' => alert.onHand === 0 ? 'out' : 'low';
export const alertsAt = (snapshot: EcommerceSnapshot, id: LocationId) => snapshot.alerts.filter(alert => SKUS[alert.sku].pick === id || SKUS[alert.sku].reserve === id);
export function locationState(snapshot: EcommerceSnapshot, id: LocationId): VisualState {
  const value = location(id), alerts = snapshot.alerts.filter(alert => SKUS[alert.sku].pick === id);
  if (alerts.some(alert => alertStatus(alert) === 'out')) return 'critical';
  if (alerts.length) return 'warning';
  if (value.kind === 'rack' && snapshot.alerts.some(alert => SKUS[alert.sku].reserve === id && /reach truck/i.test(alert.task))) return 'busy';
  return snapshot.occupancy[id] === 0 ? 'inactive' : 'normal';
}
export const shoppers = (snapshot: EcommerceSnapshot) => snapshot.shop.browsing + snapshot.shop.collectWaiting + snapshot.shop.checkouts.reduce((sum, lane) => sum + (lane.open ? lane.queue : 0), 0);
export const departmentFacings = (snapshot: EcommerceSnapshot, id: DepartmentId) => snapshot.shop.facings[id];
/** A department is short on the shelf below half of its two gondolas' facings. */
export const departmentLow = (snapshot: EcommerceSnapshot, id: DepartmentId) => departmentFacings(snapshot, id) < FACINGS_PER_GONDOLA;

export function ecommerceMetrics(snapshot: EcommerceSnapshot) {
  const risk = snapshot.orders.filter(value => cutoffRisk(snapshot, value) !== null);
  const next = CARRIERS.filter(item => item.cages.length && minutesOf(item.cutoff) >= minutesOf(snapshot.time)).sort((a, b) => minutesOf(a.cutoff) - minutesOf(b.cutoff))[0];
  const lanes = snapshot.shop.checkouts.filter(lane => lane.open);
  return {
    open: snapshot.orders.length, ready: snapshot.orders.filter(value => value.stage === 'staged' || value.stage === 'collect').length,
    atRisk: risk.length, nextCutoff: snapshot.shopOpen && next ? next : null,
    alerts: snapshot.alerts.length, out: snapshot.alerts.filter(alert => alertStatus(alert) === 'out').length,
    shoppers: shoppers(snapshot), lanesOpen: lanes.length, queue: lanes.reduce((sum, lane) => sum + lane.queue, 0),
  };
}

export type AreaTone = 'neutral' | 'info' | 'success' | 'warning' | 'critical';
/** Area status for the area list and the zone label: the most urgent condition wins. */
export function areaStatus(snapshot: EcommerceSnapshot, id: AreaId): { label: string; tone: AreaTone; state: VisualState } {
  const orders = ordersIn(snapshot, id), risk = orders.some(value => cutoffRisk(snapshot, value) !== null);
  const critical = (label: string) => ({ label, tone: 'critical' as const, state: 'critical' as const }), warning = (label: string) => ({ label, tone: 'warning' as const, state: 'warning' as const });
  const busy = (label: string) => ({ label, tone: 'info' as const, state: 'busy' as const }), idle = (label: string) => ({ label, tone: 'neutral' as const, state: 'inactive' as const });
  switch (id) {
    case 'shop': return !snapshot.shopOpen ? idle('Closed') : DEPARTMENTS.some(item => departmentLow(snapshot, item.id)) ? warning('Shelf gaps') : busy(`${snapshot.shop.browsing} browsing`);
    case 'checkout': { const queue = ecommerceMetrics(snapshot).queue; return !snapshot.shopOpen ? idle('Closed') : queue > 4 ? warning(`Queue ${queue}`) : busy(`Queue ${queue}`); }
    case 'collect': return orders.length ? busy(`${orders.length} ready`) : idle('Empty');
    case 'receiving': return snapshot.docks.some(dock => dock.direction === 'inbound' && dock.late) ? warning('Inbound late') : snapshot.staging ? busy(`${snapshot.staging} to put away`) : idle('Quiet');
    case 'storage': return snapshot.alerts.some(alert => /reach truck/i.test(alert.task)) ? busy('Replenishing') : idle('Quiet');
    case 'picking': return orders.some(value => value.issue && value.stage === 'picking') ? critical('Short pick') : risk ? warning('Cut-off risk') : orders.length ? busy(`${orders.length} orders`) : idle('No wave');
    case 'sorting': case 'packing': return risk ? warning('Cut-off risk') : orders.length ? busy(`${orders.length} orders`) : idle('Empty');
    case 'dispatch': return orders.length ? busy(`${orders.length} ready`) : idle('Empty');
    case 'returns': return snapshot.returns.held ? warning(`${snapshot.returns.held} on hold`) : snapshot.returns.awaiting ? busy(`${snapshot.returns.awaiting} to inspect`) : idle('Empty');
  }
}
