import { createNavGraph, personHairColor, resolveInteractionSlots, type AssetNode, type ControllerFactory, type ControllerRegistry, type NavEdge, type NavPoint, type ResolvedSlot, type SceneNode, type Vec3 } from '@opsorama/core';
import { PALLET, TRUCK, assetInteractionSlots, assetMotionProfiles } from '@opsorama/objects';
import {
  AREAS, CAGE_CAPACITY, CARRIERS, COLLECT_CAPACITY, DEPARTMENTS, HOLD_CAPACITY, LOCATIONS, PUT_WALL_CAPACITY, RETURNS_TOTE_CAPACITY,
  areaStatus, cageCounts, departmentFacings, departmentLow, locationState, orderArea, ordersIn, stagedFor,
  type AreaId, type CheckoutId, type DepartmentId, type DockId, type EcommerceSnapshot, type LocationId, type Order, type PackStationId, type PutWallId,
} from './model';

/** Top of the area zones: fixtures and people inside the building stand on it. */
export const FLOOR_Y = .095;
/** Sidewalk surface level outside the shop. */
const WALK_Y = .12;
const p = (x: number, z: number, y = FLOOR_Y): Vec3 => [x, y, z];
const yaw = (value: number): Vec3 => [0, value, 0];
const HALF = Math.PI / 2, BACK = Math.PI;
const fixture = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position, selectable: false, ...extra });
const selectable = (id: string, entityId: string, asset: string, position: Vec3, label: string, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, entityId, kind: 'asset', asset, position, label, labelMode: 'active', selectable: true, ...extra });

export const STAFF = '#e59a32';
const SHOP_STAFF = '#2f6f8f';
export const SHOPPERS = ['#6489d6', '#d08b5b', '#7fae8e', '#b07cc6', '#e0b44c', '#5f9fb8', '#c46b6b', '#8a9bb0', '#9a7bd0', '#6fb3a0'] as const;
/** A person; staff are plain workers, shoppers are visitors and the door has a security guard. `extra` sets the asset or figure. */
const person = (id: string, position: Vec3, heading: number, variant: string, color: string, label?: string, extra: Partial<AssetNode> = {}): AssetNode =>
  ({ id, kind: 'asset', asset: 'worker', variant, color, position, rotation: yaw(heading), selectable: false, materials: { hair: personHairColor(id) }, ...(label ? { label, labelMode: 'active' as const } : {}), ...extra });
/** Mixed crews and shoppers: every other person uses the feminine figure. */
export const FEMININE = { person: { figure: 'feminine' } } as const satisfies Partial<AssetNode>;

/* ── Fixed layout ───────────────────────────────────────────────────────── */

/** Two rack rows of seven bays, both facing the front: R01–R07 served from `AISLE_Z`, and R08–R14 against the back wall served from `DEEP_AISLE_Z`. */
export const RACK_PLACES: Readonly<Record<string, { position: Vec3; aisle: number }>> = Object.fromEntries(LOCATIONS.filter(item => item.kind === 'rack').map((item, i) => [item.id, i < 7 ? { position: p(-6.3 + i * 2.95, -12.25), aisle: -9.6 } : { position: p(-6.3 + (i - 7) * 2.95, -19.65), aisle: -17 }]));
const AISLE_Z = -9.6, DEEP_AISLE_Z = -17, BACK_WALL_Z = -21;
const PICK_Z = -3.7, AISLE_RETURN_Z = -8.2, PICK_LINE_Z = -2.25, PICK_RETURN_Z = -1.3, INDUCT_X = 8.9, INDUCT_Z = -2.85;
const PICK_FACES: Readonly<Record<string, { asset: 'carton-flow-rack' | 'shelf'; x: number }>> = {
  F1: { asset: 'carton-flow-rack', x: -6.4 }, F2: { asset: 'carton-flow-rack', x: -4.2 }, F3: { asset: 'carton-flow-rack', x: -2 }, F4: { asset: 'carton-flow-rack', x: .2 },
  S1: { asset: 'shelf', x: 3 }, S2: { asset: 'shelf', x: 6.2 },
};
export const DOCK_Z: Readonly<Record<DockId, number>> = { D1: -11.2, D2: -7.4, D3: 2.6 };
const DOCK_X = 22.6;
/** The building's edge at the docks, where the dock base ends and the apron drops away. */
const DOCK_EDGE_X = DOCK_X + .6;
/** The truck apron is sunk below the hall, so a docked truck's cargo floor is level with the hall floor. */
export const APRON_Y = FLOOR_Y - TRUCK.floorTop;
/** Where a docked truck stands with its tail at the dock edge, and the point past the site edge where it appears and leaves. */
export const TRUCK_X = DOCK_EDGE_X + TRUCK.length / 2 + .02, YARD_X = 42;
export const PACK_X: Readonly<Record<PackStationId, number>> = { K1: 4.6, K2: 8.4, K3: 12.2 };
const PACK_Z = 2.9;
export const PUT_WALL_X: Readonly<Record<PutWallId, number>> = { P1: 13.2, P2: 16 };
const PUT_WALL_Z = -1.3;
export const CAGE_X: Readonly<Record<string, number>> = { 'swift-1': 15, 'swift-2': 16, 'parcelo-1': 17.3, 'parcelo-2': 18.3 };
/** Roll cages stand along this line with their open front toward the dispatch aisle. */
export const CAGE_Z = .9;
export const CHECKOUT_X: Readonly<Record<CheckoutId, number>> = { C1: -23.4, C2: -20.4, C3: -17.4 };
const CHECKOUT_Z = .6, COLLECT: Vec3 = p(-12, 1);
/** Gondola rows along the shop floor, back to front; each department owns two neighbouring gondolas. */
const GONDOLA_X = [-23.6, -21.4, -19.2, -17] as const, GONDOLA_Z = [-19.9, -16.2, -12.5, -8.8, -5.1] as const, FRONT_GONDOLA_ROW = GONDOLA_Z.length - 1;
export const GONDOLAS: readonly { id: string; department: DepartmentId; index: 0 | 1; position: Vec3 }[] = GONDOLA_Z.flatMap((z, row) => GONDOLA_X.map((x, column) => {
  const department = DEPARTMENTS[row * 2 + (column >> 1)].id, index = (column % 2) as 0 | 1;
  return { id: `gondola:${department}:${index}`, department, index, position: p(x, z) };
}));
/** Free floor spots where each area's status pin stands. */
const AREA_PINS: Readonly<Record<AreaId, Vec3>> = {
  shop: p(-12.6, -7.4), checkout: p(-15.7, 3.9), collect: p(-9.8, 3.6), receiving: p(19.6, -12.4), storage: p(4.6, -6.4),
  picking: p(-7.5, -.5), sorting: p(10.6, -.5), packing: p(6.5, .6), dispatch: p(21.1, .8), returns: p(-1.9, 1),
};
/** The staging lane: one column of pallets the forklift fills from the east and the reach truck empties from the west. */
export const STAGING_X = 16.2;
export const STAGING_SPOTS: readonly Vec3[] = [-12.4, -11.34, -10.28, -9.22, -8.16, -7.1].map(z => p(STAGING_X, z));
export const PALLET_STACK: Vec3 = p(12.6, -6.05);
/** Base height of each rack level above the floor, matching `PALLET_RACK.levels`. */
export const RACK_LEVELS = [0, 1.56, 3.06] as const;
/** Height of one pallet on the empty stack: the stack is built from the same pallet the trucks carry. */
export const STACKED_PALLET = PALLET.deckTop;
/**
 * A pallet's fork pockets open on its short side, so its long side always lies along the direction of the truck
 * that serves it. The staging lane and dock mouth are served along x, which is a pallet's unturned long side; the
 * spots behind the pick faces, the stack and the racks are served along z, so pallets there are turned a quarter.
 */
