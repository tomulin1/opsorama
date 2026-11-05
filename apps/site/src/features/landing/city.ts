import { placeSceneNodes, type AssetNode, type MarkerNode, type NodeRoute, type SceneNode, type Vec3 } from '@opsorama/core';
import { datacenterIncidents, datacenterRecords, makeDatacenterStore, setDatacenterRoom } from '../../../examples/datacenter-data';
import { datacenterRooms } from '../../../examples/datacenter-facility';
import { siteEnergyDefinition } from '../../../examples/site-energy-data';
import { aquaticsMetrics, aquaticsNodes, SCENARIOS as AQUATICS } from '../aquatics/model';
import { ecommerceMetrics, type EcommerceSnapshot } from '../ecommerce/model';
import { APRON_Y, ROAD_Z, SITE_WEST_X } from '../ecommerce/scene';
import { farmMetrics, SCENARIOS as FARM } from '../farm/model';
import { farmNodes } from '../farm/scene';
import { officeMetrics, SCENARIOS as OFFICE } from '../office/model';
import { officeNodes } from '../office/scene';
import { restaurantMetrics, restaurantNodes, SCENARIOS as RESTAURANT } from '../restaurant/model';

/**
 * The home page city. Each district is a whole domain example: its own node function runs unchanged
 * and `placeSceneNodes` puts the result on a plot, so a change to an example shows up here too.
 * This file adds only what lies between the examples: ground, streets, trees and traffic.
 */
export type DistrictId = 'ecommerce' | 'office' | 'restaurant' | 'aquatics' | 'farm' | 'datacenter';
export interface District {
  id: DistrictId;
  name: string;
  /** Route of the full example. */
  href: string;
  summary: string;
  /** Toolkit capabilities this district shows. */
  shows: readonly string[];
  /** Plot of the example's origin in city metres. */
  offset: Vec3;
  /** Node ID in the example's scene that the camera fits when the district opens. */
  focusNode: string;
  /** Where the district pin stands, in the example's own metres. */
  pin: readonly [x: number, z: number];
}

const HALF = Math.PI / 2;
/** City bounds in metres. The avenue's centre line is z = 0; the trucks of the e-commerce yard leave over the east edge, as they do in the example. */
export const CITY = Object.freeze({ west: -216, east: 12, north: -141, south: 3.3 });
/** Centre lines of the streets, on the 6 m road grid of the avenue. */
const AVENUE_Z = 0, MIDDLE_Z = -42, CROSS_X = [-177, -123, -63] as const, NORTH_ROAD_X = -123, ROAD_END_Z = -138;

export const DISTRICTS: readonly District[] = [
  { id: 'ecommerce', name: 'Online shop & warehouse', href: '/examples/ecommerce', summary: 'A mock feed moves real pallets, totes and parcels through a shop and a fulfilment centre. Records change only when an object arrives.', shows: ['Live material flow', 'Handling state', 'Vehicles and people'], offset: [-25, 0, -ROAD_Z], focusNode: 'ground', pin: [-2, -10] },
  { id: 'office', name: 'Open-plan office', href: '/examples/office', summary: 'People, presence, tickets and room bookings in one floor plan, coloured by the project of the current ticket.', shows: ['Record-driven placement', 'Person figures', 'Data panels'], offset: [-150, 0, -17], focusNode: 'ground', pin: [0, -1] },
  { id: 'restaurant', name: 'Restaurant', href: '/examples/restaurant', summary: 'Tables from seating to bill, kitchen tickets to the pass and takeout bags to pickup.', shows: ['Status at a glance', 'Host alerts', 'Attached objects'], offset: [-199, 0, -14.9], focusNode: 'ground', pin: [0, -2] },
  { id: 'aquatics', name: 'Aquatic centre', href: '/examples/aquatics', summary: 'Lane bookings and occupancy, lifeguard cover and water quality around two pools.', shows: ['Route-driven motion', 'Measured readings', 'Capacity'], offset: [-93, 0, -19.5], focusNode: 'ground', pin: [-6, 0] },
  { id: 'farm', name: 'Farm', href: '/examples/farm', summary: 'Pens, troughs and tagged animals, fields and the day’s chores on a mixed farm.', shows: ['Animals and terrain', 'Fill levels', 'Exact counts in panels'], offset: [-172, 0, -73.5], focusNode: 'ground', pin: [0, -4] },
  { id: 'datacenter', name: 'Datacenter', href: '/examples/datacenter', summary: 'A four-hall facility with 128 racks, support rooms and outdoor plant. Follow an alert to its rack.', shows: ['Building containers', 'Scale', 'Alert drill-down'], offset: [-58, 0, -88.5], focusNode: 'floor', pin: [0, -4] },
];

