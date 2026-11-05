import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AssetNode, GroundNode, SceneNode } from '@opsorama/core';
import { TRUCK, basicAssets, disposeObject } from '@opsorama/renderer-three';
import { AREAS, CAGE_CAPACITY, CARRIERS, COLLECT_CAPACITY, DEPARTMENTS, LOCATIONS, SCENARIOS, SKUS, cageCounts, cutoffRisk, ecommerceMetrics, orderArea, ordersIn, shoppers, stagedFor, type EcommerceScenario } from '../src/features/ecommerce/model';
import { APRON_Y, DOCK_Z, FLOOR_Y, ROAD_Z, SITE_EAST_X, SITE_WEST_X, TRUCK_X, YARD_X, ecommerceBase, ecommerceNodes, orderNodeId, warehouseNavigation } from '../src/features/ecommerce/scene';
import { createEcommerceSimulation, createEcommerceStore } from '../src/features/ecommerce/simulation';

const asset = (nodes: readonly SceneNode[], id: string) => nodes.find(node => node.id === id) as AssetNode;
const scenarios = Object.keys(SCENARIOS) as EcommerceScenario[];
/** Scene nodes of a scenario's starting state. */
const startNodes = (scenario: EcommerceScenario) => { const simulation = createEcommerceSimulation(scenario), nodes = simulation.nodes(); simulation.dispose(); return nodes; };

describe('e-commerce truck yard', () => {
  const footprint = (asset: string, position: readonly number[], rotation = 0) => {
    const model = basicAssets[asset]({ id: asset, kind: 'asset', asset }); model.position.set(position[0], position[1], position[2]); model.rotation.y = rotation; model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model); disposeObject(model); return box;
  };
  /** Docked and arriving trucks along x, between the dock and the point past the site edge. */
  const docked = (z: number) => footprint('truck', [TRUCK_X, APRON_Y, z], Math.PI / 2);

  it('docks the truck tail at the dock edge with its cargo floor level with the hall floor', () => {
    expect(APRON_Y + TRUCK.floorTop).toBeCloseTo(FLOOR_Y);
    const dock = footprint('loading-dock', [22.6, 0, DOCK_Z.D1], Math.PI / 2), base = 23.2;
    expect(dock.max.x).toBeGreaterThan(docked(DOCK_Z.D1).min.x); expect(docked(DOCK_Z.D1).min.x).toBeCloseTo(base, 1);
    expect(docked(DOCK_Z.D1).min.y).toBeCloseTo(APRON_Y);
  });
  it('keeps every truck inside the yard, clear of its neighbour, and appears past the site edge', () => {
    const [d1, d2, d3] = [docked(DOCK_Z.D1), docked(DOCK_Z.D2), docked(DOCK_Z.D3)], yard = asset(ecommerceBase as SceneNode[], 'yard');
    const [x, , z] = yard.position!, [width, depth] = yard.footprint as readonly [number, number];
    for (const truck of [d1, d2, d3]) { expect(truck.max.x).toBeLessThan(x + width / 2); expect(truck.min.z).toBeGreaterThan(z - depth / 2); expect(truck.max.z).toBeLessThan(z + depth / 2); }
    expect(d1.intersectsBox(d2)).toBe(false); expect(d2.min.z - d1.max.z).toBeGreaterThan(.8);
    expect(YARD_X - TRUCK.length / 2).toBeGreaterThan(x + width / 2);
  });
  it('parks the Parcelo van clear of the docked trucks and of the D3 lane', () => {
    const van = asset(startNodes('steady'), 'van:parcelo'), box = footprint('delivery-van', van.position!);
    expect(van.position![1]).toBeCloseTo(APRON_Y);
    for (const id of ['D2', 'D3'] as const) expect(box.intersectsBox(footprint('truck', [32, APRON_Y, DOCK_Z[id]], Math.PI / 2))).toBe(false);
  });
});

