import type { AssetNode, SceneNode } from '@opsorama/core';
import type { DatacenterRecord } from './datacenter-data';

export interface DatacenterRoom { id: string; name: string; kind: 'hall' | 'power' | 'network' | 'operations' | 'battery'; center: readonly [number, number]; size: readonly [number, number]; purpose: string; }
export const datacenterRooms: readonly DatacenterRoom[] = [
  ...[[-10, -13], [14, -13], [-10, 13], [14, 13]].map(([x, z], index): DatacenterRoom => ({ id: `hall-0${index + 1}`, name: `Hall 0${index + 1}`, kind: 'hall', center: [x, z], size: [20, 18], purpose: '32 installed rack records · reserved growth strip' })),
  ...['a', 'b'].flatMap((side, index): DatacenterRoom[] => {
    const x = index ? 30 : -26, suffix = side.toUpperCase();
    return [
      { id: `electrical-${side}`, name: `Electrical ${suffix}`, kind: 'power', center: [x, -17], size: [12, 10], purpose: 'Switchgear and distribution · conceptual feed allocation' },
      { id: `ups-room-${side}`, name: `UPS room ${suffix}`, kind: 'power', center: [x, -7], size: [12, 8], purpose: 'Uninterruptible power equipment · host capacity unspecified' },
      { id: `carrier-${side}`, name: `Carrier room ${suffix}`, kind: 'network', center: [x, 1], size: [12, 6], purpose: 'Meet-me / carrier equipment · no inferred live topology' },
    ];
  }),
  { id: 'noc', name: 'NOC / operations', kind: 'operations', center: [-26, 9], size: [12, 8], purpose: 'Operator desks, monitoring wall and staffed reception' },
  { id: 'staging', name: 'Staging / spares', kind: 'operations', center: [-26, 18], size: [12, 8], purpose: 'Delivery inspection, preparation and spare equipment' },
  { id: 'battery-room-a', name: 'Battery room A', kind: 'battery', center: [30, 9], size: [12, 8], purpose: 'Dedicated battery cabinets · chemistry/runtime unspecified' },
  { id: 'battery-room-b', name: 'Battery room B', kind: 'battery', center: [30, 18], size: [12, 8], purpose: 'Physically separate battery zone · no redundancy certification' },
];
export const HALL_ROW_Z = [-3.795, -1.065, 1.065, 3.795] as const;
export function rackLocalPosition(slot: number): readonly [number, number, number] { return [-6 + slot % 8 * .95, .12, HALL_ROW_Z[Math.floor(slot / 8)]]; }
/** Site plan on the building's axis, x = 2. The ring road's tile centres, 6 m apart; the entrance leaves the south side on the axis. */
const SITE_X = 2, RING = Object.freeze({ west: -40, east: 44, north: -43, south: 35 });
/** Fence line, on the 3 m panel grid. Panels leave a two-panel gap for the entrance. */
const FENCE = Object.freeze({ west: -49, east: 53, north: -47, south: 40 });
/** Centre line of the plant row in the yard between the ring road and the building's north wall. */
const PLANT_Z = -32;
const ROAD_TILE = 6, FENCE_PANEL = 3, HALF_TURN = Math.PI, QUARTER_TURN = Math.PI / 2;
const siteFixture = (id: string, asset: string, x: number, z: number, extra: Partial<AssetNode> = {}): AssetNode => ({ id, kind: 'asset', asset, position: [x, 0, z], selectable: false, ...extra });
const steps = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** One-way loop around the building and plant yard. A corner tile opens west and south until it is turned. */
function ringRoad(): AssetNode[] {
  const { west, east, north, south } = RING, tile = (x: number, z: number, variant: string, heading = 0) => siteFixture(`road-${x}-${z}`, 'road', x, z, { variant, rotation: [0, heading, 0] });
  return [
    tile(west, north, 'corner', QUARTER_TURN), tile(east, north, 'corner'), tile(west, south, 'corner', HALF_TURN), tile(east, south, 'corner', -QUARTER_TURN),
    ...steps(west + ROAD_TILE, east - ROAD_TILE, ROAD_TILE).flatMap(x => [tile(x, north, 'straight'), tile(x, south, x === SITE_X ? 't-junction' : 'straight')]),
    ...steps(north + ROAD_TILE, south - ROAD_TILE, ROAD_TILE).flatMap(z => [tile(west, z, 'straight', QUARTER_TURN), tile(east, z, 'straight', QUARTER_TURN)]),
  ];
}