export const ALONG_Z = HALF, RACK_TURN = 90;
/** Where a pallet stands behind a pick face while its cartons are decanted. */
export const replenishSpot = (face: string): Vec3 => p(PICK_FACES[face].x, -5.75);
/** Height of the conveyor belt, and the stretch where totes ride. */
export const BELT_Y = FLOOR_Y + .83;
export const BELT_Z = -3.9, BELT_END_X = 20.3;
/** The cart of a picker standing at the induct, right beside the belt, and the deck of a robot at the end of the belt. */
export const CART_AT_INDUCT: Vec3 = [INDUCT_X + 1.02, FLOOR_Y + .8, INDUCT_Z];
const DISCHARGE_X = 20.95;
export const ROBOT_DECK: Vec3 = [DISCHARGE_X, FLOOR_Y + .3, BELT_Z];
/** Dock mouth where the forklift takes a pallet off an inbound truck. */
export const dockMouth = (dock: DockId): Vec3 => p(DOCK_X - .2, DOCK_Z[dock], .1);

/** Fixtures that people and vehicles visit. */
export const pickFaceNodes: readonly AssetNode[] = Object.entries(PICK_FACES).map(([id, face]) =>
  selectable(`${face.asset === 'shelf' ? 'shelf' : 'flow'}:${id}`, id, face.asset, p(face.x, face.asset === 'shelf' ? PICK_Z + .05 : PICK_Z), `${id} · ${LOCATIONS.find(item => item.id === id)!.family}`));
const fixtureSlots = (nodes: readonly AssetNode[]) => nodes.flatMap(node => resolveInteractionSlots(node, assetInteractionSlots[node.asset]));
/** Catalog slots of the pick faces; pickers stop on their approaches with the cart ahead of them. */
export const pickSlots = fixtureSlots(pickFaceNodes);

