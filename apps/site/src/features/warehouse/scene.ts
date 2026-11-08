import { createSceneStore, personHairColor, type AssetNode, type MarkerNode, type MotionProfile, type NodeRoute, type RouteStop, type SceneNode, type SceneStore, type Vec3 } from '@opsorama/core';
import { TRUCK, assetMotionProfiles } from '@opsorama/objects';
import {
  AISLES, AREAS, DOCKS, LANE_CAPACITY, SCENARIOS, STALLS,
  areaState, aisleOf, bayCount, chilledState, dockOf, dockState, issueAt, locationCode, locationState, stagedPallets, truckAt, warehouseAlerts,
  type AisleId, type AreaId, type DockId, type Side, type Truck, type Vehicle, type WarehouseScenario, type WarehouseSnapshot,
} from './model';

/**
 * Ground plan in metres: x runs west → east, z runs from the back wall (−34) to the dock front (+12) and on to
 * the road. The hall stands on a dock-height slab, so a docked truck's cargo floor is level with the hall floor.
 */
export const SLAB = TRUCK.floorTop;
/** Top of the area zones on the slab: fixtures and people inside the hall stand on it. */
export const FLOOR_Y = SLAB + .095;
export const HALL = Object.freeze({ west: -48, east: 48, front: 12, back: -34 });
const p = (x: number, z: number, y = FLOOR_Y): Vec3 => [x, y, z];
const g = (x: number, z: number): Vec3 => [x, 0, z];
const yaw = (value: number): Vec3 => [0, value, 0];
const HALF = Math.PI / 2, BACK = Math.PI;
const fixture = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });
const selectable = (id: string, entityId: string, asset: string, position: Vec3, label: string, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, entityId, kind: 'asset', asset, position, label, labelMode: 'active', selectable: true, ...extra });
const text = (value: string, background: string, color = '#ffffff') => ({ kind: 'text' as const, text: value, color, background });

const STAFF = '#e59a32', OFFICE = '#5d6fae', SECURITY = '#36455f';
/** A person in a hi-vis vest; every other one uses the feminine figure. */
const person = (id: string, position: Vec3, heading: number, variant: string, index: number, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, kind: 'asset', asset: 'worker', variant, color: STAFF, position, rotation: yaw(heading), selectable: false, materials: { hair: personHairColor(id) }, ...(index % 2 ? { person: { figure: 'feminine' as const } } : {}), ...extra });
/** Deterministic jitter in [0, 1) so a snapshot always draws the same loads. */
const hash = (value: string) => { let h = 7; for (const char of value) h = (h * 31 + char.charCodeAt(0)) % 2147483647; return (h * 16807 % 2147483647) / 2147483647; };

/* ── Fixed layout ───────────────────────────────────────────────────────── */

/** Dock leveler line: the dock models stand on the slab edge and trucks back up to it. */
const DOCK_Z = 11.4, DOCK_EDGE_Z = HALL.front + .1;
export const TRUCK_AT_DOCK_Z = DOCK_EDGE_Z + TRUCK.length / 2;
/** Each dock lane holds two columns of five pallets, turned so forklifts serve them along z. */
const LANE_ROWS = [9.9, 8.6, 7.3, 6, 4.7] as const, LANE_COLUMNS = [-.65, .65] as const;
export const laneSpot = (dock: DockId, index: number): Vec3 => p(dockOf(dock).x + LANE_COLUMNS[index % 2], LANE_ROWS[Math.floor(index / 2)]);
/** Yard stalls where trucks wait nose out, and the container drop area. */
export const stallSpot = (stall: number): Vec3 => g(-44 + stall * 4.5, 37.5);

/** Reserve aisle k: a rack row facing +x, the aisle, and a rack row facing −x. Bays run back from the cross aisle. */
const RESERVE_X0 = -27, MODULE = 5.6, BAY_PITCH = 2.8, FIRST_BAY_Z = -2.4;
const CHILLED_X0 = [-45.75, -40.35] as const;
export function aislePlace(id: AisleId) {
  const index = AISLES.findIndex(value => value.id === id), chilled = aisleOf(id).zone === 'chilled';
  const left = chilled ? CHILLED_X0[index - 7] : RESERVE_X0 + MODULE * index;
  return { left, center: left + 2.15, right: left + 4.3, back: FIRST_BAY_Z - BAY_PITCH * (aisleOf(id).bays - 1) - 1.4 };
}
/** The rack bay of a location, with its heading toward the aisle. */
export function bayPlace(aisle: AisleId, bay: number, side: Side): { position: Vec3; heading: number } {
  const place = aislePlace(aisle);
  return { position: p(side === 'L' ? place.left : place.right, FIRST_BAY_Z - BAY_PITCH * bay), heading: side === 'L' ? HALF : -HALF };
}