/** ID of a district's pin, the node a selection in the city rests on. */
export const districtPinId = (id: DistrictId) => `district:${id}`;
/** ID of the node the camera fits when a district opens. */
export const districtFocusId = (district: District) => `${district.id}:${district.focusNode}`;

const yaw = (value: number): Vec3 => [0, value, 0];
const fixture = (id: string, asset: string, position: Vec3, extra: Partial<AssetNode> = {}): AssetNode => ({ id: `city:${id}`, kind: 'asset', asset, position, selectable: false, ...extra });
const at = (x: number, z: number, y = 0): Vec3 => [x, y, z];
/** Deterministic sequence, so the city looks the same on every visit. */
function seeded(seed: number): () => number { let value = seed; return () => (value = value * 16807 % 2147483647) / 2147483647; }

/** Scene markers are labels with no geometry, so the city leaves them out with the other labels. */
const withoutMarkers = (nodes: readonly SceneNode[]) => nodes.filter((node): node is Exclude<SceneNode, MarkerNode> => node.kind !== 'marker');

/** One district's example nodes on its plot. Every object opens the district, and the examples' own labels stay in the examples. */
function inDistrict(id: DistrictId, offset: Vec3, nodes: readonly SceneNode[]): SceneNode[] {
  return withoutMarkers(placeSceneNodes(nodes, { idPrefix: `${id}:`, offset })).map(node => {
    const quiet = { ...node, entityId: id, selectable: true };
    delete quiet.label; delete quiet.labelMode;
    return quiet;
  });
}

function datacenterOverview(): readonly SceneNode[] {
  const store = makeDatacenterStore();
  setDatacenterRoom(store, 'overview');
  const { nodes } = store.getSnapshot();
  store.dispose();
  return nodes;
}

/** Ground around the plots. The e-commerce truck apron is sunken, so the ground leaves it open; the slab under everything gives the overview camera the whole city. */
function cityGround(): SceneNode[] {
  const { west, east, north, south } = CITY, shop = DISTRICTS[0], shopWest = shop.offset[0] + SITE_WEST_X, shopNorth = shop.offset[2] - 22.45, color = '#d3dfcf';
  const piece = (id: string, x0: number, x1: number, z0: number, z1: number, y = -.03): SceneNode => ({ id: `city:${id}`, kind: 'ground', size: [x1 - x0, z1 - z0], position: [(x0 + x1) / 2, y, (z0 + z1) / 2], color });
  return [piece('slab', west + 1.5, east - 1.5, north + 1.5, south - 1.5, APRON_Y - .3), piece('ground-west', west, shopWest, north, south), piece('ground-north', shopWest, east, north, shopNorth)];
}

function roads(): AssetNode[] {
  const tile = (x: number, z: number, variant: string, heading = 0) => fixture(`road:${x}:${z}`, 'road', at(x, z), { variant, rotation: yaw(heading) });
  const nodes: AssetNode[] = [];
  for (let x = CITY.east - 3; x >= CITY.west + 3; x -= 6) {
    const crossing = (CROSS_X as readonly number[]).includes(x);
    // Branches of a t-junction open to +z, so the avenue's tiles turn to open north.
    nodes.push(crossing ? tile(x, AVENUE_Z, 't-junction', Math.PI) : tile(x, AVENUE_Z, x === -39 ? 'crosswalk' : 'straight'));
    nodes.push(tile(x, MIDDLE_Z, x === NORTH_ROAD_X ? 'crossroads' : crossing ? 't-junction' : 'straight'));
  }
  for (const x of CROSS_X) for (let z = AVENUE_Z - 6; z > MIDDLE_Z; z -= 6) nodes.push(tile(x, z, 'straight', HALF));
  for (let z = MIDDLE_Z - 6; z >= ROAD_END_Z; z -= 6) nodes.push(tile(NORTH_ROAD_X, z, 'straight', HALF));
  return nodes;
}