const wall = (id: string, x: number, z: number, variant: 'solid' | 'window' | 'door', extra: Partial<AssetNode> = {}) => fixture(id, 'wall-segment', [x, 0, z], { variant, color: '#e4e9ee', ...extra });
/** Concrete wall around the sunken apron, from the apron up to ground level. `length` is in metres; a wall segment is 4 m long and 2.6 m high. */
const apronWall = (id: string, x: number, z: number, length: number, heading: number) => fixture(id, 'wall-segment', [x, APRON_Y, z], { variant: 'solid', color: '#c6ccd2', rotation: yaw(heading), scale: [length / 4, -APRON_Y / 2.6, 1] });
/** West and east edge of the site: the street's whole 6 m tiles fill this width exactly. */
export const SITE_WEST_X = -29, SITE_EAST_X = 37;
/** Road tiles along x: the centre of the first tile, how many there are, and the road's centre line. */
const ROAD_WEST_X = SITE_WEST_X + 3, ROAD_TILES = (SITE_EAST_X - SITE_WEST_X) / 6;
export const ROAD_Z = 10.2;
/** The truck yard between the dock edge and the east edge of the site. */
const YARD_WIDTH = SITE_EAST_X - DOCK_EDGE_X, YARD_CENTER_X = DOCK_EDGE_X + YARD_WIDTH / 2;
const WEST_STRIP_EAST_X = -18.2;
/** Ground, surfaces, walls and decoration that do not depend on the snapshot. */
export const ecommerceBase: readonly SceneNode[] = [
  // The ground leaves a gap for the sunken apron. The first piece holds the point the overview camera targets;
  // the narrow strip behind the building keeps the full site width the overview framing and shadows measure from.
  { id: 'ground', kind: 'ground', size: [41.4, 35.9], position: [2.5, 0, -4.45], color: '#d7e2d2' },
  { id: 'ground-west', kind: 'ground', size: [WEST_STRIP_EAST_X - SITE_WEST_X, 35.9], position: [(SITE_WEST_X + WEST_STRIP_EAST_X) / 2, 0, -4.45], color: '#d7e2d2' },
  { id: 'ground-south', kind: 'ground', size: [YARD_WIDTH, 7.5], position: [YARD_CENTER_X, 0, 9.75], color: '#d7e2d2' },
  { id: 'ground-north', kind: 'ground', size: [YARD_WIDTH, 7.4], position: [YARD_CENTER_X, 0, -18.7], color: '#d7e2d2' },
  { id: 'ground-back', kind: 'ground', size: [SITE_EAST_X - SITE_WEST_X, .1], position: [(SITE_WEST_X + SITE_EAST_X) / 2, 0, -22.45], color: '#d7e2d2' },
  fixture('dock-edge', 'terrain', [22.6, 0, -4.5], { variant: 'asphalt', footprint: [1.2, 21] }),
  fixture('yard', 'terrain', [YARD_CENTER_X, APRON_Y + .01, -4.5], { variant: 'asphalt', footprint: [YARD_WIDTH, 21] }),
  fixture('sidewalk', 'sidewalk', [-3.5, 0, 6.2], { footprint: [51, 2] }),
  // The road ends at the edges of the site.
  ...Array.from({ length: ROAD_TILES }, (_, i) => fixture(`road-${i}`, 'road', [ROAD_WEST_X + i * 6, 0, ROAD_Z], { variant: i === 2 ? 'crosswalk' : 'straight' })),
  apronWall('apron-wall-dock', DOCK_EDGE_X - .08, -4.5, 21, HALF),
  apronWall('apron-wall-north', YARD_CENTER_X, -14.92, YARD_WIDTH, 0),
  apronWall('apron-wall-south', YARD_CENTER_X, 5.92, YARD_WIDTH, 0),
  // Back and side walls frame the cutaway; the camera side stays open.
  ...[-24, -20, -16, -12].map((x, i) => wall(`wall-shop-${i}`, x, BACK_WALL_Z, 'window')),
  wall('wall-shop-4', -9.25, BACK_WALL_Z, 'solid', { scale: [.375, 1, 1] }),
  ...[-6.5, -2.5, 1.5, 5.5, 9.5, 13.5, 17.5].map((x, i) => wall(`wall-hall-${i}`, x, BACK_WALL_Z, 'solid', { color: '#dfe5ea' })),
  wall('wall-hall-7', 20.75, BACK_WALL_Z, 'solid', { scale: [.625, 1, 1], color: '#dfe5ea' }),
  ...[-19, -15].map((z, i) => wall(`wall-east-${i}`, 22.9, z, 'solid', { rotation: yaw(HALF), color: '#dfe5ea' })),
  ...[-11.5, -7.5, -3.5, .5].map((z, i) => wall(`wall-west-${i}`, -26.1, z, i === 3 ? 'door' : 'window', { rotation: yaw(HALF) })),
  wall('wall-west-4', -26.1, 3.75, 'window', { rotation: yaw(HALF), scale: [.75, 1, 1] }),
  wall('wall-west-5', -26.1, -15.5, 'window', { rotation: yaw(HALF) }),
  wall('wall-west-6', -26.1, -19.25, 'window', { rotation: yaw(HALF), scale: [.875, 1, 1] }),
  // A low partition separates the shop from the warehouse; the gap is the staff door behind click & collect.
  ...[-11.5, -7.5, -3.5].map((z, i) => wall(`partition-${i}`, -8.5, z, 'solid', { rotation: yaw(HALF), scale: [1, .42, 1], color: '#cfd8e1' })),
  wall('partition-3', -8.5, 3, 'solid', { rotation: yaw(HALF), scale: [.5, .42, 1], color: '#cfd8e1' }),
  wall('partition-4', -8.5, -15.5, 'solid', { rotation: yaw(HALF), scale: [1, .42, 1], color: '#cfd8e1' }),
  wall('partition-5', -8.5, -19.25, 'solid', { rotation: yaw(HALF), scale: [.875, .42, 1], color: '#cfd8e1' }),
  // Shop decoration.
  fixture('shop-board', 'information-board', p(-12.4, -20), { surfaceLabel: { kind: 'text', layout: 'multiline', text: 'ORDER ONLINE\nCOLLECT IN 2 H\n\nCounter by\nthe entrance', color: '#eef4f8' } }),
  fixture('shop-sign', 'sign', [-14.4, WALK_Y, 5.4], { surfaceLabel: { kind: 'text', text: 'HEARTH & FIELD', color: '#ffffff', background: '#2f6f8f' } }),
  ...[[-10.3, -2.6], [-10.3, -9.6], [-25.2, 4.2], [-14.3, -20], [-10.3, -16.5]].map(([x, z], i) => fixture(`shop-plant-${i}`, 'potted-plant', p(x, z))),
  ...[0, 1].map(i => fixture(`shop-cart-${i}`, 'shopping-cart', p(-10.4, -5.8 + i * .55), { count: 0, rotation: yaw(-HALF) })),
  // Warehouse decoration: bollards at the aisle ends, overflow pallets and a parked pallet jack.
  ...[[-7.6, -9.6], [-7.6, -17], [13.1, -12.7], [13.7, -5.2]].map(([x, z], i) => fixture(`bollard-${i}`, 'safety-barrier', p(x, z), { variant: 'bollard' })),
  fixture('overflow-0', 'pallet', p(-7.4, -6.6), { count: 9 }),
  ...[[16.4, -19.4], [18, -19.4], [19.6, -19.4], [16.4, -17.9], [18, -17.9]].map(([x, z], i) => fixture(`overflow-${i + 1}`, 'pallet', p(x, z), { count: 9 + i * 3 })),
  fixture('pallet-jack', 'pallet-jack', p(-7, 3.6), { rotation: yaw(HALF) }),
  ...[0, 1, 2].map(i => fixture(`conveyor-${i}`, 'conveyor', p(10.4 + i * 4.05, BELT_Z), { rotation: yaw(HALF) })),
  // Street furniture.
  ...[-25, -5, 12].map((x, i) => fixture(`lamp-${i}`, 'lamp-post', [x, WALK_Y, 6.9])),
  fixture('bench', 'bench', [-9.8, WALK_Y, 6.75], { rotation: yaw(BACK) }),
  ...[[-28, -10], [-28, -4.5], [-28, 1.5], [-28, 4.2], [-28, -16], [33, -17.5], [30.2, -19.6]].map(([x, z], i) => fixture(`tree-${i}`, i % 2 ? 'tree' : 'tree-pine', [x, 0, z])),
];

/* ── Movement graph ─────────────────────────────────────────────────────── */

const FACES = Object.keys(PICK_FACES), rackIds = Object.keys(RACK_PLACES), frontRacks = rackIds.slice(0, 7), deepRacks = rackIds.slice(7);
/** Fork length ahead of the truck: a forklift stops with its forks under the load, a reach truck stops short and reaches the mast forward. */
const FORK_REACH = 1.6, REACH_REACH = 1.9, REACH_AISLE_X = 13.9, FORK_AISLE_X = 18.7, BACK_Z = -4.85, WALL_ROW_Z = -.15, BENCH_ROW_Z = 1.35, CAGE_ROW_Z = 2.15, STAFF_ROW_Z = .4, GAP_EAST_X = -7.9, GAP_WEST_X = -9.3, SHOP_SOUTH_Z = -1.2, CROSS_X = -15.3, DOOR_Z = 3.6, STREET_Z = 6, FRONT_ROW_Z = 2.9;
const AMR = { discharge: p(19.8, -2.45), P2: p(16.6, -2.45), P1: p(13.8, -2.45), turn: p(12.4, -2.45), back: p(12.4, -2.95), 'home-0': p(14, -2.95), 'home-1': p(15.4, -2.95), wait: p(17.6, -2.95), east: p(21.9, -2.95), corner: p(21.9, -2.45) };
const chain = (ids: readonly string[], lane: string) => ids.slice(1).map((to, i) => ({ from: ids[i], to, lane, oneWay: true }));
const link = (ids: readonly string[], lane: string): NavEdge[] => ids.slice(1).map((to, i) => ({ from: ids[i], to, lane }));

