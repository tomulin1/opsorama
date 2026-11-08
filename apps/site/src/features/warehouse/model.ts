import type { VisualState } from '@opsorama/core';

/**
 * Mock data for the regional distribution centre example. A host would load dock appointments and yard
 * check-ins from its yard management system, deliveries, loads, locations and tasks from its warehouse
 * management system, and battery and fault states from its fleet telematics. Nothing here is live.
 */
export type WarehouseScenario = 'inbound' | 'dispatch' | 'night';
export type AreaId = 'yard' | 'inbound' | 'returns' | 'office' | 'charging' | 'outbound' | 'chilled' | 'hazmat' | 'bulk' | 'reserve' | 'each-pick' | 'sortation' | 'packing';
export type DockId = 'D01' | 'D02' | 'D03' | 'D04' | 'D05' | 'D06' | 'D07' | 'D08' | 'D09' | 'D10' | 'D11' | 'D12' | 'D13' | 'D14' | 'D15' | 'D16';
export type AisleId = 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'C01' | 'C02';
export type Side = 'L' | 'R';
export type DockStatus = 'free' | 'docked' | 'unloading' | 'loading' | 'out-of-service';
export type VehicleKind = 'forklift' | 'reach-truck' | 'amr';
export type VehicleStatus = 'working' | 'charging' | 'idle' | 'fault';
export type IssueKind = 'damaged' | 'count' | 'replenish';
/** x from, x to, z from, z to in metres, in the scene's ground plan. */
export type Rect = readonly [number, number, number, number];

export interface Area { id: AreaId; label: string; short: string; rect?: Rect; color: string; purpose: string }
export interface Dock { id: DockId; side: 'inbound' | 'outbound'; x: number }
export interface Aisle { id: AisleId; zone: 'reserve' | 'chilled'; bays: number; label: string }

/** An inbound delivery announced by an advance shipping notice (ASN). */
export interface Delivery { id: string; supplier: string; carrier: string; appointment: string; pallets: number; received: number; chilled?: boolean; hazardous?: boolean }
/** An outbound load: one truck run to a group of stores, or a parcel carrier collection. */
export interface Load { id: string; route: string; stops: number; carrier: string; departure: string; pallets: number; picked: number; loaded: number; shorts: number; parcel?: boolean }
/** A truck on site, at a dock door or in a numbered yard stall. `ref` is its delivery or load. */
export interface Truck { id: string; carrier: string; purpose: 'inbound' | 'outbound'; ref: string; arrived: string; dock?: DockId; stall?: number; /** A trailer left without its driver for a later slot; it does not count as waiting. */ dropped?: boolean }
export interface DockState { id: DockId; status: DockStatus; ref?: string; /** Inbound lanes only: received pallets waiting in the lane for putaway. Outbound lanes show picked minus loaded. */ staged?: number; note?: string }
export interface LocationIssue { aisle: AisleId; bay: number; side: Side; kind: IssueKind; note: string }
export interface Vehicle { id: string; kind: VehicleKind; status: VehicleStatus; battery: number; area: AreaId; aisle?: AisleId; operator?: string; note?: string }
export interface WarehouseEvent { time: string; text: string; node: string; tone: 'info' | 'warning' | 'critical' | 'success' }
export interface WarehouseSnapshot {
  scenario: WarehouseScenario; time: string; shift: string;
  docks: readonly DockState[]; deliveries: readonly Delivery[]; loads: readonly Load[]; trucks: readonly Truck[];
  /** Target fill of each aisle, 0–1. Bay counts are derived from it deterministically. */
  aisles: Readonly<Record<AisleId, number>>;
  issues: readonly LocationIssue[]; fleet: readonly Vehicle[];
  chilled: { temperature: number; setpoint: number; doorOpenMinutes: number };
  picking: { linesPlanned: number; linesPicked: number; perHour: readonly number[] };
  returns: { awaiting: number; held: number };
  crew: Readonly<Partial<Record<AreaId, number>>>;
  events: readonly WarehouseEvent[];
}

export const SITE_NAME = 'Northgate Distribution Centre';
/** Every dock lane holds two columns of five pallets. */
export const LANE_CAPACITY = 10;
/** A rack bay has three beam levels with two pallet positions each. */
export const BAY_POSITIONS = 6;
/** Yard and dock rules of this mock site. */
export const RULES = Object.freeze({ graceMinutes: 15, yardDwellMinutes: 45, putawayBacklog: 30, chilledWarning: 4.5, chilledCritical: 5, lowBattery: 20, loadMinutesPerPallet: 1.5, pickMinutesPerPallet: 3, shortsWarning: 5 });