/** Each picking: two rows of carton flow racks and three rows of shelving between pick aisles. */
const FLOW_ROWS = [{ z: -3.2, heading: 0 }, { z: -6.9, heading: BACK }] as const, FLOW_X = Array.from({ length: 8 }, (_, i) => 15.5 + i * 2.1);
const SHELF_ROWS = [{ z: -10.3, heading: 0 }, { z: -11.45, heading: BACK }, { z: -14.9, heading: 0 }] as const, SHELF_X = Array.from({ length: 5 }, (_, i) => 15.7 + i * 3.15);
/** Two rows of put walls face the robot lanes; the conveyor runs to the pack benches and turns toward dispatch. */
const PUT_WALL_X = [34, 36.3, 38.6, 40.9] as const, PUT_WALL_Z = [-5.2, -11.8] as const;
const BELT_Z = -18.5, BELT_X = Array.from({ length: 7 }, (_, i) => 17.4 + i * 4), RISER_X = 44.4, RISER_Z = [-15.5, -11.5, -7.5, -3.5] as const;
export const PACK_X = Array.from({ length: 7 }, (_, i) => 17.5 + i * 3.6);
const PACK_Z = -21;
const CHARGER_X = Array.from({ length: 6 }, (_, i) => 5.2 + i * 1.6), SERVICE_SPOTS = [p(8.6, 5.4), p(11.9, 5.4)] as const;
const AMR_PADS = Array.from({ length: 6 }, (_, i) => p(46.6, -15.5 + i * 1.2));
const CAGE_Z = Array.from({ length: 6 }, (_, i) => -.9 - i * .8);
/** Free floor spots for the area status pins. */
const AREA_PINS: Readonly<Record<AreaId, Vec3>> = {
  yard: g(-6, 31), inbound: p(-29.7, 5.5), returns: p(-9, 5.2), office: p(-2.8, 5.2), charging: p(6, 7.2), outbound: p(32, 5.4),
  chilled: p(-33, -8), hazmat: p(-43.5, -28), bulk: p(-34.5, -28.5), reserve: p(-25, -31.6), 'each-pick': p(22.7, -5), sortation: p(36.5, -8.6), packing: p(33.5, -26.5),
};
const CARRIER_COLOR: Readonly<Record<string, string>> = { 'Own fleet': '#2f6f8f', 'Norvale Haulage': '#8a5a9e', 'Tamberlin Freight': '#c46b3b', 'Quillon Transport': '#3f8a6d', 'Fernhill Dairy': '#4a8fc4', Swiftpost: '#d9a62e' };

const solidWall = (id: string, position: Vec3, length: number, height: number, heading: number, color: string) =>
  fixture(id, 'wall-segment', position, { variant: 'solid', color, rotation: yaw(heading), scale: [length / 4, height / 2.65, 1] });
const fence = (id: string, from: readonly [number, number], to: readonly [number, number], skip: (x: number, z: number) => boolean = () => false): AssetNode[] => {
  const count = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 3), heading = Math.atan2(-(to[1] - from[1]), to[0] - from[0]), nodes: AssetNode[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count, x = from[0] + (to[0] - from[0]) * t, z = from[1] + (to[1] - from[1]) * t;
    if (!skip(x, z)) nodes.push(fixture(`${id}:${i}`, 'fence-segment', g(x, z), { rotation: yaw(heading) }));
  }
  return nodes;
};