function perimeterFence(): AssetNode[] {
  const { west, east, north, south } = FENCE, panel = (x: number, z: number, heading = 0) => siteFixture(`fence-${x}-${z}`, 'fence-segment', x, z, { rotation: [0, heading, 0] });
  const panels = (from: number, to: number) => steps(from + FENCE_PANEL / 2, to - FENCE_PANEL / 2, FENCE_PANEL);
  return [
    ...panels(west, east).map(x => panel(x, north)),
    ...[...panels(west, SITE_X - 3), ...panels(SITE_X + 3, east)].map(x => panel(x, south)),
    ...panels(north, south).flatMap(z => [panel(west, z, QUARTER_TURN), panel(east, z, QUARTER_TURN)]),
  ];
}

/** Everything outside the building walls, laid out on one grid. Service and parking share the strip south of the building, either side of the entrance path. */
function siteNodes(): SceneNode[] {
  const treeRow = steps(-38, 34, 12), lampRow = steps(-32, 28, 20);
  return [
    { id: 'plant-yard', kind: 'asset', asset: 'floor', footprint: [64, 16], variant: 'concrete', position: [SITE_X, 0, PLANT_Z], label: 'OUTDOOR PLANT', color: '#bbc8ce', selectable: true },
    ...ringRoad(),
    siteFixture('site-entrance', 'terrain', SITE_X, 39.5, { variant: 'asphalt', footprint: [ROAD_TILE, 3] }),
    siteFixture('service-apron', 'floor', -16.5, 28, { variant: 'concrete', footprint: [31, 8], color: '#c0cbd2' }),
    siteFixture('entrance-path', 'terrain', SITE_X, 28, { variant: 'pavers', footprint: [6, 8] }),
    siteFixture('front-walk', 'sidewalk', 20.5, 25, { footprint: [31, 2] }),
    siteFixture('staff-parking', 'terrain', 21, 29.5, { variant: 'parking', footprint: [27.5, 5] }),
    { id: 'dock', kind: 'asset', asset: 'loading-dock', position: [-26, 0, 24], label: 'Staging dock', labelMode: 'active', selectable: true },
    { id: 'service-van', kind: 'asset', asset: 'delivery-van', position: [-26, 0, 29], rotation: [0, Math.PI, 0] },
    ...([[11, '#6b8fa8'], [16, '#d8dee4'], [23.5, '#8a9bb0']] as const).map(([x, color], i) => siteFixture(`parked-van-${i}`, 'delivery-van', x, 29.5, { color })),
    ...[28.5, 31].map((x, i) => siteFixture(`ev-charger-${i}`, 'ev-charger', x, 26.4)),
    ...perimeterFence(),
    siteFixture('entrance-gate-in', 'gate', SITE_X + 1.5, FENCE.south),
    siteFixture('entrance-gate-out', 'gate', SITE_X - 1.5, FENCE.south, { rotation: [0, HALF_TURN, 0] }),
    siteFixture('entrance-sign', 'sign', SITE_X + 6.5, 38.9, { surfaceLabel: { kind: 'text', text: 'DATACENTER', color: '#ffffff', background: '#2a6a85' } }),
    ...treeRow.flatMap(z => [FENCE.west + 3, FENCE.east - 3].map(x => siteFixture(`tree-${x}-${z}`, z % 24 ? 'tree' : 'tree-pine', x, z))),
    ...lampRow.flatMap(z => [RING.west + 3.6, RING.east - 3.6].map(x => siteFixture(`lamp-${x}-${z}`, 'lamp-post', x, z, { rotation: [0, x < SITE_X ? -QUARTER_TURN : QUARTER_TURN, 0] }))),
  ];
}