/** A host-defined slot; `agents` are the kinds that may use it. */
const slot = (nodeId: string, name: string, approach: Vec3, position: Vec3, heading: number, pose: string, agents: readonly string[], group = name): ResolvedSlot =>
  ({ id: `${nodeId}:${name}`, nodeId, name, group, pose, agents, approach, position, yaw: heading });
/** A catalog slot of a fixture, opened to other agent kinds. */
const catalogSlots = (node: Pick<AssetNode, 'id' | 'asset' | 'position' | 'rotation'>, agents: readonly string[], pose?: string): ResolvedSlot[] =>
  resolveInteractionSlots({ ...node, kind: 'asset' }, assetInteractionSlots[node.asset]).map(value => ({ ...value, agents, ...(pose ? { pose } : {}) }));

/** One slot per pallet position of a bay: the truck lines up with the pallet, and its reached-out forks end under it. */
const rackSlots = rackIds.flatMap(id => {
  const { position: [x, , z], aisle } = RACK_PLACES[id];
  return [-.65, .65].map((side, i) => slot(`rack:${id}`, `load-${i}`, p(x + side, aisle), p(x + side, z + REACH_REACH), BACK, 'operated', ['reach-truck'], 'load'));
});
const stagingForkSlots = STAGING_SPOTS.map((spot, i) => slot(`staging:${i}`, 'fork', p(FORK_AISLE_X, spot[2]), p(STAGING_X + FORK_REACH, spot[2]), -HALF, 'operated', ['forklift']));
const stagingReachSlots = STAGING_SPOTS.map((spot, i) => slot(`staging:${i}`, 'reach', p(REACH_AISLE_X, spot[2]), p(STAGING_X - REACH_REACH, spot[2]), HALF, 'operated', ['reach-truck']));
const dockSlots = (['D1', 'D2'] as const).map(id => slot(`dock:${id}`, 'unload', p(20.3, DOCK_Z[id]), p(dockMouth(id)[0] - FORK_REACH, DOCK_Z[id]), HALF, 'operated', ['forklift']));
const replenishDrops = FACES.map(id => slot(`replen:${id}`, 'drop', p(PICK_FACES[id].x, -7.9), p(PICK_FACES[id].x, replenishSpot(id)[2] - REACH_REACH), 0, 'operated', ['reach-truck']));
const stackSlot = slot('pallet-stack', 'drop', p(PALLET_STACK[0], -8.1), p(PALLET_STACK[0], PALLET_STACK[2] - REACH_REACH), 0, 'operated', ['reach-truck']);
/** Staff work the back of each pick face: take a carton from the pallet, fill the lane, or take one for the shop. */
const backSpots = FACES.flatMap(id => { const x = PICK_FACES[id].x; return [[id, 'take', x - .35, BACK], [id, 'fill', x + .35, 0], [id, 'shop', x + .75, 0]] as const; });
const backSlots = backSpots.map(([id, name, x, heading]) => { const at = p(x, BACK_Z); return slot(`replen:${id}`, name, at, at, heading, name === 'take' ? 'picking' : 'placing', ['staff']); });
const pickStops = [...pickSlots.filter(value => value.group === 'pick')].sort((a, b) => a.approach[0] - b.approach[0]).map(value => ({ ...value, position: value.approach, yaw: HALF, pose: 'picking', agents: ['picker'] }));
/** The picker stops with the cart right beside the belt and slides the tote across. */
const inductSlot: ResolvedSlot = { id: 'induct', nodeId: 'induct', name: 'drop', group: 'drop', pose: 'placing', agents: ['picker'], approach: p(INDUCT_X, INDUCT_Z), position: p(INDUCT_X, INDUCT_Z), yaw: HALF };
/** The robot parks its deck at the end of the belt, so a tote rides straight onto it. */
const dischargeSlot = slot('conveyor', 'discharge', p(DISCHARGE_X, -2.95), p(DISCHARGE_X, BELT_Z), BACK, 'deck', ['robot']);
const wallNodes = (Object.entries(PUT_WALL_X) as [PutWallId, number][]).map(([id, x]) => ({ id: `putwall:${id}`, asset: 'put-wall', position: p(x, PUT_WALL_Z) }));
/** A robot stops on its lane beside the sorter, who stands between it and the put wall. */
const robotWallSlots = wallNodes.map(node => slot(node.id, 'put', p(node.position[0], -2.45), p(node.position[0], -2.45), -HALF, 'deck', ['robot']));
const sorterSlots = wallNodes.map(node => slot(node.id, 'sort', p(node.position[0], -1.95), p(node.position[0], -1.95), 0, 'placing', ['staff']));
const packerWallSlots = wallNodes.flatMap(node => catalogSlots(node, ['staff']).filter(value => value.group === 'pick').map(value => ({ ...value, approach: p(value.approach[0], WALL_ROW_Z), pose: 'picking' })));
const benchSlots = (Object.entries(PACK_X) as [PackStationId, number][]).flatMap(([id, x]) => catalogSlots({ id: `pack:${id}`, asset: 'station', position: p(x, PACK_Z), rotation: yaw(BACK) }, ['staff']));
const cageSlots = Object.entries(CAGE_X).flatMap(([id, x]) => catalogSlots({ id: `cage:${id}`, asset: 'roll-cage', position: p(x, CAGE_Z) }, ['staff']));
const loadSlot = slot('dock:D3', 'load', p(20.8, DOCK_Z.D3), p(21.2, DOCK_Z.D3), HALF, 'pushing', ['staff']);
const handoverSlot = slot('collect:counter', 'handover', p(GAP_WEST_X - .3, STAFF_ROW_Z), p(COLLECT[0] + 1.6, .45), -HALF, 'placing', ['staff']);
const browseSlots = GONDOLAS.flatMap(item => catalogSlots({ id: item.id, asset: 'store-shelving', position: item.position }, ['shopper'], 'picking'));
const fillSlots = GONDOLAS.map(item => slot(item.id, 'fill', p(item.position[0] + .7, item.position[2] + 1.25), p(item.position[0] + .7, item.position[2] + .75), BACK, 'placing', ['staff']));
const checkoutSlots = (Object.entries(CHECKOUT_X) as [CheckoutId, number][]).flatMap(([id, x]) => catalogSlots({ id: `checkout:${id}`, asset: 'checkout-counter', position: p(x, CHECKOUT_Z), rotation: yaw(BACK) }, ['shopper']).filter(value => value.group === 'customer'));
const collectSlot = catalogSlots({ id: 'collect:counter', asset: 'click-collect-counter', position: COLLECT }, ['shopper']).filter(value => value.group === 'customer');