describe('e-commerce street', () => {
  const road = ecommerceBase.filter(node => node.id.startsWith('road-')) as AssetNode[], xs = road.map(node => node.position![0]);

  it('runs the road exactly from edge to edge of the site', () => {
    expect(Math.min(...xs) - 3).toBe(SITE_WEST_X); expect(Math.max(...xs) + 3).toBe(SITE_EAST_X);
    for (const id of ['ground-west', 'ground-south', 'ground-back']) {
      const ground = (ecommerceBase as readonly SceneNode[]).find(node => node.id === id) as GroundNode, [x] = ground.position!;
      expect(x - ground.size[0] / 2).toBeGreaterThanOrEqual(SITE_WEST_X); expect(x + ground.size[0] / 2).toBeLessThanOrEqual(SITE_EAST_X);
    }
    // The tiles chain without a gap, and the crosswalk stays in front of the shop door.
    xs.slice(1).forEach((x, i) => expect(x - xs[i]).toBe(6));
    expect(road.filter(node => node.variant === 'crosswalk').map(node => node.position![0])).toEqual([-14]);
  });
  it('keeps every tree off the road', () => {
    for (const node of ecommerceBase as readonly SceneNode[]) {
      if (!node.id.startsWith('tree-')) continue;
      const object = basicAssets[(node as AssetNode).asset](node as AssetNode); object.position.set(...node.position as [number, number, number]); object.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object); disposeObject(object);
      expect(box.max.z < ROAD_Z - 3 || box.min.z > ROAD_Z + 3, node.id).toBe(true);
    }
  });
});