/** Ground, yard, hall shell, racking frames and fixtures that do not depend on the snapshot. */
export const warehouseBase: readonly SceneNode[] = [
  // The first ground piece holds the point the overview camera targets.
  { id: 'ground', kind: 'ground', size: [132, 98], position: [0, 0, 7], color: '#d3ddcc' },
  fixture('yard', 'terrain', g(0, 29.55), { variant: 'asphalt', footprint: [100, 34.9] }),
  fixture('gate-apron', 'terrain', g(37, 48), { variant: 'asphalt', footprint: [12, 2] }),
  fixture('sidewalk-west', 'sidewalk', g(-17.5, 48), { footprint: [97, 2] }), fixture('sidewalk-east', 'sidewalk', g(54.5, 48), { footprint: [23, 2] }),
  ...Array.from({ length: 22 }, (_, i) => fixture(`road-${i}`, 'road', g(-63 + i * 6, 52), { variant: i === 16 ? 'crosswalk' : 'straight' })),
  fixture('car-park', 'terrain', g(-57, 22), { variant: 'parking', footprint: [14, 30] }),
  fixture('office-path', 'terrain', g(-57, 2), { variant: 'pavers', footprint: [4, 10] }),
  fixture('service-strip', 'terrain', g(56, -12), { variant: 'gravel', footprint: [12, 44] }),

  // The hall: a dock-height slab with a concrete plinth, a floor, and back and side walls; the dock front stays open.
  fixture('hall-floor', 'floor', [0, SLAB, -11], { variant: 'concrete', footprint: [96, 46], interior: true }),
  solidWall('plinth-front', g(0, HALL.front - .095), 96, SLAB, 0, '#b4bcc4'), solidWall('plinth-back', g(0, HALL.back + .095), 96, SLAB, 0, '#b4bcc4'),
  solidWall('plinth-west', g(HALL.west + .095, -11), 46, SLAB, HALF, '#b4bcc4'), solidWall('plinth-east', g(HALL.east - .095, -11), 46, SLAB, HALF, '#b4bcc4'),
  solidWall('wall-back', [0, SLAB, HALL.back + .095], 96, 4.2, 0, '#dfe5ea'),
  solidWall('wall-west', [HALL.west + .095, SLAB, -11], 46, 4.2, HALF, '#dfe5ea'), solidWall('wall-east', [HALL.east - .095, SLAB, -11], 46, 4.2, HALF, '#dfe5ea'),

  // Chilled chamber: insulated side and back walls, a low front wall cut away for the view and a door gap at x −34…−32.
  solidWall('chilled-front-0', p(-41, 0, SLAB), 14, 1.1, 0, '#e8f2f6'), solidWall('chilled-front-1', p(-31, 0, SLAB), 2, 1.1, 0, '#e8f2f6'),
  solidWall('chilled-east', [-30, SLAB, -9], 18, 4.2, HALF, '#e8f2f6'), solidWall('chilled-back', [-39, SLAB, -18], 18, 4.2, 0, '#e8f2f6'),

  // Hazardous goods cage: welded mesh on the open sides with a gate, IBCs and drums inside.
  ...fence('hazmat-fence-north', [-48, -21], [-39, -21]).map((node, i) => i === 1 ? { ...node, variant: 'gate' } : node).map(node => ({ ...node, position: [node.position![0], FLOOR_Y, node.position![2]] as Vec3 })),
  ...fence('hazmat-fence-east', [-39, -21], [-39, -33]).map(node => ({ ...node, position: [node.position![0], FLOOR_Y, node.position![2]] as Vec3 })),
  ...[-46.6, -45.2, -43.8, -42.4].flatMap((x, i) => [fixture(`ibc-${i}`, 'ibc-tank', p(x, -24.2)), fixture(`ibc-${i + 4}`, 'ibc-tank', p(x, -25.6))]),
  ...[-46.6, -45.2, -43.8].flatMap((x, i) => [fixture(`drums-${i}`, 'drum-pallet', p(x, -30.2), { count: 4 }), fixture(`drums-${i + 3}`, 'drum-pallet', p(x, -31.6), { count: 4 - (i % 2) })]),
  fixture('hazmat-sign', 'sign', p(-41, -20.4), { surfaceLabel: text('HAZARDOUS GOODS', '#c0392b') }),

  // Bulk floor: block-stacked fast movers two high and the empty pallet store.
  ...[-37.6, -36.2, -34.8, -33.4, -32].flatMap((x, i) => [-23.2, -24.6].flatMap((z, j) => [
    fixture(`bulk-${i}-${j}`, 'pallet', p(x, z), { count: 27, rotation: yaw(HALF) }),
    ...((i + j) % 3 === 0 ? [fixture(`bulk-${i}-${j}-top`, 'pallet', p(x, z, FLOOR_Y + .562), { count: 18, rotation: yaw(HALF) })] : []),
  ])),
  ...[-37.4, -35.9, -34.4, -32.9, -31.4].map((x, i) => fixture(`empty-pallets-${i}`, 'pallet-stack', p(x, -31.6), { count: 12 - (i % 3) * 2, rotation: yaw(HALF) })),

  // Reserve: an aisle sign and end-of-aisle guard rails on every rack row.
  ...AISLES.filter(value => value.zone === 'reserve').flatMap(value => { const place = aislePlace(value.id); return [fixture(`rail-${value.id}-L`, 'safety-barrier', p(place.left, -.7), { scale: [.5, 1, 1] }), fixture(`rail-${value.id}-R`, 'safety-barrier', p(place.right, -.7), { scale: [.5, 1, 1] })]; }),

  // Each picking and sortation fixtures; their counts follow the snapshot below.
  ...BELT_X.map((x, i) => fixture(`belt-${i}`, 'conveyor', p(x, BELT_Z), { rotation: yaw(HALF) })),
  fixture('belt-curve', 'conveyor', p(RISER_X - .25, BELT_Z + .25), { variant: 'curve', rotation: yaw(HALF) }),
  ...RISER_Z.map((z, i) => fixture(`riser-${i}`, 'conveyor', p(RISER_X, z))),
  ...PACK_X.map((x, i) => fixture(`pack-supply-${i}`, 'packaging-supply', p(x - 1, PACK_Z - 1.9), { count: 4 + (i % 3) * 2 })),
  ...[18, 22, 26, 30].map((x, i) => fixture(`vas-${i}`, 'station', p(x, -27.5), { variant: 'packing' })),
  ...[17.6, 20.8, 24, 27.2].map((x, i) => fixture(`consumables-${i}`, 'shelf', p(x, -32.9), { count: 12 - i * 2 })),
  ...[35, 36.4, 37.8].map((x, i) => fixture(`packaging-pallet-${i}`, 'pallet', p(x, -32.6), { count: 18 + i * 3 })),
  fixture('high-value-sign', 'sign', p(44.2, -24.6), { surfaceLabel: text('HIGH VALUE', '#7a4fa0') }),
  ...[0, 1].map(i => fixture(`chilled-pallet-${i}`, 'pallet', p(-32.6, -4 - i * 1.4), { count: 18, rotation: yaw(HALF) })),

  // Charging and service: chargers on the front wall and a service bench.
  ...CHARGER_X.map((x, i) => fixture(`charger-${i}`, 'ev-charger', p(x, 11.3), { rotation: yaw(BACK) })),
  fixture('service-bench', 'station', p(5.1, 5.5), { rotation: yaw(HALF) }),
  fixture('service-cabinet', 'equipment-cabinet', p(13.4, 5), { rotation: yaw(-HALF), count: 4 }),

  // Dock office and returns furniture.
  fixture('office-desks', 'desk-pod', p(0, 8.4), { count: 4 }),
  fixture('returns-roll-cage-0', 'roll-cage', p(-13.2, 5), { count: 7 }), fixture('returns-roll-cage-1', 'roll-cage', p(-12.3, 5), { count: 3 }),
  fixture('receiving-desk', 'station', p(-15.2, 8.2), { variant: 'inspection', rotation: yaw(-HALF) }),

  // Outside: gatehouse, office and welfare block, sprinkler tank, waste point, lights and trees.
  fixture('gatehouse', 'building', g(37, 43.4), { building: { type: 'office', size: [3, 3.2, 3] } }),
  fixture('office-block', 'building', g(-57, -15), { building: { type: 'office', size: [14, 7.5, 18] } }),
  fixture('sprinkler-tank', 'storage-tank', g(56, -29)), fixture('sprinkler-pump', 'pump-unit', g(56, -23.4)),
  fixture('sprinkler-sign', 'sign', g(52.8, -23.4), { surfaceLabel: text('SPRINKLER TANK', '#b03a2e') }),
  ...[0, 1, 2, 3].map(i => fixture(`waste-${i}`, 'waste-bin', g(52.2 + i * 1.3, -6), { variant: i < 2 ? 'recycling' : 'general' })),
  ...[0, 1].map(i => fixture(`waste-bales-${i}`, 'bulk-bag', g(52.6 + i * 1.3, -3.8))),
  ...[0, 1].map(i => fixture(`staff-charger-${i}`, 'ev-charger', g(-50.6, 10 + i * 2.4), { rotation: yaw(-HALF) })),
  fixture('bike', 'cargo-bike', g(-51, 3.4), { rotation: yaw(HALF) }),
  ...[-45, -25, -5, 15, 25, 47].map((x, i) => fixture(`lamp-${i}`, 'lamp-post', g(x, 45.6), { rotation: yaw(BACK) })),
  ...[-30, -10, 10, 30].map((z, i) => fixture(`lamp-east-${i}`, 'lamp-post', g(49.6, z), { rotation: yaw(HALF) })),
  fixture('camera-yard-west', 'security-camera', g(-49, 44.8), { variant: 'pole', rotation: yaw(BACK + .6) }), fixture('camera-yard-east', 'security-camera', g(48.8, 44.8), { variant: 'pole', rotation: yaw(BACK - .6) }),
  fixture('camera-gate', 'security-camera', g(43.4, 45.6), { variant: 'pole', rotation: yaw(BACK) }),
  ...[[-63, -39], [-56, -39], [-49, -39], [-63, -30], [-63, 32], [-63, 40], [61, -39], [61, 14], [61, 26], [61, 38]].map(([x, z], i) => fixture(`tree-${i}`, i % 2 ? 'tree' : 'tree-pine', g(x, z))),
  ...fence('fence-front-west', [-66, 46.8], [31, 46.8]), ...fence('fence-front-east', [43, 46.8], [64, 46.8]),
  ...fence('fence-west', [-66, -42], [-66, 45]), ...fence('fence-east', [64, -42], [64, 45]), ...fence('fence-back', [-66, -42], [64, -42]),
];