export const AREAS: readonly Area[] = [
  { id: 'yard', label: 'Truck yard & gate', short: 'Yard', color: '#d5d9de', purpose: 'Gatehouse check-in, 16 dock doors on one front (U-flow), eight waiting stalls and a container drop area.' },
  { id: 'inbound', label: 'Receiving', short: 'Receiving', rect: [-48, -14, 3.5, 12], color: '#dbe7f4', purpose: 'Doors D01–D08: unload, check against the ASN, label and stage pallets in the door lane until a forklift puts them away.' },
  { id: 'returns', label: 'Returns', short: 'Returns', rect: [-14, -4, 3.5, 12], color: '#f2e2e5', purpose: 'Store returns are inspected, put back to stock, reworked or held in quarantine.' },
  { id: 'office', label: 'Dock office', short: 'Office', rect: [-4, 4, 3.5, 12], color: '#e9e6f3', purpose: 'Shift lead, dock scheduling and driver paperwork.' },
  { id: 'charging', label: 'MHE charging & service', short: 'Charging', rect: [4, 14, 3.5, 12], color: '#f1ead6', purpose: 'Battery charging for forklifts and reach trucks, and a service bay for tagged-out trucks.' },
  { id: 'outbound', label: 'Dispatch', short: 'Dispatch', rect: [14, 48, 3.5, 12], color: '#e0efdf', purpose: 'Doors D09–D16: picked pallets are wrapped and staged in the door lane of their load, then loaded in drop order.' },
  { id: 'chilled', label: 'Chilled chamber', short: 'Chilled', rect: [-48, -30, -18, 0], color: '#d4eaf1', purpose: 'Insulated room at +2…+4 °C with two reserve aisles for dairy and fresh products.' },
  { id: 'hazmat', label: 'Hazardous goods cage', short: 'Hazmat', rect: [-48, -39, -34, -21], color: '#f6dfd3', purpose: 'Fenced, ventilated store for flammable and corrosive cleaning chemicals in IBCs and drums.' },
  { id: 'bulk', label: 'Bulk & empty pallets', short: 'Bulk', rect: [-39, -30, -34, -21], color: '#ebe5d9', purpose: 'Block-stacked fast movers and the empty pallet store.' },
  { id: 'reserve', label: 'Reserve racking', short: 'Reserve', rect: [-29, 12.5, -34, 0], color: '#e3e8ed', purpose: 'Seven wide aisles of selective pallet racking. Level 0 is the case-pick face, levels 1–2 hold reserve pallets; fast movers sit in the bays nearest the dock.' },
  { id: 'each-pick', label: 'Each picking', short: 'Each pick', rect: [13.5, 31, -17, 0], color: '#e4efe8', purpose: 'Carton flow racks and shelving for small items, picked into totes on picking carts and inducted onto the conveyor.' },
  { id: 'sortation', label: 'AMR sortation', short: 'Sortation', rect: [31, 48, -17, 0], color: '#e7e8f4', purpose: 'Mobile robots carry totes to put walls that consolidate store and online orders; parcels leave the conveyor into roll cages.' },
  { id: 'packing', label: 'Packing & VAS', short: 'Packing', rect: [13.5, 48, -34, -17], color: '#f2ebdd', purpose: 'Seven pack benches along the conveyor, value-added services (labelling, kitting) and a secure cage for high-value goods.' },
];

export const DOCKS: readonly Dock[] = Array.from({ length: 16 }, (_, i) => ({ id: `D${String(i + 1).padStart(2, '0')}` as DockId, side: i < 8 ? 'inbound' : 'outbound', x: i < 8 ? -46 + i * 4 : 18 + (i - 8) * 4 }));
export const AISLES: readonly Aisle[] = [
  ...(['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07'] as const).map(id => ({ id, zone: 'reserve' as const, bays: 10, label: `Aisle ${id}` })),
  { id: 'C01', zone: 'chilled', bays: 5, label: 'Chilled aisle C01' }, { id: 'C02', zone: 'chilled', bays: 5, label: 'Chilled aisle C02' },
];
export const STALLS = 8;

export const areaOf = (id: AreaId) => AREAS.find(value => value.id === id)!;
export const dockOf = (id: DockId) => DOCKS.find(value => value.id === id)!;
export const aisleOf = (id: AisleId) => AISLES.find(value => value.id === id)!;
/** Location code: aisle, bay (01 nearest the cross aisle) and rack side, e.g. A03-07-L. */
export const locationCode = (aisle: AisleId, bay: number, side: Side) => `${aisle}-${String(bay + 1).padStart(2, '0')}-${side}`;

/* ── Time ───────────────────────────────────────────────────────────────── */

const minutesOf = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
/** Minutes from `from` to `to` on a 24 h clock; a later time before `from` is the next day. */
export function minutesBetween(from: string, to: string): number { const value = minutesOf(to) - minutesOf(from); return value < -720 ? value + 1440 : value > 720 ? value - 1440 : value; }

/* ── Mock snapshots ─────────────────────────────────────────────────────── */

const dock = (id: DockId, status: DockStatus, ref?: string, staged?: number, note?: string): DockState => ({ id, status, ...(ref ? { ref } : {}), ...(staged !== undefined ? { staged } : {}), ...(note ? { note } : {}) });
const free = (ids: readonly DockId[], staged: Partial<Record<DockId, number>> = {}) => ids.map(id => dock(id, 'free', undefined, DOCKS.find(value => value.id === id)!.side === 'inbound' ? staged[id] ?? 0 : undefined));
const vehicle = (id: string, kind: VehicleKind, status: VehicleStatus, battery: number, area: AreaId, extra: Partial<Vehicle> = {}): Vehicle => ({ id, kind, status, battery, area, ...extra });
const issue = (aisle: AisleId, bay: number, side: Side, kind: IssueKind, note: string): LocationIssue => ({ aisle, bay, side, kind, note });