export function createFacilityNodes(records: readonly DatacenterRecord[]): SceneNode[] {
  const nodes: SceneNode[] = [
    { id: 'floor', kind: 'ground', size: [106, 90], position: [SITE_X, 0, -4], color: '#a9bca7' },
    { id: 'facility-shell', kind: 'asset', asset: 'building', position: [2, 0, 0], building: { size: [68, 5.5, 48], view: 'open', colors: { wall: '#8fa4b4', floor: '#c7d3dd' } } },
    { id: 'main-spine', kind: 'zone', size: [4, 47], position: [2, .1, 0], color: '#b6d8d5' },
    { id: 'cross-corridor', kind: 'zone', size: [44, 8], position: [2, .09, 0], color: '#b6d8d5' },
    ...siteNodes(),
  ];
  for (const room of datacenterRooms) {
    const hall = room.kind === 'hall';
    nodes.push({ id: room.id, entityId: room.id.toUpperCase(), kind: 'asset', asset: 'building', position: [room.center[0], .12, room.center[1]], label: hall ? `${room.name} · 32 racks` : room.name, selectable: true,
      building: { size: [room.size[0], 4.2, room.size[1]], view: 'open', colors: { floor: hall ? '#d8e2e8' : room.kind === 'power' || room.kind === 'battery' ? '#d4d5e3' : room.kind === 'network' ? '#c8d9e2' : '#d6dfd5', wall: '#a7b7c6' } } });
    if (hall) {
      for (const z of [-2.43, 2.43]) {
        nodes.push({ id: `${room.id}-cold-${z}`, parentId: room.id, kind: 'zone', size: [9.6, 1.8], position: [-2.7, .04, z], color: '#69afc7' });
        for (const x of [-7.5, 2.1]) nodes.push({ id: `${room.id}-portal-${x}-${z}`, parentId: room.id, kind: 'asset', asset: 'aisle-containment', position: [x, .12, z], rotation: [0, Math.PI / 2, 0] });
        for (let i = 0; i < 4; i++) nodes.push({ id: `${room.id}-canopy-${i}-${z}`, parentId: room.id, kind: 'asset', asset: 'aisle-containment', variant: 'roof', position: [-6.3 + i * 2.4, 2.79, z] });
      }
      for (const z of [-4.86, 0, 4.86]) nodes.push({ id: `${room.id}-warm-${z}`, parentId: room.id, kind: 'zone', size: [9.6, 1.2], position: [-2.7, .035, z], color: '#d5b995' });
      nodes.push({ id: `${room.id}-growth`, parentId: room.id, kind: 'zone', size: [4, 13], position: [6.2, .03, 0], color: '#dce3e7' });
      nodes.push({ id: `${room.id}-growth-sign`, parentId: room.id, kind: 'asset', asset: 'order-ticket', position: [6.2, .12, 5], surfaceLabel: { kind: 'text', text: 'RESERVED' }, color: '#8ca3b5' });
      const hallRecords = records.filter(record => record.roomId === room.id);
      hallRecords.forEach((record, slot) => nodes.push({ id: record.id, parentId: room.id, entityId: record.id === 'rack' ? 'RACK-A01' : record.id.toUpperCase(), kind: 'asset', asset: 'equipment-cabinet', variant: 'overview', count: record.mountedUnits,
        position: rackLocalPosition(slot), rotation: [0, Math.floor(slot / 8) % 2 ? Math.PI : 0, 0], label: record.name, labelMode: 'active', selectable: true }));
      for (let row = 0; row < 4; row++) nodes.push({ id: room.id === 'hall-01' ? ['cooling', 'cooling-b', 'cooling-c', 'cooling-d'][row] : `${room.id}-cooling-${row}`, parentId: room.id, entityId: room.id === 'hall-01' ? `COOLING-${String.fromCharCode(65 + row)}` : `${room.id}-COOLING-${row}`, kind: 'asset', asset: 'cooling-unit', position: [-7.1, .12, HALL_ROW_Z[row]], rotation: [0, row % 2 ? Math.PI : 0, 0], label: room.id === 'hall-01' ? `Cooling ${String.fromCharCode(65 + row)}` : `${room.name} cooling ${row + 1}`, labelMode: 'active', selectable: true });
    } else if (room.id.startsWith('electrical-')) {
      for (let i = 0; i < 2; i++) nodes.push({ id: `${room.id}-gear-${i}`, parentId: room.id, kind: 'asset', asset: 'electrical-switchgear', position: [-2.2 + i * 4.4, .12, -2], label: `${room.name} switchgear ${i + 1}`, labelMode: 'active', selectable: true });
    } else if (room.id.startsWith('ups-room-')) {
      for (let i = 0; i < 4; i++) nodes.push({ id: i === 0 ? room.id.endsWith('a') ? 'ups' : 'ups-b' : `${room.id}-unit-${i}`, parentId: room.id, entityId: i === 0 ? room.id.endsWith('a') ? 'UPS-A' : 'UPS-B' : `${room.id}-UPS-${i}`, kind: 'asset', asset: 'ups-unit', count: room.id.endsWith('a') && i === 0 ? 4 : 6, position: [-2.7 + i * 1.8, .12, -1], label: i === 0 ? room.id.endsWith('a') ? 'UPS A' : 'UPS B' : `${room.name} cabinet ${i + 1}`, labelMode: 'active', selectable: true });
    } else if (room.kind === 'battery') {
      for (let i = 0; i < 6; i++) nodes.push({ id: `${room.id}-bank-${i}`, parentId: room.id, kind: 'asset', asset: 'battery-bank', position: [-3 + i % 3 * 3, .12, i < 3 ? -1.6 : 1.6], rotation: [0, i < 3 ? 0 : Math.PI, 0], label: `${room.name} string ${i + 1}`, labelMode: 'active', selectable: true });
    } else if (room.kind === 'network') {
      for (let i = 0; i < 4; i++) nodes.push({ id: `${room.id}-rack-${i}`, parentId: room.id, kind: 'asset', asset: 'equipment-cabinet', variant: 'overview', count: 6, position: [-2.4 + i * 1.6, .12, -1], label: `${room.name} network cabinet ${i + 1}`, labelMode: 'active', selectable: true });
    } else if (room.id === 'noc') {
      nodes.push({ id: 'noc-desks', parentId: room.id, kind: 'asset', asset: 'desk-pod', count: 4, position: [0, .12, .5] });
      nodes.push({ id: 'noc-display', parentId: room.id, kind: 'asset', asset: 'information-board', position: [0, .12, -2.5], surfaceLabel: { kind: 'text', layout: 'multiline', text: 'OPERATIONS\n4 IT HALLS\n128 RACKS\nMOCK DATA' } });
      nodes.push({ id: 'noc-plant', parentId: room.id, kind: 'asset', asset: 'potted-plant', position: [-4.3, .12, 2.3] });
    } else {
      nodes.push({ id: 'staging-shelf', parentId: room.id, kind: 'asset', asset: 'shelf', count: 4, position: [-2.5, .12, -2] });
      nodes.push({ id: 'staging-pallet', parentId: room.id, kind: 'asset', asset: 'pallet', count: 6, position: [2.8, .12, -.8] });
      nodes.push({ id: 'staging-bench', parentId: room.id, kind: 'asset', asset: 'station', position: [-2.5, .12, 1.5] });
    }
  }
  for (let i = 0; i < 3; i++) {
    nodes.push({ id: `generator-${i + 1}`, kind: 'asset', asset: 'generator-set', position: [-24 + i * 10, 0, PLANT_Z], label: `Standby generator ${i + 1}`, labelMode: 'active', selectable: true });
    nodes.push({ id: `chiller-${i + 1}`, kind: 'asset', asset: 'air-cooled-chiller', position: [8 + i * 10, 0, PLANT_Z], rotation: [0, Math.PI / 2, 0], label: `Chiller ${i + 1}`, labelMode: 'active', selectable: true });
  }
  const rack = nodes.find(node => node.id === 'rack')!;
  const [x, , z] = rack.position!;
  nodes.push(
    { id: 'server-a', parentId: 'hall-01', entityId: 'SERVER-A', kind: 'asset', asset: 'rack-server', variant: '2u', position: [x, 1.62, z], label: 'Server A', labelMode: 'active', selectable: true },
    { id: 'server-b', parentId: 'hall-01', entityId: 'SERVER-B', kind: 'asset', asset: 'rack-server', variant: '1u', position: [x, 1.79, z], label: 'Server B', labelMode: 'active', selectable: true },
    { id: 'switch', parentId: 'hall-01', entityId: 'SWITCH-A', kind: 'asset', asset: 'network-switch', count: 12, position: [x, 1.94, z + .25], label: 'Switch A', labelMode: 'active', selectable: true },
  );
  return nodes;
}