/* ── Motion ─────────────────────────────────────────────────────────────── */

/** Kinematics of a catalog agent without its speed: the route sets the speed. */
const profileOf = (asset: string): MotionProfile => { const profile: MotionProfile & { speed?: number } = { ...assetMotionProfiles[asset] }; delete profile.speed; return profile; };
const loop = (points: readonly Vec3[], asset: string, speed: number, elapsed = 0, stops: readonly RouteStop[] = []): NodeRoute =>
  ({ points: [...points, points[0]], speed, loop: true, elapsed, profile: profileOf(asset), ...(stops.length ? { stops } : {}) });

/** Forklifts circle the cross aisle between the dock lanes and the aisle mouths, one loop per dock side. */
const FORKLIFT_LOOPS: Readonly<Record<'inbound' | 'outbound', readonly Vec3[]>> = {
  inbound: [p(-44, 3), p(-15, 3), p(-15, 1.6), p(-44, 1.6)],
  outbound: [p(17, 3), p(46, 3), p(46, 1.6), p(17, 1.6)],
};
/** A reach truck works down its aisle, stops at a bay facing the rack, and returns through the neighbouring aisle. */
export function reachLoop(aisle: AisleId): Vec3[] {
  const chilled = aisleOf(aisle).zone === 'chilled', ids = AISLES.filter(value => value.zone === (chilled ? 'chilled' : 'reserve')).map(value => value.id);
  const index = ids.indexOf(aisle), other = ids[index + 1] ?? ids[index - 1], a = aislePlace(aisle), b = aislePlace(other), front = chilled ? -.5 : .3, back = a.back - 1.1;
  return [p(a.center, front), p(a.center, (front + back) / 2), p(a.center, back), p(b.center, back), p(b.center, front)];
}
/** Robots loop past both put-wall rows and the induct beside the conveyor. */
export const AMR_LOOP: readonly Vec3[] = [p(42.6, -14.8), p(42.6, -7), p(32.6, -7), p(32.6, -14.8)];
/** Pickers push carts through the pick aisles; the third one drops totes at the conveyor induct. */
const PICKER_LOOPS: readonly (readonly Vec3[])[] = [
  [p(13.4, -1.6), p(31.6, -1.6), p(31.6, -8.6), p(13.4, -8.6)],
  [p(13.4, -8.6), p(31.6, -8.6), p(31.6, -13.2), p(13.4, -13.2)],
  [p(13.4, -13.2), p(31.6, -13.2), p(31.6, -16.4), p(15.8, -16.4), p(13.4, -16.4)],
];
/** A truck arrives through the in-gate, crosses the yard in front of the docks and leaves through the out-gate. */
export const YARD_TRUCK_ROUTE: readonly Vec3[] = [g(62, 53.5), g(34, 53.5), g(34, 30), g(-40, 30), g(-40, 26.5), g(40, 26.5), g(40, 50.5), g(62, 50.5)];