function sidewalks(): AssetNode[] {
  const WIDTH = 2, nodes: AssetNode[] = [];
  /** A walk along x; the curb faces the road, which lies on the `road` side. */
  const alongX = (x0: number, x1: number, z: number, road: 'north' | 'south') => nodes.push(fixture(`walk:${x0}:${z}`, 'sidewalk', at((x0 + x1) / 2, z), { footprint: [x1 - x0, WIDTH], rotation: yaw(road === 'north' ? Math.PI : 0) }));
  /** A walk along z; the curb faces the road, which lies on the `road` side. */
  const alongZ = (x: number, z0: number, z1: number, road: 'east' | 'west') => nodes.push(fixture(`walk:${x}:${z0}`, 'sidewalk', at(x, (z0 + z1) / 2), { footprint: [z1 - z0, WIDTH], rotation: yaw(road === 'east' ? HALF : -HALF) }));
  const blocks = [[-216, -180], [-174, -126], [-120, -66]] as const;
  for (const [x0, x1] of blocks) { alongX(x0, x1, -4, 'south'); alongX(x0, x1, -38, 'north'); }
  alongX(-60, CITY.east, -38, 'north');
  alongX(-216, -126, -46, 'south'); alongX(-120, -60, -46, 'south'); alongX(-60, CITY.east, -46, 'south');
  for (const x of CROSS_X) { alongZ(x - 4, -37, -5, 'east'); alongZ(x + 4, -37, -5, 'west'); }
  alongZ(NORTH_ROAD_X - 4, CITY.north, -47, 'east'); alongZ(NORTH_ROAD_X + 4, CITY.north, -47, 'west');
  return nodes;
}

function greenery(): AssetNode[] {
  const nodes: AssetNode[] = [], random = seeded(41);
  const tree = (id: string, x: number, z: number) => nodes.push(fixture(`tree:${id}`, random() < .35 ? 'tree-pine' : 'tree', at(x, z), { rotation: yaw(random() * Math.PI * 2) }));
  // Rows on the lawns north of the avenue blocks and behind the warehouse.
  for (let x = -212; x <= -184; x += 7) tree(`restaurant:${x}`, x, -32.5);
  for (let x = -170; x <= -132; x += 7) tree(`office:${x}`, x, -34);
  for (let x = -50; x <= 6; x += 8) tree(`shop:${x}`, x, -35);
  // Trees along the west and east ends of the back row.
  for (let z = -52; z >= -96; z -= 8) { tree(`west:${z}`, -212.5, z); tree(`farm-east:${z}`, -131, z); }
  // A wood around the energy park behind the farm.
  for (let i = 0; i < 46; i++) {
    const x = -213 + random() * 83, z = -138 + random() * 34;
    if (x > -191 && x < -153 && z > -131 && z < -105) continue;
    tree(`wood:${i}`, x, z);
  }
  return nodes;
}

function streetLife(): AssetNode[] {
  // Lamps stand on the kerb side of the avenue; the warehouse block brings its own street front.
  const lamps = [-204, -186, -162, -138, -108, -84].map(x => fixture(`lamp:${x}`, 'lamp-post', at(x, -3.7), { rotation: yaw(Math.PI) }));
  // Traffic keeps right: eastbound on the south lane, northbound on the east lane, and so on.
  const LANE = 1.5, loop = (points: readonly Vec3[], speed: number, elapsed = 0): NodeRoute => ({ points: [...points, points[0]], speed, loop: true, elapsed });
  const aroundBlock = (west: number, east: number, north = MIDDLE_Z, south = AVENUE_Z): Vec3[] => [at(west - LANE, south + LANE), at(east + LANE, south + LANE), at(east + LANE, north - LANE), at(west - LANE, north - LANE)];
  const pool = aroundBlock(CROSS_X[1], CROSS_X[2]), office = aroundBlock(CROSS_X[0], CROSS_X[1]);
  const north: Vec3[] = [at(NORTH_ROAD_X + LANE, MIDDLE_Z - 6), at(NORTH_ROAD_X + LANE, ROAD_END_Z), at(NORTH_ROAD_X - LANE, ROAD_END_Z), at(NORTH_ROAD_X - LANE, MIDDLE_Z - 6)];
  const vehicle = (id: string, asset: string, points: readonly Vec3[], speed: number, elapsed: number, color?: string) => fixture(`traffic:${id}`, asset, points[0], { route: loop(points, speed, elapsed), ...(color ? { color } : {}) });
  const traffic = [
    vehicle('van-1', 'delivery-van', pool, 8, 0, '#f2c14e'), vehicle('truck-1', 'truck', pool, 7, 11), vehicle('bike-1', 'cargo-bike', pool, 4, 40),
    vehicle('van-2', 'delivery-van', office, 8, 5, '#d9694f'), vehicle('van-3', 'delivery-van', office, 8, 24), vehicle('van-4', 'delivery-van', north, 7, 8, '#3f8f7a'),
  ];
  const walkers = ([[-210, -186, -4], [-170, -130, -4], [-116, -72, -4], [-170, -130, -46], [-112, -70, -46], [-50, -8, -38]] as const).map(([from, to, z], i) =>
    fixture(`walker:${i}`, 'visitor', at(from, z), { variant: 'walking', route: loop([at(from, z, .12), at(to, z, .12)], 1.3, i * 9) }));
  return [...lamps, ...traffic, ...walkers];
}

