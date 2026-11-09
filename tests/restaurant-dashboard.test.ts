import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isPersonAsset, routeDuration, sampleRoute, type AssetNode, type SceneNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { PASS_CAPACITY, PICKUP_CAPACITY, SCENARIOS, STATIONS, TABLE_LAYOUT, TABLE_STATUS, applyRestaurantSnapshot, createRestaurantStore, isOccupied, nextPlateLoad, plateRuns, restaurantMetrics, restaurantNodes, stationTickets, type PlateLoad, type RestaurantScenario } from '../apps/site/src/features/restaurant/model';

const asset = (nodes: readonly SceneNode[], id: string) => nodes.find(node => node.id === id) as AssetNode;
const scenarios = Object.keys(SCENARIOS) as RestaurantScenario[];

describe('restaurant dashboard model', () => {
  it('builds a valid store for every snapshot and replaces it without stale guests', () => {
    const store = createRestaurantStore('rush');
    for (const scenario of [...scenarios, 'rush'] as const) {
      applyRestaurantSnapshot(store, SCENARIOS[scenario]);
      const nodes = store.getSnapshot().nodes, guests = nodes.filter(node => node.id.startsWith('guest:'));
      const covers = SCENARIOS[scenario].tables.filter(isOccupied).reduce((sum, table) => sum + table.party, 0);
      expect(guests, scenario).toHaveLength(covers);
      for (const guest of guests) expect(nodes.some(node => node.id === guest.attachment?.nodeId), guest.id).toBe(true);
    }
    store.dispose();
  });

  it('keeps one table record per floor-plan table and maps statuses to tent states', () => {
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], nodes = restaurantNodes(snapshot);
      expect(snapshot.tables.map(table => table.tableId).sort()).toEqual(TABLE_LAYOUT.map(table => table.id).sort());
      for (const session of snapshot.tables) {
        const node = asset(nodes, `table:${session.tableId}`), seats = TABLE_LAYOUT.find(table => table.id === session.tableId)!.seats;
        expect(node.state).toBe(TABLE_STATUS[session.status].state); expect(node.entityId).toBe(session.tableId);
        expect(node.count).toBe(session.status === 'free' ? 0 : Math.min(seats, session.party));
      }
    }
  });

  it('summarizes metrics and ready orders from the same tickets the stations show', () => {
    const rush = SCENARIOS.rush, metrics = restaurantMetrics(rush);
    expect(metrics.late).toBe(1); expect(metrics.tickets).toBe(rush.tickets.length);
    expect(metrics.ready).toBe(stationTickets(rush, 'pass').length + stationTickets(rush, 'pickup').length);
    const nodes = restaurantNodes(rush);
    expect(asset(nodes, 'station:pass').count).toBe(Math.min(PASS_CAPACITY, stationTickets(rush, 'pass').length));
    expect(asset(nodes, 'station:pickup').count).toBe(Math.min(PICKUP_CAPACITY, stationTickets(rush, 'pickup').length));
    expect(asset(nodes, 'station:grill').state).toBe('critical');
    expect(asset(nodes, 'equipment:cooler').state).toBe('warning');
    // Every open ticket belongs to exactly one station view.
    const shown = STATIONS.flatMap(station => stationTickets(rush, station.id).map(ticket => ticket.id));
    expect(shown.sort()).toEqual(rush.tickets.map(ticket => ticket.id).sort());
  });

  it('caps ready plates and bags at the model capacity while totals stay exact', () => {
    const many = { ...SCENARIOS.rush, tickets: Array.from({ length: 12 }, (_, i) => ({ id: `#9${i}`, channel: i % 2 ? 'takeout' as const : 'dine-in' as const, ...(i % 2 ? {} : { tableId: 'T1' }), station: 'grill' as const, status: 'ready' as const, items: ['Fries'], minutes: 5, target: 10 })) };
    const nodes = restaurantNodes(many);
    expect(asset(nodes, 'station:pass').count).toBe(PASS_CAPACITY); expect(asset(nodes, 'station:pickup').count).toBe(6);
    expect(restaurantMetrics(many).ready).toBe(12);
  });

  it('walks servers, the courier and arriving guests along routes that clear the furniture', () => {
    // Standing obstacles: world boxes of every mesh below head height (umbrella canopies and pass gantries are walked under).
    const obstacles = (nodes: readonly SceneNode[]) => nodes.flatMap(node => {
      if (node.kind !== 'asset' || node.attachment || isPersonAsset(node.asset) || node.footprint) return [];
      // Surface labels need a DOM canvas and add no standing geometry.
      const object = catalogAssets[node.asset]({ ...node, surfaceLabel: undefined }), boxes: THREE.Box3[] = [];
      object.position.fromArray(node.position ?? [0, 0, 0]); object.rotation.set(...(node.rotation ?? [0, 0, 0])); object.updateMatrixWorld(true);
      object.traverse(child => { if (!(child instanceof THREE.Mesh)) return; const box = new THREE.Box3().setFromObject(child); if (box.min.y < 1.2 && box.max.y > .15) boxes.push(box); });
      disposeObject(object);
      return boxes.map(box => ({ id: node.id, box }));
    });
    const RADIUS = .18;
    for (const scenario of scenarios) {
      const nodes = restaurantNodes(SCENARIOS[scenario]), solid = obstacles(nodes), walkers = nodes.filter((node): node is AssetNode => node.kind === 'asset' && !!node.route);
      expect(walkers.length, scenario).toBeGreaterThan(0);
      for (const walker of walkers) {
        const route = walker.route!, duration = routeDuration(route);
        expect(walker.position, walker.id).toEqual(route.points[0]);
        for (let t = 0; t <= duration; t += .05) {
          const { position: [x, , z] } = sampleRoute(route, t);
          const hit = solid.find(({ box }) => x > box.min.x - RADIUS && x < box.max.x + RADIUS && z > box.min.z - RADIUS && z < box.max.z + RADIUS);
          expect(hit?.id, `${scenario} ${walker.id} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBeUndefined();
        }
      }
    }
  });

  it('hands plate carriers full plates at the pass and empty ones after the first table they serve', () => {
    expect(plateRuns(SCENARIOS.rush).map(run => run.server)).toEqual(['staff:ana', 'staff:ben', 'staff:cleo', 'staff:dan']);
    expect(plateRuns(SCENARIOS.quiet).map(run => run.server)).toEqual(['staff:dan']); expect(plateRuns(SCENARIOS.closed)).toEqual([]);
    for (const scenario of scenarios) {
      const nodes = restaurantNodes(SCENARIOS[scenario], { 'staff:dan': 'empty' }), runs = plateRuns(SCENARIOS[scenario]);
      expect(nodes.filter(node => node.kind === 'asset' && node.asset === 'serving-plates'), scenario).toHaveLength(runs.length);
      for (const run of runs) {
        const plates = asset(nodes, `plates:${run.server}`), server = asset(nodes, run.server);
        expect(plates.attachment).toEqual({ nodeId: run.server, anchor: 'carry' }); expect(plates.variant).toBe(run.server === 'staff:dan' ? 'empty' : 'full');
        expect(server.variant, run.server).toBe('holding');
        // Walk one loop with the carry anchor about 0.45 m in front of the body: plates empty at the table and refill at the pass.
        const route = server.route!, loads: PlateLoad[] = [];
        let load: PlateLoad = 'full';
        for (let t = 0; t <= routeDuration(route) + .5; t += .2) {
          const { position: [x, y, z], yaw } = sampleRoute(route, t);
          load = nextPlateLoad(run, [x + Math.sin(yaw) * .45, y, z + Math.cos(yaw) * .45], load);
          if (loads.at(-1) !== load) loads.push(load);
        }
        expect(loads, `${scenario} ${run.server}`).toEqual(['full', 'empty', 'full']);
      }
    }
  });

  it('shows a closed restaurant with idle stations, a cold oven and no guests', () => {
    const nodes = restaurantNodes(SCENARIOS.closed);
    for (const station of STATIONS) expect(asset(nodes, `station:${station.id}`).state, station.id).toBe('inactive');
    expect(nodes.some(node => node.id.startsWith('guest:') || node.id.startsWith('bar-guest:'))).toBe(false);
    const oven = catalogAssets['pizza-oven'](asset(nodes, 'station:pizza')); let fire = 0; oven.traverse(child => { if (child.name === 'oven-fire') fire++; }); expect(fire).toBe(0); disposeObject(oven);
    expect(restaurantMetrics(SCENARIOS.closed)).toMatchObject({ guests: 0, occupied: 0, tickets: 0 });
  });
});