/* ── Snapshot-dependent nodes ───────────────────────────────────────────── */

const truckLabel = (truck: Truck) => `${truck.id} · ${truck.carrier}${truck.stall !== undefined ? ` · stall ${truck.stall + 1}` : ''}`;
function truckNode(truck: Truck): AssetNode {
  const color = CARRIER_COLOR[truck.carrier] ?? '#5f7488', position = truck.dock ? g(dockOf(truck.dock).x, TRUCK_AT_DOCK_Z) : stallSpot(truck.stall ?? 0);
  return selectable(`truck:${truck.id}`, truck.id, 'truck', position, truckLabel(truck), { color, surfaceLabel: text(truck.carrier.toUpperCase(), color) });
}

/** Where a parked vehicle stands: charging and idle trucks on the chargers, tagged-out trucks in the service bay, idle robots on their pads. */
function parkedSpots(fleet: readonly Vehicle[]): Map<string, { position: Vec3; heading: number }> {
  const spots = new Map<string, { position: Vec3; heading: number }>();
  let charger = 0, service = 0, pad = 0;
  for (const value of fleet) {
    if (value.status === 'working') continue;
    if (value.kind === 'amr') spots.set(value.id, { position: AMR_PADS[pad++ % AMR_PADS.length], heading: HALF });
    else if (value.status === 'fault') spots.set(value.id, { position: SERVICE_SPOTS[service++ % SERVICE_SPOTS.length], heading: -HALF });
    else spots.set(value.id, { position: p(CHARGER_X[charger++ % CHARGER_X.length], 9.6), heading: 0 });
  }
  return spots;
}
const VEHICLE_ASSET = { forklift: 'forklift', 'reach-truck': 'reach-truck', amr: 'mobile-robot' } as const;
const vehicleLabel = (value: Vehicle) => `${value.id} · ${value.status === 'working' ? value.aisle ?? value.area : value.status} · ${value.battery} %`;
/** Height of a marker above a vehicle's origin. */
const VEHICLE_TOP: Readonly<Record<Vehicle['kind'], number>> = { forklift: 2.8, 'reach-truck': 4.9, amr: 1 };

function fleetNodes(snapshot: WarehouseSnapshot): SceneNode[] {
  const nodes: SceneNode[] = [], spots = parkedSpots(snapshot.fleet), turns = { inbound: 0, outbound: 0 } as Record<'inbound' | 'outbound', number>, aisles = new Map<string, number>();
  let robot = 0;
  for (const value of snapshot.fleet) {
    const id = `mhe:${value.id}`, asset = VEHICLE_ASSET[value.kind], label = vehicleLabel(value);
    if (value.status !== 'working') {
      const spot = spots.get(value.id)!;
      nodes.push(selectable(id, value.id, asset, spot.position, label, { rotation: yaw(spot.heading), ...(value.kind === 'amr' ? { variant: 'deck', state: value.status === 'charging' ? 'inactive' : undefined } : {}) }));
      continue;
    }
    if (value.kind === 'amr') {
      const route = loop(AMR_LOOP, 'mobile-robot', 1.2, robot++ * 6.5);
      nodes.push({ ...selectable(id, value.id, asset, route.points[0], label, { variant: 'tote', state: 'busy' }), route });
    } else if (value.kind === 'forklift') {
      const side = value.area === 'inbound' ? 'inbound' : 'outbound', route = loop(FORKLIFT_LOOPS[side], 'forklift', 2.2, turns[side]++ * 14);
      nodes.push({ ...selectable(id, value.id, asset, route.points[0], label, { variant: 'operated' }), route });
      nodes.push(fixture(`${id}:load`, 'pallet', [0, 0, 0], { count: 18, rotation: yaw(HALF), attachment: { nodeId: id, anchor: 'load' } }));
    } else {
      const aisle = value.aisle ?? 'A01', points = reachLoop(aisle), n = aisles.get(aisle) ?? 0, side = hash(`${value.id}${snapshot.scenario}`) < .5 ? -HALF : HALF;
      aisles.set(aisle, n + 1);
      const route = loop(points, 'reach-truck', 1.6, n * 20, [{ index: 1, seconds: 6, yaw: side }]);
      nodes.push({ ...selectable(id, value.id, asset, route.points[0], label, { variant: 'operated' }), route });
      if (hash(value.id + snapshot.time) < .7) nodes.push(fixture(`${id}:load`, 'pallet', [0, 0, 0], { count: 18, rotation: yaw(HALF), attachment: { nodeId: id, anchor: 'load' } }));
    }
  }
  return nodes;
}