export const SCENARIOS: Readonly<Record<WarehouseScenario, WarehouseSnapshot>> = {
  inbound: {
    scenario: 'inbound', time: '06:40', shift: 'Early shift',
    docks: [
      dock('D01', 'unloading', 'ASN-40213', 8), dock('D02', 'unloading', 'ASN-40214', 6), dock('D03', 'docked', 'ASN-40217', 0, 'Waiting for a free forklift.'),
      dock('D04', 'unloading', 'ASN-40215', 10, 'Lane full; putaway is behind.'), ...free(['D05'], { D05: 4 }), dock('D06', 'unloading', 'ASN-40216', 5, 'Chilled pallets must reach the chamber within 20 min.'),
      ...free(['D07']), dock('D08', 'out-of-service', undefined, 0, 'Dock leveler fault reported at 05:10; technician booked for 08:00.'),
      dock('D09', 'loading', 'L-5101'), dock('D10', 'loading', 'L-5102'), dock('D11', 'docked', 'L-5103'), ...free(['D12', 'D14', 'D15', 'D16']), dock('D13', 'free', 'L-5105'),
    ],
    deliveries: [
      { id: 'ASN-40213', supplier: 'Brightmill Foods', carrier: 'Norvale Haulage', appointment: '06:00', pallets: 22, received: 14 },
      { id: 'ASN-40214', supplier: 'Okra Beverages', carrier: 'Tamberlin Freight', appointment: '06:15', pallets: 24, received: 6 },
      { id: 'ASN-40215', supplier: 'Tidewell Paper', carrier: 'Quillon Transport', appointment: '05:30', pallets: 20, received: 20 },
      { id: 'ASN-40216', supplier: 'Fernhill Dairy', carrier: 'Fernhill Dairy', appointment: '06:00', pallets: 16, received: 9, chilled: true },
      { id: 'ASN-40217', supplier: 'Clearwave Home', carrier: 'Norvale Haulage', appointment: '06:30', pallets: 18, received: 0, hazardous: true },
      { id: 'ASN-40218', supplier: 'Okra Beverages', carrier: 'Tamberlin Freight', appointment: '07:00', pallets: 24, received: 0 },
      { id: 'ASN-40219', supplier: 'Harbourline Imports', carrier: 'Quillon Transport', appointment: '06:00', pallets: 26, received: 0 },
      { id: 'ASN-40220', supplier: 'Brightmill Foods', carrier: 'Norvale Haulage', appointment: '07:30', pallets: 20, received: 0 },
    ],
    loads: [
      { id: 'L-5101', route: 'Route 1 · Northfield', stops: 5, carrier: 'Own fleet', departure: '07:15', pallets: 18, picked: 18, loaded: 16, shorts: 0 },
      { id: 'L-5102', route: 'Route 2 · Hollow Bay', stops: 6, carrier: 'Own fleet', departure: '07:30', pallets: 18, picked: 18, loaded: 9, shorts: 1 },
      { id: 'L-5103', route: 'Route 3 · Riverside', stops: 4, carrier: 'Own fleet', departure: '08:30', pallets: 16, picked: 16, loaded: 0, shorts: 0 },
      { id: 'L-5105', route: 'Route 5 · Westmoor', stops: 7, carrier: 'Tamberlin Freight', departure: '09:30', pallets: 20, picked: 7, loaded: 0, shorts: 2 },
    ],
    trucks: [
      { id: 'TR-118', carrier: 'Norvale Haulage', purpose: 'inbound', ref: 'ASN-40213', arrived: '05:52', dock: 'D01' },
      { id: 'TR-204', carrier: 'Tamberlin Freight', purpose: 'inbound', ref: 'ASN-40214', arrived: '06:10', dock: 'D02' },
      { id: 'TR-087', carrier: 'Norvale Haulage', purpose: 'inbound', ref: 'ASN-40217', arrived: '06:24', dock: 'D03' },
      { id: 'TR-311', carrier: 'Quillon Transport', purpose: 'inbound', ref: 'ASN-40215', arrived: '05:20', dock: 'D04' },
      { id: 'TR-142', carrier: 'Fernhill Dairy', purpose: 'inbound', ref: 'ASN-40216', arrived: '05:58', dock: 'D06' },
      { id: 'TR-401', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5101', arrived: '05:40', dock: 'D09' },
      { id: 'TR-402', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5102', arrived: '05:45', dock: 'D10' },
      { id: 'TR-403', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5103', arrived: '06:20', dock: 'D11' },
      { id: 'TR-221', carrier: 'Tamberlin Freight', purpose: 'inbound', ref: 'ASN-40218', arrived: '06:05', stall: 0 },
      { id: 'TR-330', carrier: 'Quillon Transport', purpose: 'inbound', ref: 'ASN-40219', arrived: '06:31', stall: 1 },
      { id: 'TR-512', carrier: 'Tamberlin Freight', purpose: 'outbound', ref: 'L-5105', arrived: '06:35', stall: 2 },
    ],
    aisles: { A01: .9, A02: .86, A03: .82, A04: .78, A05: .74, A06: .7, A07: .62, C01: .8, C02: .66 },
    issues: [issue('A02', 4, 'R', 'count', 'Cycle count found 31 cases, the system expects 36.'), issue('A06', 1, 'L', 'replenish', 'Pick face empty; replenishment task released at 06:32.')],
    fleet: [
      vehicle('FL1', 'forklift', 'working', 78, 'inbound', { operator: 'Marek' }), vehicle('FL2', 'forklift', 'working', 64, 'inbound', { operator: 'Ines' }),
      vehicle('FL3', 'forklift', 'working', 55, 'outbound', { operator: 'Tomasz' }), vehicle('FL4', 'forklift', 'charging', 22, 'charging'),
      vehicle('RT1', 'reach-truck', 'working', 81, 'reserve', { aisle: 'A01', operator: 'Lena' }), vehicle('RT2', 'reach-truck', 'working', 70, 'reserve', { aisle: 'A03', operator: 'Pavel' }),
      vehicle('RT3', 'reach-truck', 'working', 47, 'reserve', { aisle: 'A05', operator: 'Ruth' }), vehicle('RT4', 'reach-truck', 'charging', 18, 'charging'),
      vehicle('RT5', 'reach-truck', 'idle', 90, 'charging', { note: 'Chilled truck, no driver until 07:00.' }), vehicle('RT6', 'reach-truck', 'working', 66, 'reserve', { aisle: 'A07', operator: 'Dana' }),
      ...['AMR1', 'AMR2', 'AMR3', 'AMR4'].map((id, i) => vehicle(id, 'amr', 'working', [88, 74, 69, 52][i], 'sortation')), ...['AMR5', 'AMR6'].map((id, i) => vehicle(id, 'amr', 'charging', [31, 44][i], 'sortation')),
    ],
    chilled: { temperature: 3.1, setpoint: 3, doorOpenMinutes: 0 },
    picking: { linesPlanned: 9400, linesPicked: 2100, perHour: [620, 940, 1110, 1180] },
    returns: { awaiting: 34, held: 3 },
    crew: { yard: 2, inbound: 9, returns: 2, office: 3, outbound: 7, chilled: 1, reserve: 5, 'each-pick': 12, sortation: 3, packing: 6 },
    events: [
      { time: '06:38', text: 'Lane D04 full: 10 pallets waiting for putaway', node: 'dock:D04', tone: 'warning' },
      { time: '06:35', text: 'TR-512 checked in for L-5105, sent to stall 3', node: 'truck:TR-512', tone: 'info' },
      { time: '06:31', text: 'TR-330 arrived 31 min after its 06:00 slot', node: 'truck:TR-330', tone: 'warning' },
      { time: '06:24', text: 'TR-087 docked at D03 with hazardous goods', node: 'dock:D03', tone: 'info' },
      { time: '06:12', text: 'Cycle count difference at A02-05-R', node: 'rack:A02:4:R', tone: 'warning' },
      { time: '05:10', text: 'D08 taken out of service: leveler fault', node: 'dock:D08', tone: 'critical' },
    ],
  },
  dispatch: {
    scenario: 'dispatch', time: '14:20', shift: 'Late shift',
    docks: [
      ...free(['D01', 'D03', 'D04', 'D06', 'D07', 'D08'], { D01: 2, D04: 3 }), dock('D02', 'unloading', 'ASN-40241', 6), dock('D05', 'unloading', 'ASN-40244', 7, 'Floor-loaded cartons: building pallets on the dock.'),
      dock('D09', 'loading', 'L-5121'), dock('D10', 'loading', 'L-5122'), dock('D11', 'loading', 'L-5123'), dock('D12', 'loading', 'L-5124'),
      dock('D13', 'loading', 'L-5125'), dock('D14', 'docked', 'L-5126'), dock('D15', 'loading', 'L-5127'), ...free(['D16']),
    ],
    deliveries: [
      { id: 'ASN-40241', supplier: 'Okra Beverages', carrier: 'Tamberlin Freight', appointment: '13:30', pallets: 24, received: 18 },
      { id: 'ASN-40244', supplier: 'Harbourline Imports', carrier: 'Quillon Transport', appointment: '13:45', pallets: 30, received: 4 },
      { id: 'ASN-40246', supplier: 'Clearwave Home', carrier: 'Norvale Haulage', appointment: '13:30', pallets: 18, received: 0, hazardous: true },
      { id: 'ASN-40247', supplier: 'Fernhill Dairy', carrier: 'Fernhill Dairy', appointment: '13:50', pallets: 14, received: 0, chilled: true },
      { id: 'ASN-40248', supplier: 'Tidewell Paper', carrier: 'Quillon Transport', appointment: '15:00', pallets: 20, received: 0 },
    ],
    loads: [
      { id: 'L-5121', route: 'Route 1 · Northfield', stops: 5, carrier: 'Own fleet', departure: '15:00', pallets: 20, picked: 20, loaded: 12, shorts: 0 },
      { id: 'L-5122', route: 'Route 2 · Hollow Bay', stops: 6, carrier: 'Own fleet', departure: '15:00', pallets: 18, picked: 18, loaded: 14, shorts: 1 },
      { id: 'L-5123', route: 'Route 3 · Riverside', stops: 4, carrier: 'Own fleet', departure: '14:45', pallets: 22, picked: 15, loaded: 6, shorts: 7 },
      { id: 'L-5124', route: 'Route 4 · Ashcombe', stops: 5, carrier: 'Own fleet', departure: '14:30', pallets: 18, picked: 18, loaded: 18, shorts: 0 },
      { id: 'L-5125', route: 'Route 5 · Westmoor', stops: 7, carrier: 'Tamberlin Freight', departure: '16:00', pallets: 16, picked: 9, loaded: 2, shorts: 2 },
      { id: 'L-5126', route: 'Route 6 · Kingsley', stops: 6, carrier: 'Tamberlin Freight', departure: '16:30', pallets: 20, picked: 10, loaded: 0, shorts: 0 },
      { id: 'L-5127', route: 'Parcels · Swiftpost', stops: 1, carrier: 'Swiftpost', departure: '17:00', pallets: 14, picked: 11, loaded: 9, shorts: 0, parcel: true },
      { id: 'L-5128', route: 'Route 7 · Elmstead', stops: 5, carrier: 'Own fleet', departure: '17:30', pallets: 18, picked: 4, loaded: 0, shorts: 0 },
    ],
    trucks: [
      { id: 'TR-204', carrier: 'Tamberlin Freight', purpose: 'inbound', ref: 'ASN-40241', arrived: '13:24', dock: 'D02' },
      { id: 'TR-337', carrier: 'Quillon Transport', purpose: 'inbound', ref: 'ASN-40244', arrived: '13:40', dock: 'D05' },
      { id: 'TR-401', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5121', arrived: '13:10', dock: 'D09' },
      { id: 'TR-402', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5122', arrived: '13:12', dock: 'D10' },
      { id: 'TR-403', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5123', arrived: '13:30', dock: 'D11' },
      { id: 'TR-404', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5124', arrived: '12:55', dock: 'D12' },
      { id: 'TR-512', carrier: 'Tamberlin Freight', purpose: 'outbound', ref: 'L-5125', arrived: '13:55', dock: 'D13' },
      { id: 'TR-515', carrier: 'Tamberlin Freight', purpose: 'outbound', ref: 'L-5126', arrived: '14:05', dock: 'D14' },
      { id: 'TR-760', carrier: 'Swiftpost', purpose: 'outbound', ref: 'L-5127', arrived: '14:00', dock: 'D15' },
      { id: 'TR-245', carrier: 'Norvale Haulage', purpose: 'inbound', ref: 'ASN-40246', arrived: '13:20', stall: 0 },
      { id: 'TR-618', carrier: 'Fernhill Dairy', purpose: 'inbound', ref: 'ASN-40247', arrived: '14:16', stall: 1 },
      { id: 'TR-405', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5128', arrived: '14:02', stall: 4 },
    ],
    aisles: { A01: .66, A02: .7, A03: .62, A04: .74, A05: .68, A06: .6, A07: .72, C01: .58, C02: .5 },
    issues: [
      issue('A04', 5, 'L', 'damaged', 'Upright hit by a forklift at 13:52. Bay unloaded and blocked until the rack inspector signs it off.'),
      issue('A02', 4, 'R', 'count', 'Recount pending: 31 cases found, 36 expected.'),
      issue('A01', 0, 'R', 'replenish', 'Pick face empty during the wave; task waiting for a reach truck.'),
      issue('A03', 1, 'L', 'replenish', 'Below minimum: 2 cases left.'),
      issue('A06', 1, 'L', 'replenish', 'Pick face empty; three short picks for L-5123.'),
      issue('C02', 2, 'R', 'replenish', 'Yoghurt pick face below minimum.'),
    ],
    fleet: [
      vehicle('FL1', 'forklift', 'working', 58, 'outbound', { operator: 'Marek' }), vehicle('FL2', 'forklift', 'working', 41, 'inbound', { operator: 'Ines' }),
      vehicle('FL3', 'forklift', 'fault', 63, 'charging', { note: 'Hydraulic leak at the mast; tagged out at 13:55. Same truck that hit A04-06.' }), vehicle('FL4', 'forklift', 'working', 76, 'outbound', { operator: 'Nadia' }),
      vehicle('RT1', 'reach-truck', 'working', 52, 'reserve', { aisle: 'A01', operator: 'Lena' }), vehicle('RT2', 'reach-truck', 'working', 14, 'reserve', { aisle: 'A04', operator: 'Pavel', note: 'Battery below 20 %: swap after this task.' }),
      vehicle('RT3', 'reach-truck', 'working', 61, 'reserve', { aisle: 'A06', operator: 'Ruth' }), vehicle('RT4', 'reach-truck', 'working', 88, 'reserve', { aisle: 'A03', operator: 'Oskar' }),
      vehicle('RT5', 'reach-truck', 'working', 72, 'chilled', { aisle: 'C02', operator: 'Hana' }), vehicle('RT6', 'reach-truck', 'charging', 35, 'charging'),
      ...['AMR1', 'AMR2', 'AMR3', 'AMR5'].map((id, i) => vehicle(id, 'amr', 'working', [57, 46, 63, 81][i], 'sortation')), vehicle('AMR4', 'amr', 'charging', 12, 'sortation'), vehicle('AMR6', 'amr', 'charging', 38, 'sortation'),
    ],
    chilled: { temperature: 6.4, setpoint: 3, doorOpenMinutes: 12 },
    picking: { linesPlanned: 11800, linesPicked: 8350, perHour: [1260, 1390, 1450, 1420, 1310, 1420] },
    returns: { awaiting: 58, held: 6 },
    crew: { yard: 2, inbound: 5, returns: 3, office: 3, outbound: 11, chilled: 2, reserve: 6, 'each-pick': 16, sortation: 4, packing: 9 },
    events: [
      { time: '14:18', text: 'L-5123 at risk: 7 pallets still to pick, departure 14:45', node: 'dock:D11', tone: 'critical' },
      { time: '14:08', text: 'Chilled chamber door open for 12 min, 6.4 °C', node: 'chilled:display', tone: 'critical' },
      { time: '14:05', text: 'TR-515 docked at D14 for L-5126', node: 'dock:D14', tone: 'info' },
      { time: '14:02', text: 'L-5124 fully loaded, waiting for the driver', node: 'dock:D12', tone: 'success' },
      { time: '13:55', text: 'FL3 tagged out: hydraulic leak', node: 'mhe:FL3', tone: 'critical' },
      { time: '13:52', text: 'Rack damage reported at A04-06-L, bay blocked', node: 'rack:A04:5:L', tone: 'critical' },
    ],
  },
  night: {
    scenario: 'night', time: '23:40', shift: 'Night shift',
    docks: [
      ...free(['D01', 'D02', 'D03', 'D05', 'D06', 'D08'], { D03: 2 }), dock('D04', 'docked', 'ASN-40261', 0, 'Dropped for the 05:30 unload.'), dock('D07', 'unloading', 'ASN-40260', 4),
      ...free(['D09', 'D10', 'D11', 'D12', 'D13', 'D14', 'D15']), dock('D16', 'loading', 'L-5141'),
    ],
    deliveries: [
      { id: 'ASN-40260', supplier: 'North hub transfer', carrier: 'Own fleet', appointment: '23:30', pallets: 12, received: 8 },
      { id: 'ASN-40261', supplier: 'Brightmill Foods', carrier: 'Norvale Haulage', appointment: '05:30', pallets: 22, received: 0 },
    ],
    loads: [
      { id: 'L-5141', route: 'Night trunk · North hub', stops: 1, carrier: 'Own fleet', departure: '00:30', pallets: 26, picked: 26, loaded: 20, shorts: 0 },
      { id: 'L-5142', route: 'Route 1 · Northfield', stops: 5, carrier: 'Own fleet', departure: '05:15', pallets: 18, picked: 6, loaded: 0, shorts: 0 },
    ],
    trucks: [
      { id: 'TR-406', carrier: 'Own fleet', purpose: 'inbound', ref: 'ASN-40260', arrived: '23:22', dock: 'D07' },
      { id: 'TR-119', carrier: 'Norvale Haulage', purpose: 'inbound', ref: 'ASN-40261', arrived: '22:40', dock: 'D04', dropped: true },
      { id: 'TR-407', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5141', arrived: '22:50', dock: 'D16' },
      { id: 'TR-401', carrier: 'Own fleet', purpose: 'outbound', ref: 'L-5142', arrived: '21:30', stall: 5, dropped: true },
    ],
    aisles: { A01: .78, A02: .8, A03: .76, A04: .82, A05: .79, A06: .74, A07: .7, C01: .72, C02: .7 },
    issues: [
      issue('A04', 5, 'L', 'damaged', 'Awaiting rack inspection at 07:00; bay stays empty.'),
      issue('A01', 0, 'R', 'replenish', 'Night top-up for the 05:00 wave.'), issue('A02', 0, 'L', 'replenish', 'Night top-up for the 05:00 wave.'),
      issue('A05', 2, 'R', 'replenish', 'Night top-up for the 05:00 wave.'), issue('A07', 1, 'L', 'replenish', 'Night top-up for the 05:00 wave.'),
    ],
    fleet: [
      vehicle('FL1', 'forklift', 'working', 49, 'outbound', { operator: 'Jonas' }), vehicle('FL2', 'forklift', 'charging', 33, 'charging'),
      vehicle('FL3', 'forklift', 'fault', 63, 'charging', { note: 'Waiting for a mast seal kit, due 09:00.' }), vehicle('FL4', 'forklift', 'charging', 27, 'charging'),
      vehicle('RT1', 'reach-truck', 'working', 72, 'reserve', { aisle: 'A01', operator: 'Mila' }), vehicle('RT2', 'reach-truck', 'working', 95, 'reserve', { aisle: 'A05', operator: 'Ali' }),
      vehicle('RT3', 'reach-truck', 'working', 68, 'reserve', { aisle: 'A07', operator: 'Sven' }), vehicle('RT4', 'reach-truck', 'working', 54, 'reserve', { aisle: 'A02', operator: 'Edita' }),
      vehicle('RT5', 'reach-truck', 'idle', 61, 'charging'), vehicle('RT6', 'reach-truck', 'charging', 24, 'charging'),
      ...['AMR1', 'AMR2', 'AMR3', 'AMR4', 'AMR5', 'AMR6'].map((id, i) => vehicle(id, 'amr', 'charging', [64, 58, 71, 49, 66, 80][i], 'sortation')),
    ],
    chilled: { temperature: 2.8, setpoint: 3, doorOpenMinutes: 0 },
    picking: { linesPlanned: 600, linesPicked: 420, perHour: [380, 310, 260, 240] },
    returns: { awaiting: 12, held: 6 },
    crew: { yard: 1, inbound: 2, returns: 0, office: 1, outbound: 3, chilled: 0, reserve: 4, 'each-pick': 3, sortation: 0, packing: 2 },
    events: [
      { time: '23:36', text: 'Four replenishment tasks released for the 05:00 wave', node: 'aisle:A01', tone: 'info' },
      { time: '23:22', text: 'Hub transfer TR-406 docked at D07', node: 'dock:D07', tone: 'info' },
      { time: '22:50', text: 'Night trunk L-5141 started loading at D16', node: 'dock:D16', tone: 'info' },
      { time: '22:40', text: 'TR-119 dropped at D04 for the morning', node: 'truck:TR-119', tone: 'info' },
      { time: '22:05', text: 'AMRs parked on their chargers after the last wave', node: 'area:sortation', tone: 'success' },
    ],
  },
};

/* ── Derived records ────────────────────────────────────────────────────── */

export const dockState = (snapshot: WarehouseSnapshot, id: DockId) => snapshot.docks.find(value => value.id === id)!;
export const truckAt = (snapshot: WarehouseSnapshot, id: DockId) => snapshot.trucks.find(value => value.dock === id);
export const deliveryOf = (snapshot: WarehouseSnapshot, id?: string) => snapshot.deliveries.find(value => value.id === id);
export const loadOf = (snapshot: WarehouseSnapshot, id?: string) => snapshot.loads.find(value => value.id === id);
/** The dock a load is assigned to, if any. */
export const loadDock = (snapshot: WarehouseSnapshot, id: string) => snapshot.docks.find(value => value.ref === id)?.id;
export const truckFor = (snapshot: WarehouseSnapshot, ref: string) => snapshot.trucks.find(value => value.ref === ref);

/** Pallets in a dock lane: waiting for putaway on inbound docks, picked but not loaded on outbound docks. */
export function stagedPallets(snapshot: WarehouseSnapshot, id: DockId): number {
  const state = dockState(snapshot, id);
  if (dockOf(id).side === 'inbound') return state.staged ?? 0;
  const load = loadOf(snapshot, state.ref);
  return load ? load.picked - load.loaded : 0;
}

export type DeliveryStatus = 'At door' | 'In yard' | 'Received' | 'Expected';
export function deliveryStatus(snapshot: WarehouseSnapshot, delivery: Delivery): DeliveryStatus {
  const truck = truckFor(snapshot, delivery.id);
  return truck?.dock ? 'At door' : truck ? 'In yard' : delivery.received >= delivery.pallets ? 'Received' : 'Expected';
}
/** A delivery is late when its truck arrived more than the grace period after the slot, or has not arrived by then. */
export function deliveryLate(snapshot: WarehouseSnapshot, delivery: Delivery): number {
  const truck = truckFor(snapshot, delivery.id), arrival = truck?.arrived ?? (delivery.received ? undefined : snapshot.time);
  if (!arrival) return 0;
  const late = minutesBetween(delivery.appointment, arrival);
  return late > RULES.graceMinutes ? late : 0;
}
/** Minutes a truck has waited in a yard stall. */
export const yardDwell = (snapshot: WarehouseSnapshot, truck: Truck) => truck.stall === undefined || truck.dropped ? 0 : minutesBetween(truck.arrived, snapshot.time);

export type LoadStatus = 'Departed' | 'Loaded' | 'Loading' | 'Staged' | 'Picking';
export function loadStatus(snapshot: WarehouseSnapshot, load: Load): LoadStatus {
  const dockId = loadDock(snapshot, load.id), atDoor = dockId && truckAt(snapshot, dockId);
  return load.loaded >= load.pallets ? 'Loaded' : atDoor ? 'Loading' : load.picked >= load.pallets ? 'Staged' : 'Picking';
}
/** Estimated minutes of work left: loading and picking at the site's planning rates. */
export const loadWorkLeft = (load: Load) => (load.pallets - load.loaded) * RULES.loadMinutesPerPallet + (load.pallets - load.picked) * RULES.pickMinutesPerPallet;
export const loadMinutesLeft = (snapshot: WarehouseSnapshot, load: Load) => minutesBetween(snapshot.time, load.departure);
/** A load is at risk when the estimated work left exceeds the time to departure. */
export const loadAtRisk = (snapshot: WarehouseSnapshot, load: Load) => load.loaded < load.pallets && loadWorkLeft(load) > loadMinutesLeft(snapshot, load);

/** Deterministic jitter in [-1, 1) for a location, so the same snapshot always fills the same bays. */
function jitter(aisle: AisleId, bay: number, side: Side): number {
  let value = [...`${aisle}${bay}${side}`].reduce((sum, char, i) => sum + char.charCodeAt(0) * (i + 7), 0);
  value = value * 16807 % 2147483647; value = value * 16807 % 2147483647;
  return value / 1073741823.5 - 1;
}
export const issueAt = (snapshot: WarehouseSnapshot, aisle: AisleId, bay: number, side: Side) => snapshot.issues.find(value => value.aisle === aisle && value.bay === bay && value.side === side);
/** Occupied pallet positions in one bay, 0–6. A damaged bay is unloaded. */
export function bayCount(snapshot: WarehouseSnapshot, aisle: AisleId, bay: number, side: Side): number {
  if (issueAt(snapshot, aisle, bay, side)?.kind === 'damaged') return 0;
  return Math.max(0, Math.min(BAY_POSITIONS, Math.round(BAY_POSITIONS * snapshot.aisles[aisle] + jitter(aisle, bay, side) * 1.6)));
}
export function aisleUsage(snapshot: WarehouseSnapshot, aisle: AisleId) {
  const { bays } = aisleOf(aisle);
  let used = 0;
  for (let bay = 0; bay < bays; bay++) for (const side of ['L', 'R'] as const) used += bayCount(snapshot, aisle, bay, side);
  return { used, capacity: bays * 2 * BAY_POSITIONS };
}
export const locationState = (issue?: LocationIssue): VisualState | undefined => issue ? issue.kind === 'damaged' ? 'critical' : 'warning' : undefined;

export function chilledState(snapshot: WarehouseSnapshot): VisualState {
  const t = snapshot.chilled.temperature;
  return t >= RULES.chilledCritical ? 'critical' : t >= RULES.chilledWarning ? 'warning' : 'normal';
}

/* ── Alerts and metrics ─────────────────────────────────────────────────── */

export interface WarehouseAlert { id: string; title: string; detail: string; severity: 'warning' | 'critical'; node: string; icon: 'clock' | 'thermometer' | 'wrench' | 'package' | 'alert' | 'zap' }
/** Every exception of a snapshot, most severe first. Each one names the scene node it belongs to. */
export function warehouseAlerts(snapshot: WarehouseSnapshot): WarehouseAlert[] {
  const alerts: WarehouseAlert[] = [];
  const temperature = snapshot.chilled.temperature, chilled = chilledState(snapshot);
  if (chilled !== 'normal') alerts.push({ id: 'chilled', title: `Chilled chamber at ${temperature.toFixed(1)} °C`, detail: snapshot.chilled.doorOpenMinutes ? `Door open for ${snapshot.chilled.doorOpenMinutes} min · setpoint ${snapshot.chilled.setpoint} °C` : `Setpoint ${snapshot.chilled.setpoint} °C`, severity: chilled === 'critical' ? 'critical' : 'warning', node: 'chilled:display', icon: 'thermometer' });
  for (const load of snapshot.loads.filter(value => loadAtRisk(snapshot, value))) {
    const dockId = loadDock(snapshot, load.id);
    alerts.push({ id: `load:${load.id}`, title: `${load.id} may miss ${load.departure}`, detail: `${load.route} · ${Math.round(loadWorkLeft(load))} min of work, ${loadMinutesLeft(snapshot, load)} min left`, severity: 'critical', node: dockId ? `dock:${dockId}` : 'area:outbound', icon: 'package' });
  }
  for (const value of snapshot.issues.filter(item => item.kind === 'damaged')) alerts.push({ id: `issue:${locationCode(value.aisle, value.bay, value.side)}`, title: `Rack damage at ${locationCode(value.aisle, value.bay, value.side)}`, detail: 'Bay blocked until inspected', severity: 'critical', node: `rack:${value.aisle}:${value.bay}:${value.side}`, icon: 'wrench' });
  for (const value of snapshot.fleet.filter(item => item.status === 'fault')) alerts.push({ id: `mhe:${value.id}`, title: `${value.id} out of service`, detail: value.note ?? 'Tagged out', severity: 'critical', node: `mhe:${value.id}`, icon: 'wrench' });
  for (const state of snapshot.docks.filter(item => item.status === 'out-of-service')) alerts.push({ id: `dock:${state.id}`, title: `Door ${state.id} out of service`, detail: state.note ?? 'Not available for appointments', severity: 'warning', node: `dock:${state.id}`, icon: 'wrench' });
  for (const delivery of snapshot.deliveries) {
    const late = deliveryLate(snapshot, delivery), truck = truckFor(snapshot, delivery.id);
    if (late) alerts.push({ id: `late:${delivery.id}`, title: `${delivery.id} ${truck ? 'arrived' : 'is'} ${late} min late`, detail: `${delivery.supplier} · slot ${delivery.appointment}`, severity: 'warning', node: truck ? `truck:${truck.id}` : 'pin:yard', icon: 'clock' });
  }
  for (const truck of snapshot.trucks.filter(item => yardDwell(snapshot, item) > RULES.yardDwellMinutes)) alerts.push({ id: `dwell:${truck.id}`, title: `${truck.id} waiting ${yardDwell(snapshot, truck)} min`, detail: `Stall ${truck.stall! + 1} · limit ${RULES.yardDwellMinutes} min`, severity: 'warning', node: `truck:${truck.id}`, icon: 'clock' });
  const backlog = putawayBacklog(snapshot);
  if (backlog > RULES.putawayBacklog) alerts.push({ id: 'putaway', title: `${backlog} pallets waiting for putaway`, detail: `More than ${RULES.putawayBacklog} pallets in the receiving lanes`, severity: 'warning', node: 'pin:inbound', icon: 'package' });
  for (const value of snapshot.fleet.filter(item => item.status === 'working' && item.battery < RULES.lowBattery)) alerts.push({ id: `battery:${value.id}`, title: `${value.id} battery ${value.battery} %`, detail: 'Swap or charge after the current task', severity: 'warning', node: `mhe:${value.id}`, icon: 'zap' });
  for (const value of snapshot.issues.filter(item => item.kind === 'count')) alerts.push({ id: `issue:${locationCode(value.aisle, value.bay, value.side)}`, title: `Count difference at ${locationCode(value.aisle, value.bay, value.side)}`, detail: value.note, severity: 'warning', node: `rack:${value.aisle}:${value.bay}:${value.side}`, icon: 'alert' });
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}

export const putawayBacklog = (snapshot: WarehouseSnapshot) => DOCKS.filter(value => value.side === 'inbound').reduce((sum, value) => sum + stagedPallets(snapshot, value.id), 0);
export function warehouseMetrics(snapshot: WarehouseSnapshot) {
  const occupied = snapshot.docks.filter(value => value.status !== 'free' && value.status !== 'out-of-service').length;
  const waiting = snapshot.trucks.filter(value => value.stall !== undefined && !value.dropped).length, late = snapshot.deliveries.filter(value => deliveryLate(snapshot, value)).length;
  const storage = AISLES.reduce((sum, value) => { const usage = aisleUsage(snapshot, value.id); return { used: sum.used + usage.used, capacity: sum.capacity + usage.capacity }; }, { used: 0, capacity: 0 });
  const open = snapshot.loads.filter(value => value.loaded < value.pallets);
  return {
    occupied, doors: DOCKS.length, waiting, late, backlog: putawayBacklog(snapshot), received: snapshot.deliveries.reduce((sum, value) => sum + value.received, 0), expected: snapshot.deliveries.reduce((sum, value) => sum + value.pallets, 0),
    used: storage.used, capacity: storage.capacity, utilisation: Math.round(storage.used / storage.capacity * 100),
    blocked: snapshot.issues.filter(value => value.kind === 'damaged').length, replenish: snapshot.issues.filter(value => value.kind === 'replenish').length,
    loads: snapshot.loads.length, open: open.length, atRisk: open.filter(value => loadAtRisk(snapshot, value)).length, loaded: snapshot.loads.filter(value => value.loaded >= value.pallets).length,
    shorts: snapshot.loads.reduce((sum, value) => sum + value.shorts, 0), alerts: warehouseAlerts(snapshot).length,
    crew: Object.values(snapshot.crew).reduce((sum, value) => sum + (value ?? 0), 0),
  };
}

/** Status of an area for its pin: critical and warning come from the alerts that point into it. */
export function areaState(snapshot: WarehouseSnapshot, id: AreaId): VisualState {
  const alerts = warehouseAlerts(snapshot).filter(alert => alertArea(snapshot, alert) === id);
  if (alerts.some(alert => alert.severity === 'critical')) return 'critical';
  if (alerts.length || (id === 'reserve' && snapshot.issues.some(value => value.kind === 'replenish' && aisleOf(value.aisle).zone === 'reserve'))) return 'warning';
  if (id === 'each-pick' && snapshot.loads.reduce((sum, value) => sum + value.shorts, 0) > RULES.shortsWarning) return 'warning';
  return id !== 'yard' && !snapshot.crew[id] && !['hazmat', 'bulk', 'charging', 'chilled'].includes(id) ? 'inactive' : 'normal';
}
/** The area an alert's node belongs to. */
export function alertArea(snapshot: WarehouseSnapshot, alert: WarehouseAlert): AreaId {
  const [kind, id] = alert.node.split(':');
  if (kind === 'chilled') return 'chilled';
  if (kind === 'truck') return 'yard';
  if (kind === 'pin' || kind === 'area') return id as AreaId;
  if (kind === 'rack') return aisleOf(id as AisleId).zone === 'chilled' ? 'chilled' : 'reserve';
  if (kind === 'dock') return dockOf(id as DockId).side;
  if (kind === 'mhe') { const value = snapshot.fleet.find(item => item.id === id)!; return value.status === 'fault' ? 'charging' : value.area; }
  return 'yard';
}