describe('e-commerce dashboard model', () => {
  it('shows one pallet on the stretch wrapper', () => {
    const staffed = ecommerceNodes(SCENARIOS.peak, { movers: [], cages: {} }), unstaffed = ecommerceNodes({ ...SCENARIOS.peak, crew: { ...SCENARIOS.peak.crew, dispatch: 0 } }, { movers: [], cages: {} });
    expect(stagedFor(SCENARIOS.peak, 'freight').length).toBeGreaterThan(0);
    expect(asset(staffed, 'wrapper').variant).toBe('wrapping'); expect(asset(staffed, 'wrapper:pallet')).toBeUndefined();
    expect(asset(unstaffed, 'wrapper').variant).toBe('empty'); expect(asset(unstaffed, 'wrapper:pallet')).toBeDefined();
  });

  it('builds a valid store for every scenario and replaces it without stale people', () => {
    const store = createEcommerceStore('peak');
    for (const scenario of [...scenarios, 'peak'] as const) {
      store.replace(startNodes(scenario));
      const nodes = store.getSnapshot().nodes, snapshot = SCENARIOS[scenario];
      expect(nodes.filter(node => node.id.startsWith('picker:') && !node.id.endsWith(':cart')), scenario).toHaveLength(Math.min(3, snapshot.crew.picking));
      expect(nodes.filter(node => node.id.startsWith('packer:')), scenario).toHaveLength(snapshot.crew.packing);
      // Every attachment points at a node in the same snapshot.
      for (const node of nodes) if (node.attachment) expect(nodes.some(other => other.id === node.attachment!.nodeId), node.id).toBe(true);
    }
    store.dispose();
  });

  it('keeps the reference data consistent', () => {
    expect(new Set(AREAS.map(item => item.id)).size).toBe(AREAS.length);
    for (const sku of Object.values(SKUS)) { expect(LOCATIONS.some(item => item.id === sku.pick && item.kind !== 'rack')).toBe(true); expect(LOCATIONS.some(item => item.id === sku.reserve && item.kind === 'rack')).toBe(true); }
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario];
      expect(new Set(snapshot.orders.map(order => order.id)).size, scenario).toBe(snapshot.orders.length);
      for (const order of snapshot.orders) for (const line of order.lines) { expect(SKUS[line.sku], `${order.id} ${line.sku}`).toBeDefined(); expect(line.picked).toBeLessThanOrEqual(line.quantity); }
      for (const value of LOCATIONS) { expect(snapshot.occupancy[value.id]).toBeGreaterThanOrEqual(0); expect(snapshot.occupancy[value.id]).toBeLessThanOrEqual(value.capacity); }
      for (const value of DEPARTMENTS) expect(snapshot.shop.facings[value.id]).toBeLessThanOrEqual(48);
    }
  });

  it('shows exact bounded counts from the snapshot on the models', () => {
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], nodes = startNodes(scenario);
      // Racks hold real pallet units; the other locations show their records as counts.
      for (const value of LOCATIONS) expect(asset(nodes, `${value.kind}:${value.id}`).count, value.id).toBe(value.kind === 'rack' ? 0 : snapshot.occupancy[value.id]);
      for (const value of CARRIERS) {
        const counts = cageCounts(snapshot, value.id);
        value.cages.forEach((cage, i) => expect(asset(nodes, `cage:${cage}`).count).toBe(counts[i]));
        if (value.cages.length) expect(counts.reduce((a, b) => a + b, 0)).toBe(Math.min(stagedFor(snapshot, value.id).length, value.cages.length * CAGE_CAPACITY));
      }
      expect(asset(nodes, 'collect:counter').count).toBe(Math.min(COLLECT_CAPACITY, ordersIn(snapshot, 'collect').length));
      // One figure per customer in the shop.
      const figures = nodes.filter(node => /^shopper:\d+$/.test(node.id)).length;
      expect(figures, scenario).toBe(snapshot.shopOpen ? shoppers(snapshot) : 0);
      for (const dock of snapshot.docks) expect(nodes.some(node => node.id === `truck:${dock.id}`)).toBe(dock.status === 'unloading' || dock.status === 'loading');
    }
  });

  it('summarizes the peak from the same records the panels show', () => {
    const peak = SCENARIOS.peak, metrics = ecommerceMetrics(peak);
    expect(metrics.open).toBe(peak.orders.length);
    expect(metrics.atRisk).toBe(peak.orders.filter(order => order.carrier === 'swift' && ['released', 'picking', 'sorting', 'packing'].includes(order.stage)).length);
    expect(metrics.atRisk).toBeGreaterThan(0); expect(metrics.out).toBe(1); expect(metrics.nextCutoff?.id).toBe('swift');
    expect(cutoffRisk(SCENARIOS.night, peak.orders[0])).toBeNull();
    expect(ecommerceMetrics(SCENARIOS.steady).atRisk).toBe(0);
    // Every order resolves to a node that exists in the scene.
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], ids = new Set(startNodes(scenario).map(node => node.id));
      for (const order of snapshot.orders) { expect(ids.has(orderNodeId(snapshot, order)), order.id).toBe(true); expect(AREAS.some(item => item.id === orderArea(order))).toBe(true); }
    }
  });

  it('keeps every vehicle and robot on its own lane', () => {
    const lanes = { robot: ['amr-discharge', 'amr-P2'], forklift: ['apron-d1', 'apron-d2'], 'reach-truck': ['aisle:R02', 'rack:R02:load-1'] } as const;
    for (const [agent, points] of Object.entries(lanes)) {
      expect(warehouseNavigation.check(agent, points)).toEqual([]);
      for (const other of ['picker', 'staff', 'shopper', 'reach-truck', 'forklift', 'robot'].filter(value => value !== agent)) expect(warehouseNavigation.check(other, points)).toMatchObject([{ code: 'agent-not-allowed' }]);
    }
  });

  it('renders every node of the peak snapshot with the shared factories', () => {
    // Surface labels draw on a DOM canvas, so this Node test builds the models without them.
    for (const original of startNodes('peak')) {
      if (original.kind !== 'asset') continue;
      const node: AssetNode = { ...original, surfaceLabel: undefined, attachment: undefined };
      const object = basicAssets[node.asset](node);
      expect(object, node.id).toBeDefined(); disposeObject(object);
    }
  });
});