/** Scene marker for each alert that points at a model, placed above it. Pins carry the other alerts. */
function alertMarkers(snapshot: WarehouseSnapshot, nodes: readonly SceneNode[]): MarkerNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  return warehouseAlerts(snapshot).flatMap((alert): MarkerNode[] => {
    const target = byId.get(alert.node);
    if (!target || target.kind !== 'asset' || alert.node.startsWith('pin:')) return [];
    const base = { id: `alert:${alert.id}`, entityId: alert.id, kind: 'marker' as const, state: alert.severity, icon: alert.icon, eyebrow: alert.severity === 'critical' ? 'Critical' : 'Warning', label: alert.title, detail: alert.detail, selectable: true, markerSize: 'small' as const };
    if (alert.node.startsWith('mhe:')) {
      const vehicle = snapshot.fleet.find(value => `mhe:${value.id}` === alert.node)!;
      return [{ ...base, attachment: { nodeId: alert.node }, position: [0, VEHICLE_TOP[vehicle.kind], 0] }];
    }
    const [x, y, z] = target.position ?? [0, 0, 0], above = target.asset === 'truck' ? 4.4 : target.asset === 'pallet-rack' ? 4.9 : target.asset === 'loading-dock' ? 3.8 : 2.4;
    return [{ ...base, position: [x, y + above, z] }];
  });
}