/** Every interaction slot of the live site. */
export const ecommerceSlots: readonly ResolvedSlot[] = [...rackSlots, ...stagingForkSlots, ...stagingReachSlots, ...dockSlots, ...replenishDrops, stackSlot, ...backSlots, ...pickStops, inductSlot, dischargeSlot, ...robotWallSlots, ...sorterSlots, ...packerWallSlots, ...benchSlots, ...cageSlots, loadSlot, handoverSlot, ...browseSlots, ...fillSlots, ...checkoutSlots, ...collectSlot];
const stops = (slots: readonly ResolvedSlot[]): NavPoint[] => slots.map(value => ({ id: value.id, position: value.approach }));
const byX = (ids: readonly (readonly [string, number])[]) => [...ids].sort((a, b) => a[1] - b[1]).map(([id]) => id);

/** Queue places of a checkout, nearest first; shoppers join from the back. */
export const queuePoints = (lane: CheckoutId): readonly string[] => [0, 1, 2].map(k => `queue:${lane}:${k}`);
/** Shop aisle in front of one gondola row: its browse and fill stops, and where the queues start. */
const shopRow = (row: number) => byX([...GONDOLA_X.flatMap((x, column) => { const item = GONDOLAS[row * 4 + column]; return [[`${item.id}:browse`, x], [`${item.id}:fill`, x + .7]] as const; }), ...(row === FRONT_GONDOLA_ROW ? (Object.entries(CHECKOUT_X) as [CheckoutId, number][]).map(([id, x]) => [`row:${id}`, x] as const) : []), [`cross:${row}`, CROSS_X]]);
const backRow = byX(backSpots.map(([id, name, x]) => [`replen:${id}:${name}`, x] as const));
const returnRow = byX([...FACES.map(id => [`return:${id}`, PICK_FACES[id].x] as const), ['aisle-return-west', -4.5], ['aisle-return-east', 9.9], ['return:stack', PALLET_STACK[0]]]);

/**
 * Where agents may move. Pickers circulate one way along the pick faces and
 * return behind them; the reach truck, forklift, robots, staff and shoppers each
 * keep to their own lanes, so no planned route uses another agent kind's lane.
 * Staff share the shop aisles with shoppers and pass the end of the pick loop on
 * the way to the staff door. Kinds that share floor may pass through each other.
 */