function energyPark(): AssetNode[] {
  const panels = [[-205, -128], [-205, -120], [-205, -112]].map(([x, z], i) => fixture(`solar:${i}`, 'solar-array', at(x, z), { count: 6 }));
  const turbines = [[-210, -137], [-176, -137.5], [-142, -137]].map(([x, z], i) => fixture(`turbine:${i}`, 'wind-turbine', at(x, z)));
  return [...panels, ...turbines];
}

/** Scene nodes that show where a district opens. Labels on these pins are the only labels in the city. */
function districtPins(): AssetNode[] {
  return DISTRICTS.map(district => ({ id: districtPinId(district.id), entityId: district.id, kind: 'asset', asset: 'map-pin', position: at(district.offset[0] + district.pin[0], district.offset[2] + district.pin[1]), color: '#2f6f8f', label: district.name, labelMode: 'always', selectable: true }));
}

/** The e-commerce feed's nodes on their plot. The city's avenue replaces the example's own street. */
export function placeEcommerce(nodes: readonly SceneNode[]): SceneNode[] {
  return inDistrict('ecommerce', DISTRICTS[0].offset, nodes.filter(node => !/^road-\d+$/.test(node.id)));
}

const offsetOf = (id: DistrictId) => DISTRICTS.find(district => district.id === id)!.offset;

/** Everything in the city except the live e-commerce district. Call it once: it composes every static example. */
export function cityStaticNodes(): SceneNode[] {
  return [
    ...cityGround(), ...roads(), ...sidewalks(), ...greenery(), ...streetLife(), ...energyPark(), ...districtPins(),
    ...inDistrict('office', offsetOf('office'), officeNodes(OFFICE.planning)),
    ...inDistrict('restaurant', offsetOf('restaurant'), restaurantNodes(RESTAURANT.rush)),
    ...inDistrict('aquatics', offsetOf('aquatics'), aquaticsNodes(AQUATICS.afternoon)),
    ...inDistrict('farm', offsetOf('farm'), farmNodes(FARM.heat)),
    ...inDistrict('datacenter', offsetOf('datacenter'), datacenterOverview()),
    ...withoutMarkers(placeSceneNodes(siteEnergyDefinition.nodes, { idPrefix: 'energy:', offset: [-172, 0, -118] })).map(node => ({ ...node, label: undefined, selectable: false })),
  ];
}

export interface DistrictFact { label: string; value: string; }

/** Readings of a district, from the same metric functions its example's HUD uses. */
export function districtFacts(id: DistrictId, ecommerce: EcommerceSnapshot): readonly DistrictFact[] {
  switch (id) {
    case 'ecommerce': { const metrics = ecommerceMetrics(ecommerce); return [{ label: 'Open orders', value: `${metrics.open}` }, { label: 'At risk', value: `${metrics.atRisk}` }, { label: 'Shoppers', value: `${metrics.shoppers}` }]; }
    case 'office': { const metrics = officeMetrics(OFFICE.planning); return [{ label: 'In the office', value: `${metrics.present}` }, { label: 'In progress', value: `${metrics.inProgress}` }, { label: 'Blocked', value: `${metrics.blocked}` }]; }
    case 'restaurant': { const metrics = restaurantMetrics(RESTAURANT.rush); return [{ label: 'Guests', value: `${metrics.guests}` }, { label: 'Open tickets', value: `${metrics.tickets}` }, { label: 'Late', value: `${metrics.late}` }]; }
    case 'aquatics': { const metrics = aquaticsMetrics(AQUATICS.afternoon); return [{ label: 'In the water', value: `${metrics.inWater} / ${metrics.capacity}` }, { label: 'Lanes open', value: `${metrics.lanesOpen} / ${metrics.lanes}` }, { label: 'Lifeguards', value: `${metrics.onPost} / ${metrics.posts}` }]; }
    case 'farm': { const metrics = farmMetrics(FARM.heat); return [{ label: 'Animals', value: `${metrics.animals}` }, { label: 'Alerts', value: `${metrics.alerts}` }, { label: 'Open chores', value: `${metrics.open}` }]; }
    case 'datacenter': return [{ label: 'Racks', value: `${datacenterRecords.length}` }, { label: 'Rooms', value: `${datacenterRooms.length}` }, { label: 'Incidents', value: `${datacenterIncidents.length}` }];
  }
}