export function warehouseNodes(snapshot: WarehouseSnapshot): SceneNode[] {
  const nodes: SceneNode[] = [...warehouseBase];

  // Areas: a zone per area inside the hall and a status pin named after it.
  for (const area of AREAS) {
    const state = areaState(snapshot, area.id);
    if (area.rect) { const [x0, x1, z0, z1] = area.rect; nodes.push({ id: `area:${area.id}`, entityId: area.id, kind: 'zone', size: [x1 - x0, z1 - z0], position: [(x0 + x1) / 2, SLAB, (z0 + z1) / 2], color: area.color, selectable: true, interior: true }); }
    nodes.push({ id: `pin:${area.id}`, entityId: area.id, kind: 'asset', asset: 'map-pin', position: AREA_PINS[area.id], color: '#2f6f8f', ...(state === 'normal' ? {} : { state }), label: area.short, labelMode: 'always', selectable: true });
  }

  // Docks, their lanes and the trucks at the doors and in the yard stalls.
  for (const value of DOCKS) {
    const state = dockState(snapshot, value.id), truck = truckAt(snapshot, value.id), open = state.status === 'unloading' || state.status === 'loading';
    const refLabel = state.ref ? ` · ${state.ref}` : '';
    nodes.push(selectable(`dock:${value.id}`, value.id, 'loading-dock', p(value.x, DOCK_Z, SLAB), `${value.id}${refLabel} · ${state.status.replace(/-/g, ' ')}`, {
      variant: open ? 'open' : 'closed', state: state.status === 'out-of-service' ? 'warning' : open ? 'busy' : undefined,
    }));
    const staged = Math.min(LANE_CAPACITY, stagedPallets(snapshot, value.id)), outbound = value.side === 'outbound';
    for (let i = 0; i < staged; i++) nodes.push(fixture(`lane:${value.id}:${i}`, 'pallet', laneSpot(value.id, i), { count: outbound ? 18 : 9 + 9 * Math.round(hash(`${value.id}${i}`)), rotation: yaw(HALF) }));
    if (truck) {
      nodes.push(truckNode(truck));
      // A dock hand works the lane while a truck is unloaded or loaded.
      if (open) nodes.push(person(`dockhand:${value.id}`, p(value.x + (outbound ? -1.7 : 1.7), 10.4), BACK, 'working', DOCKS.indexOf(value)));
    }
  }
  for (const truck of snapshot.trucks.filter(value => value.stall !== undefined && value.stall < STALLS)) nodes.push(truckNode(truck));
  [[6, 38], [10, 38], [14, 38]].forEach(([x, z], i) => nodes.push(fixture(`container-${i}`, 'shipping-container', g(x, z), { color: ['#b5523b', '#3f6f8f', '#6a8a3f'][i] })));
  const traffic = snapshot.scenario !== 'night';
  nodes.push(fixture('gate-in', 'gate', g(34, 46.6), { variant: traffic ? 'open' : 'closed' }), fixture('gate-out', 'gate', g(40, 46.6), { variant: traffic ? 'open' : 'closed', rotation: yaw(BACK) }));
  if (traffic) { const route = loop(YARD_TRUCK_ROUTE, 'truck', 5); nodes.push({ ...fixture('truck:arriving', 'truck', route.points[0], { color: '#5f7488' }), route }); }
  if (snapshot.crew.yard) nodes.push(person('security', g(37, 45.4), 0, 'idle', 0, { asset: 'security-guard', color: SECURITY, label: 'Gatehouse', labelMode: 'active' }));

  // Reserve and chilled racking: one node per bay with its exact pallet count.
  for (const aisle of AISLES) {
    const place = aislePlace(aisle.id);
    nodes.push(selectable(`aisle:${aisle.id}`, aisle.id, 'sign', p(aisle.zone === 'chilled' ? place.center : place.left, aisle.zone === 'chilled' ? -.4 : -.15), aisle.label, { surfaceLabel: text(aisle.id, aisle.zone === 'chilled' ? '#2b7a99' : '#41566b') }));
    for (let bay = 0; bay < aisle.bays; bay++) for (const side of ['L', 'R'] as const) {
      const issue = issueAt(snapshot, aisle.id, bay, side), count = bayCount(snapshot, aisle.id, bay, side), { position, heading } = bayPlace(aisle.id, bay, side);
      nodes.push(selectable(`rack:${aisle.id}:${bay}:${side}`, locationCode(aisle.id, bay, side), 'pallet-rack', position, `${locationCode(aisle.id, bay, side)} · ${count}/6`, {
        rotation: yaw(heading), count, state: locationState(issue), ...(aisle.zone === 'chilled' ? { color: '#4f9cbc' } : {}),
      }));
    }
  }

  // Chilled chamber: a door display with the reading and a beacon beside the door.
  const chilled = chilledState(snapshot);
  nodes.push(selectable('chilled:display', 'chilled', 'led-display', p(-31, .9), `Chilled chamber · ${snapshot.chilled.temperature.toFixed(1)} °C`, { variant: 'standing', display: { kind: 'number', value: snapshot.chilled.temperature, decimals: 1 }, state: chilled === 'normal' ? undefined : chilled }));
  nodes.push(fixture('chilled:beacon', 'status-beacon', p(-34.6, .6), { state: chilled }));

  // Each picking: flow racks and shelves empty through the day and fill again at night.
  const progress = snapshot.picking.linesPicked / snapshot.picking.linesPlanned, fill = snapshot.scenario === 'night' ? .95 : .92 - .45 * progress;
  FLOW_ROWS.forEach((row, r) => FLOW_X.forEach((x, i) => nodes.push(fixture(`flow:${r}:${i}`, 'carton-flow-rack', p(x, row.z), { rotation: yaw(row.heading), count: Math.max(0, Math.min(12, Math.round(12 * fill + (hash(`flow${r}${i}`) - .5) * 5))) }))));
  SHELF_ROWS.forEach((row, r) => SHELF_X.forEach((x, i) => nodes.push(fixture(`shelf:${r}:${i}`, 'shelf', p(x, row.z), { rotation: yaw(row.heading), count: Math.max(0, Math.min(12, Math.round(12 * fill + (hash(`shelf${r}${i}`) - .5) * 5))) }))));
  [17.6, 25.9].forEach((x, i) => nodes.push(fixture(`decant-${i}`, 'pallet', p(x, -5.05), { count: 9 + i * 6, rotation: yaw(HALF) })));
  const pickers = Math.min(3, snapshot.crew['each-pick'] ?? 0), standing = Math.min(6, (snapshot.crew['each-pick'] ?? 0) - pickers);
  PICKER_LOOPS.slice(0, pickers).forEach((points, i) => {
    const id = `picker:${i}`, route = loop(points, 'picking-cart', 1, i * 9);
    nodes.push({ ...person(id, points[0], 0, 'pushing', i), route });
    nodes.push(fixture(`${id}:cart`, 'picking-cart', [0, 0, 0], { count: 2 + i, attachment: { nodeId: id, anchor: 'cart' } }));
  });
  for (let i = 0; i < standing; i++) nodes.push(person(`picker:face:${i}`, p(FLOW_X[1 + i * 1.2 | 0], i % 2 ? -8.25 : -1.95), i % 2 ? 0 : BACK, 'picking', i + 3));

  // Sortation: robots, put walls with the orders being consolidated, roll cages at the end of the conveyor.
  const wave = snapshot.scenario === 'dispatch' ? 1 : snapshot.scenario === 'inbound' ? .55 : .15;
  PUT_WALL_Z.forEach((z, r) => PUT_WALL_X.forEach((x, i) => nodes.push(fixture(`putwall:${r}:${i}`, 'put-wall', p(x, z), { rotation: yaw(BACK), count: Math.round(20 * wave * (.5 + hash(`wall${r}${i}`) * .5)) }))));
  CAGE_Z.forEach((z, i) => nodes.push(fixture(`parcel-cage-${i}`, 'roll-cage', p(46.6, z), { rotation: yaw(-HALF), count: Math.round(12 * wave * (.4 + hash(`cage${i}`) * .6)) })));
  const sorters = Math.min(5, snapshot.crew.sortation ?? 0);
  if (sorters) nodes.push(person('sorter:induct', p(43.3, -14.8), HALF, 'placing', 1));
  for (let i = 1; i < sorters; i++) nodes.push(person(`sorter:${i}`, p(PUT_WALL_X[i - 1], i % 2 ? -4.4 : -11), BACK, 'placing', i + 1));

  // Packing: one operator per staffed bench, value-added services take the rest, and the high-value cage.
  const packers = Math.min(PACK_X.length, snapshot.crew.packing ?? 0);
  PACK_X.forEach((x, i) => {
    nodes.push(selectable(`pack:${i}`, 'packing', 'station', p(x, PACK_Z), `Pack bench ${i + 1}${i < packers ? '' : ' · unstaffed'}`, { variant: 'packing', state: i < packers ? 'busy' : 'inactive' }));
    if (i < packers) nodes.push(person(`packer:${i}`, p(x, PACK_Z + 1.05), BACK, 'working', i));
  });
  for (let i = 0; i < Math.min(4, (snapshot.crew.packing ?? 0) - packers); i++) nodes.push(person(`vas:${i}`, p(18 + i * 4, -26.45), BACK, 'working', i + 1));
  [40, 42.4].forEach((x, i) => nodes.push(fixture(`high-value-${i}`, 'hold-cage', p(x, -27), { count: [5, 3][i] })));

  // Receiving, returns and the dock office.
  if ((snapshot.crew.inbound ?? 0) > 2) nodes.push(person('receiver', p(-16.3, 8.2), HALF, 'working', 1));
  const inspectors = Math.min(2, snapshot.crew.returns ?? 0);
  [-11, -6.6].forEach((x, i) => {
    nodes.push(fixture(`returns-bench-${i}`, 'station', p(x, 9.6), { variant: 'inspection', rotation: yaw(BACK), state: i < inspectors ? 'busy' : 'inactive' }));
    if (i < inspectors) nodes.push(person(`returns:${i}`, p(x, 8.55), 0, 'working', i));
  });
  for (let i = 0; i < 4; i++) nodes.push(fixture(`returns-tote-${i}`, 'tote', p(-11.8 + i * 1.4, 6.7), { count: Math.max(0, Math.min(9, snapshot.returns.awaiting - i * 9)), scale: [.6, .6, .6] }));
  nodes.push(selectable('returns:hold', 'returns', 'hold-cage', p(-5.4, 5.2), `Quarantine · ${snapshot.returns.held} held`, { count: Math.min(8, snapshot.returns.held), state: snapshot.returns.held ? 'warning' : undefined, surfaceLabel: text('HOLD', '#9b4d5c') }));
  const schedule = DOCKS.filter(value => dockState(snapshot, value.id).status !== 'free').slice(0, 6).map(value => `${value.id} ${dockState(snapshot, value.id).ref ?? dockState(snapshot, value.id).status.toUpperCase()}`).join('\n');
  nodes.push(fixture('office-board', 'information-board', p(-2.6, 11.3), { surfaceLabel: { kind: 'text', layout: 'multiline', text: schedule || 'NO TRUCKS\nAT THE DOORS', color: '#eef4f8' } }));
  const [hours, minutes] = snapshot.time.split(':').map(Number);
  nodes.push(fixture('office-clock', 'digital-clock', p(2.4, 11.3), { variant: 'hours-minutes', display: { kind: 'clock', seconds: hours * 3600 + minutes * 60, running: true } }));
  for (let i = 0; i < Math.min(3, snapshot.crew.office ?? 0); i++) nodes.push(person(`office:${i}`, p(-1.6 + i * 1.6, 6.6), 0, i === 1 ? 'idle' : 'working', i, { color: OFFICE }));
  if (snapshot.crew.chilled) nodes.push(person('chilled:worker', p(-33.4, -6.6), BACK, 'working', 0));
  // A chilled delivery waits by the chamber door.
  if (snapshot.deliveries.some(value => value.chilled && value.received > 0 && value.received < value.pallets)) nodes.push(fixture('chilled:incoming', 'pallet', p(-33, 1.9), { count: 18, rotation: yaw(HALF) }));

  nodes.push(...fleetNodes(snapshot));
  nodes.push(...alertMarkers(snapshot, nodes));
  return nodes;
}

export const DEFAULT_ZOOM = 1;
export function createWarehouseStore(scenario: WarehouseScenario = 'dispatch'): SceneStore {
  return createSceneStore({ schemaVersion: 1, nodes: warehouseNodes(SCENARIOS[scenario]) }, { zoom: DEFAULT_ZOOM });
}
/** Replace the scene with a confirmed host snapshot. The dashboard sends no commands. */
export function applyWarehouseSnapshot(store: SceneStore, snapshot: WarehouseSnapshot): void { store.replace(warehouseNodes(snapshot)); }