export const warehouseNavigation = createNavGraph({
  points: [
    ...stops(ecommerceSlots),
    { id: 'pick-west', position: p(-7.4, PICK_LINE_Z) }, { id: 'induct-in', position: p(INDUCT_X - .5, PICK_LINE_Z) }, { id: 'induct-out', position: p(10.4, INDUCT_Z) }, { id: 'pick-return-east', position: p(10.4, PICK_RETURN_Z) }, { id: 'pick-return-west', position: p(-7.4, PICK_RETURN_Z) },
    ...frontRacks.map(id => ({ id: `aisle:${id}`, position: p(RACK_PLACES[id].position[0], AISLE_Z) })),
    { id: 'deep-east', position: p(REACH_AISLE_X, DEEP_AISLE_Z) },
    { id: 'aisle-west', position: p(-4.5, AISLE_Z) }, { id: 'aisle-east', position: p(9.9, AISLE_Z) }, { id: 'aisle-end', position: p(13.2, AISLE_Z) }, { id: 'staging-aisle', position: p(REACH_AISLE_X, AISLE_Z) },
    { id: 'aisle-return-east', position: p(9.9, AISLE_RETURN_Z) }, { id: 'aisle-return-west', position: p(-4.5, AISLE_RETURN_Z) }, ...FACES.map(id => ({ id: `return:${id}`, position: p(PICK_FACES[id].x, AISLE_RETURN_Z) })), { id: 'return:stack', position: p(PALLET_STACK[0], AISLE_RETURN_Z) },
    { id: 'apron-d1', position: p(20.3, -10.6) }, { id: 'apron-d2', position: p(20.3, -7.8) }, { id: 'apron-staging-south', position: p(FORK_AISLE_X, -7.8) }, { id: 'apron-staging-north', position: p(FORK_AISLE_X, -10.6) },
    ...Object.entries(AMR).map(([id, position]) => ({ id: `amr-${id}`, position })),
    // Staff walkways: wall row, bench row, cage row, the staff door and the back of the pick faces.
    { id: 'pack-row-east', position: p(14.4, BENCH_ROW_Z) }, { id: 'wall-row-east', position: p(14.4, WALL_ROW_Z) }, { id: 'cage-row-west', position: p(14.4, CAGE_ROW_Z) }, { id: 'cage-row-east', position: p(19.2, CAGE_ROW_Z) },
    { id: 'pack-row-west', position: p(3.4, BENCH_ROW_Z) }, { id: 'staff-west', position: p(3.4, STAFF_ROW_Z) }, { id: 'gap-east', position: p(GAP_EAST_X, STAFF_ROW_Z) }, { id: 'back-west', position: p(GAP_EAST_X, BACK_Z) }, { id: 'shop-south-east', position: p(GAP_WEST_X, SHOP_SOUTH_Z) },
    // Shoppers: street, door, the cross aisle, checkout queues and the way out in front of the lanes.
    { id: 'street', position: [8, WALK_Y, STREET_Z] }, { id: 'door-out', position: [CROSS_X, WALK_Y, STREET_Z] }, { id: 'door-in', position: p(CROSS_X, DOOR_Z) }, { id: 'collect-front', position: p(-13.6, DOOR_Z) }, { id: 'cross-south', position: p(CROSS_X, SHOP_SOUTH_Z) },
    ...GONDOLA_Z.map((z, row) => ({ id: `cross:${row}`, position: p(CROSS_X, z + 1.25) })),
    ...(Object.entries(CHECKOUT_X) as [CheckoutId, number][]).flatMap(([id, x]) => [
      { id: `row:${id}`, position: p(x, GONDOLA_Z[FRONT_GONDOLA_ROW] + 1.25) }, ...[0, 1, 2].map(k => ({ id: `queue:${id}:${k}`, position: p(x, -1.65 - k * .85) })),
      { id: `lane-exit:${id}`, position: p(x + 1.5, -.7) }, { id: `lane-front:${id}`, position: p(x + 1.5, FRONT_ROW_Z) },
    ]),
  ],
  edges: [
    ...chain(['pick-west', ...pickStops.map(value => value.id), 'induct-in', 'induct', 'induct-out', 'pick-return-east', 'pick-return-west', 'pick-west'], 'pick-loop'),
    ...link([...byX([...frontRacks.flatMap(id => { const x = RACK_PLACES[id].position[0]; return [[`aisle:${id}`, x], [`rack:${id}:load-0`, x - .65], [`rack:${id}:load-1`, x + .65]] as const; }), ['aisle-west', -4.5], ['aisle-east', 9.9], ['aisle-end', 13.2]]), 'staging-aisle'], 'rack-aisle'),
    ...link([...deepRacks.flatMap(id => [`rack:${id}:load-0`, `rack:${id}:load-1`]), 'deep-east', 'staging:0:reach'], 'rack-aisle'),
    ...link(['staging:0:reach', 'staging:1:reach', 'staging:2:reach', 'staging-aisle', 'staging:3:reach', 'staging:4:reach', 'staging:5:reach'], 'rack-aisle'),
    { from: 'aisle-west', to: 'aisle-return-west', lane: 'rack-aisle' }, { from: 'aisle-east', to: 'aisle-return-east', lane: 'rack-aisle' },
    ...link(returnRow, 'rack-aisle'), ...FACES.map(id => ({ from: `return:${id}`, to: `replen:${id}:drop`, lane: 'rack-aisle' })), { from: 'return:stack', to: 'pallet-stack:drop', lane: 'rack-aisle' },
    ...link(['staging:0:fork', 'staging:1:fork', 'apron-staging-north', 'staging:2:fork', 'staging:3:fork', 'staging:4:fork', 'apron-staging-south', 'staging:5:fork'], 'dock-apron'),
    ...link(['apron-staging-north', 'apron-d1', 'dock:D1:unload'], 'dock-apron'), ...link(['apron-staging-south', 'apron-d2', 'dock:D2:unload'], 'dock-apron'), { from: 'apron-d1', to: 'apron-d2', lane: 'dock-apron' },
    ...chain(['amr-discharge', 'amr-P2', 'putwall:P2:put', 'amr-P1', 'putwall:P1:put', 'amr-turn', 'amr-back', 'amr-home-0', 'amr-home-1', 'amr-wait', 'conveyor:discharge', 'amr-east', 'amr-corner', 'amr-discharge'], 'robot-loop'),
    ...link(['pack-row-west', 'pack:K1:work', 'pack:K2:work', 'pack:K3:work', 'pack-row-east', 'wall-row-east', 'putwall:P1:pick'], 'staff-walk'), { from: 'wall-row-east', to: 'putwall:P2:pick', lane: 'staff-walk' },
    ...link(['pack-row-east', 'cage-row-west', 'cage:swift-1:load', 'cage:swift-2:load', 'cage:parcelo-1:load', 'cage:parcelo-2:load', 'cage-row-east', 'dock:D3:load'], 'staff-walk'),
    ...link(['pack-row-west', 'staff-west', 'gap-east', 'collect:counter:handover', 'shop-south-east', 'cross-south'], 'staff-walk'), ...link(['gap-east', 'back-west', ...backRow], 'staff-walk'),
    ...link(['street', 'door-out', 'door-in', 'cross-south', ...GONDOLA_Z.map((_, row) => `cross:${FRONT_GONDOLA_ROW - row}`)], 'shop-floor'), ...GONDOLA_Z.flatMap((_, row) => link(shopRow(row), 'shop-floor')),
    ...link(['door-in', 'collect-front', 'collect:counter:customer'], 'shop-floor'),
    ...(Object.keys(CHECKOUT_X) as CheckoutId[]).flatMap(id => [...link([`row:${id}`, `queue:${id}:2`, `queue:${id}:1`, `queue:${id}:0`, `checkout:${id}:customer`], 'shop-floor'), ...chain([`checkout:${id}:customer`, `lane-exit:${id}`, `lane-front:${id}`], 'shop-floor')]),
    ...link(['lane-front:C1', 'lane-front:C2', 'lane-front:C3', 'door-in'], 'shop-floor'),
  ],
  lanes: { 'pick-loop': { allow: ['picker'] }, 'rack-aisle': { allow: ['reach-truck'] }, 'dock-apron': { allow: ['forklift'] }, 'robot-loop': { allow: ['robot'] }, 'staff-walk': { allow: ['staff'] }, 'shop-floor': { allow: ['shopper', 'staff'] } },
  agents: {
    picker: { ...assetMotionProfiles['picking-cart'], speed: 1 }, staff: assetMotionProfiles.worker, shopper: { ...assetMotionProfiles.visitor, speed: 1.15 }, robot: { ...assetMotionProfiles['mobile-robot'], speed: 1.2 },
    // In tight spots both trucks stop and turn on the spot at sharp corners instead of arcing through a rack.
    'reach-truck': { ...assetMotionProfiles['reach-truck'], speed: 1.8, turnRate: 1.6, turnInPlaceAngle: Math.PI / 3 }, forklift: { ...assetMotionProfiles.forklift, speed: 2, turnRate: 1.6, turnInPlaceAngle: Math.PI / 3 },
  },
});

/**
 * `dock-shunt`: move along the record position at `speed` m/s (default 3) with a
 * fixed heading, so a truck reverses onto a dock and pulls away nose first. The
 * record heading never changes; motion-off shows the record position.
 */
const dockShunt: ControllerFactory = options => {
  const speed = Number(options.speed ?? 3);
  if (!(speed > 0)) throw new Error('Controller dock-shunt requires a positive speed.');
  return {
    update: ({ delta }, pose, { node }) => {
      const goal = node.position ?? pose.position, dx = goal[0] - pose.position[0], step = Math.min(Math.abs(dx), speed * delta);
      return { position: [pose.position[0] + Math.sign(dx) * step, goal[1], goal[2]], yaw: node.rotation?.[1] ?? pose.yaw, moving: step > 0 };
    },
    settle: (pose, { node }) => ({ position: node.position ?? pose.position, yaw: node.rotation?.[1] ?? pose.yaw, moving: false }),
  };
};
/** Controllers the example adds to `basicControllers`. */
export const ecommerceControllers: ControllerRegistry = { 'dock-shunt': dockShunt };

/* ── Snapshot-dependent nodes ───────────────────────────────────────────── */

/** What the mock feed adds to the snapshot's fixtures. */
export interface LiveLayer {
  /** Agents, the units they move, and trucks. */
  movers: readonly SceneNode[];
  /** Attachment and transform of each roll cage, by cage ID: a dispatcher can push one away. */
  cages: Readonly<Record<string, Pick<AssetNode, 'position' | 'rotation' | 'attachment'>>>;
}
const split = (total: number) => [Math.ceil(total / 2), Math.floor(total / 2)] as const;

/** One scene from a snapshot and the live layer. Racks stay at count 0: their pallets are real units among `movers`. */
export function ecommerceNodes(snapshot: EcommerceSnapshot, live: LiveLayer): SceneNode[] {
  const nodes: SceneNode[] = [...ecommerceBase, ...live.movers];

  // Zone labels sit behind a zone's back edge, which lands inside the neighbouring area for most zones,
  // so each area is named by a status pin standing in a free spot inside it instead.
  for (const value of AREAS) {
    const [x0, x1, z0, z1] = value.rect, status = areaStatus(snapshot, value.id), state = status.state === 'busy' ? undefined : status.state;
    nodes.push({ id: `area:${value.id}`, entityId: value.id, kind: 'zone', size: [x1 - x0, z1 - z0], position: [(x0 + x1) / 2, 0, (z0 + z1) / 2], color: value.color, selectable: true, interior: true });
    nodes.push({ id: `pin:${value.id}`, entityId: value.id, kind: 'asset', asset: 'map-pin', position: AREA_PINS[value.id], color: value.site === 'Shop' ? '#2f6f8f' : '#3f8a6d', state, label: value.label, labelMode: 'always', selectable: true });
  }

  // Shop floor: gondolas show stocked facings; shoppers are live agents.
  for (const gondola of GONDOLAS) {
    const label = DEPARTMENTS.find(item => item.id === gondola.department)!.label;
    nodes.push(selectable(gondola.id, gondola.department, 'store-shelving', gondola.position, `${label} · gondola ${gondola.index + 1}`, { count: split(departmentFacings(snapshot, gondola.department))[gondola.index], state: departmentLow(snapshot, gondola.department) ? 'warning' : undefined, surfaceLabel: { kind: 'text', text: label.toUpperCase(), color: '#ffffff', background: '#2f6f8f' } }));
  }

  // Checkouts face the shop floor; the queue forms toward it.
  for (const lane of snapshot.shop.checkouts) {
    const x = CHECKOUT_X[lane.id], open = snapshot.shopOpen && lane.open;
    nodes.push(selectable(`checkout:${lane.id}`, lane.id, 'checkout-counter', p(x, CHECKOUT_Z), `Checkout ${lane.id.slice(1)} · ${open ? `queue ${lane.queue}` : 'closed'}`, { rotation: yaw(BACK), state: open ? lane.queue > 2 ? 'busy' : 'normal' : 'inactive', surfaceLabel: { kind: 'text', text: lane.id.slice(1), color: '#ffffff', background: open ? '#2f8a62' : '#8a96a3' } }));
    if (open) nodes.push(person(`cashier:${lane.id}`, p(x - .55, CHECKOUT_Z + .7), BACK, 'working', SHOP_STAFF, lane.cashier, lane.id === 'C2' ? {} : FEMININE));
  }

  // Click & collect: one parcel per ready order on the counter, lockers and the returns box on the sidewalk.
  const ready = ordersIn(snapshot, 'collect').length;
  nodes.push(
    selectable('collect:counter', 'collect', 'click-collect-counter', COLLECT, `Click & collect · ${ready} ready`, { count: Math.min(COLLECT_CAPACITY, ready), state: snapshot.shopOpen ? ready ? 'busy' : 'normal' : 'inactive', surfaceLabel: { kind: 'text', text: 'CLICK & COLLECT', color: '#ffffff', background: '#b0603a' } }),
    selectable('collect:lockers', 'lockers', 'parcel-locker', [-19.5, WALK_Y, 6.25], `Parcel lockers · ${snapshot.shop.lockers} occupied`, { count: snapshot.shop.lockers, surfaceLabel: { kind: 'text', text: 'PARCEL LOCKERS', color: '#ffffff', background: '#b0603a' } }),
    selectable('returns:dropbox', 'dropbox', 'returns-drop-box', [-16.6, WALK_Y, 6.2], 'Returns drop box', { surfaceLabel: { kind: 'text', text: 'RETURNS', color: '#ffffff', background: '#9b4d5c' } }),
  );
  if (snapshot.shopOpen) {
    nodes.push(person('collect:staff', p(COLLECT[0] + .6, COLLECT[2] - .55), 0, 'working', SHOP_STAFF, 'Click & collect desk'));
    nodes.push(person('security', p(-14.2, 4.3), BACK, 'idle', '#36455f', 'Security', { asset: 'security-guard' }));
    nodes.push(fixture('courier-bike', 'cargo-bike', [-23.2, 0, 7.6], { rotation: yaw(HALF) }));
  }

  // Reserve storage and forward picking.
  for (const value of LOCATIONS) {
    const state = locationState(snapshot, value.id), count = snapshot.occupancy[value.id];
    if (value.kind === 'rack') nodes.push(selectable(`rack:${value.id}`, value.id, 'pallet-rack', RACK_PLACES[value.id].position, `${value.id} · ${count}/${value.capacity} pallets`, { count: 0, state: state === 'normal' ? undefined : state }));
  }
  for (const node of pickFaceNodes) {
    const id = node.entityId as LocationId, value = LOCATIONS.find(item => item.id === id)!, count = snapshot.occupancy[id], state = locationState(snapshot, id);
    nodes.push({ ...node, label: `${id} · ${count}/${value.capacity} ${value.kind === 'flow' ? 'lanes' : 'bins'}`, count, state: state === 'normal' ? undefined : state, ...(value.kind === 'flow' ? { surfaceLabel: { kind: 'text' as const, text: `${id} · ${value.family.toUpperCase()}`, color: '#ffffff', background: '#41566b' } } : {}) });
  }
  nodes.push(fixture('pallet-stack', 'pallet-stack', PALLET_STACK, { count: snapshot.emptyPallets, rotation: yaw(HALF) }));
  if (!snapshot.crew.storage) nodes.push(fixture('reach-truck', 'reach-truck', p(-5.2, AISLE_RETURN_Z), { rotation: yaw(HALF), state: 'inactive' }));

  // Sortation: put walls show one cubby per order.
  for (const [id, x] of Object.entries(PUT_WALL_X) as [PutWallId, number][]) {
    const held = snapshot.orders.filter(value => value.at === id).length;
    nodes.push(selectable(`putwall:${id}`, id, 'put-wall', p(x, PUT_WALL_Z), `Put wall ${id} · ${held} orders`, { count: Math.min(PUT_WALL_CAPACITY, held), state: held ? 'busy' : undefined, surfaceLabel: { kind: 'text', text: `PUT WALL ${id}`, color: '#ffffff', background: '#2c7a8c' } }));
  }

  // Packing: an open carton shows the order being packed.
  (Object.entries(PACK_X) as [PackStationId, number][]).forEach(([id, x], i) => {
    const current = snapshot.orders.find(value => value.at === id), staffed = i < snapshot.crew.packing;
    nodes.push(selectable(`pack:${id}`, id, 'station', p(x, PACK_Z), `Packing bench ${id}${current ? ` · ${current.id}` : ''}`, { variant: 'packing', rotation: yaw(BACK), state: !staffed ? 'inactive' : current ? 'busy' : undefined }));
    nodes.push(fixture(`pack:${id}:supply`, 'packaging-supply', p(x - 1, 4.4), { count: 6 - i }));
    if (current) nodes.push(fixture(`pack:${id}:carton`, 'parcel', [0, 0, 0], { variant: 'open', scale: [.55, .55, .55], attachment: { nodeId: `pack:${id}`, anchor: 'surface' } }));
  });

  // Dispatch: roll cages per parcel carrier, the wrapper for pallet freight and the outbound dock.
  for (const value of CARRIERS) cageCounts(snapshot, value.id).forEach((count, i) => {
    const id = value.cages[i];
    nodes.push(selectable(`cage:${id}`, value.id, 'roll-cage', p(CAGE_X[id], CAGE_Z), `${value.name} cage ${i + 1} · ${count} parcels`, { count, state: count ? undefined : 'inactive', ...live.cages[id], transfer: { seconds: .35, arc: 0 } }));
  });
  const freight = stagedFor(snapshot, 'freight').length > 0, wrapping = freight && snapshot.crew.dispatch > 0;
  nodes.push(selectable('wrapper', 'freight', 'stretch-wrapper', p(19.6, 3.4), freight ? 'Stretch wrapper · NordFreight pallet' : 'Stretch wrapper', { variant: wrapping ? 'wrapping' : 'empty', state: freight ? undefined : 'inactive' }));
  // The wrapping variant brings its own load; only an unstaffed wrapper shows the pallet waiting on its table.
  if (freight && !wrapping) nodes.push(fixture('wrapper:pallet', 'pallet', [0, 0, 0], { count: 18, attachment: { nodeId: 'wrapper', anchor: 'table' } }));

  // Docks open while a truck is being loaded or unloaded; trucks are live nodes that drive in and out.
  for (const dock of snapshot.docks) {
    const z = DOCK_Z[dock.id], active = dock.status === 'unloading' || dock.status === 'loading';
    nodes.push(selectable(`dock:${dock.id}`, dock.id, 'loading-dock', [DOCK_X, 0, z], `Dock ${dock.id} · ${dock.status}`, { variant: active ? 'open' : 'closed', rotation: yaw(HALF), state: dock.late ? 'warning' : active ? 'busy' : 'normal' }));
  }
  if (snapshot.parceloVan) nodes.push(fixture('van:parcelo', 'delivery-van', [29.6, APRON_Y, -2.4], { color: '#f2c14e', surfaceLabel: { kind: 'text', text: 'PARCELO', color: '#2a3646' } }));

  // Receiving check beside the staging lane.
  nodes.push(selectable('qa:station', 'receiving', 'station', p(STAGING_X, -6), 'Receiving check', { variant: 'inspection', state: snapshot.crew.receiving > 1 ? 'busy' : 'inactive' }));
  if (snapshot.crew.receiving > 1) nodes.push(person('receiver', p(STAGING_X, -4.95), BACK, 'working', STAFF, 'Receiving'));

  // Returns: the incoming tote shows items to inspect, the hold cage shows quarantined items.
  nodes.push(
    selectable('returns:station', 'returns', 'station', p(-4.5, PACK_Z), 'Returns inspection', { variant: 'inspection', rotation: yaw(BACK), state: snapshot.crew.returns ? 'busy' : 'inactive' }),
    selectable('returns:hold', 'hold', 'hold-cage', p(.3, 3.5), `Quarantine · ${snapshot.returns.held} held`, { count: Math.min(HOLD_CAPACITY, snapshot.returns.held), state: snapshot.returns.held ? 'warning' : undefined, surfaceLabel: { kind: 'text', text: 'HOLD', color: '#ffffff', background: '#9b4d5c' } }),
    fixture('returns:tote', 'tote', p(-7, 1.2), { count: Math.min(RETURNS_TOTE_CAPACITY, snapshot.returns.awaiting), scale: [.5, .5, .5] }),
  );
  if (snapshot.crew.returns) nodes.push(person('returns:inspector', p(-4.5, PACK_Z - 1.05), 0, 'working', STAFF, 'Returns'));
  return nodes;
}

export const DEFAULT_ZOOM = .95;

/** Scene node that shows where an order is: its put wall, bench, roll cage or counter, else its area. */
export function orderNodeId(snapshot: EcommerceSnapshot, order: Order): string {
  if (order.at === 'wrapper') return 'wrapper';
  if (order.at) return `${order.at.startsWith('P') ? 'putwall' : 'pack'}:${order.at}`;
  if (order.stage === 'collect') return 'collect:counter';
  if (order.stage === 'staged' && order.carrier) {
    const cages = CARRIERS.find(item => item.id === order.carrier)!.cages, index = stagedFor(snapshot, order.carrier).indexOf(order);
    if (cages.length) return `cage:${cages[Math.min(cages.length - 1, Math.floor(index / CAGE_CAPACITY))]}`;
  }
  return `area:${orderArea(order)}`;
}
