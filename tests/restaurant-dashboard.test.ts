import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isPersonAsset, routeDuration, sampleRoute, type AssetNode, type SceneNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { PASS_CAPACITY, PICKUP_CAPACITY, SCENARIOS, STATIONS, TABLE_LAYOUT, TABLE_STATUS, applyRestaurantSnapshot, createRestaurantStore, applyPlateVisit, isOccupied, nextPlateVisit, plateRuns, restaurantMetrics, restaurantNodes, stationTickets, type RestaurantScenario } from '../apps/site/src/features/restaurant/model';

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

  it('keeps one table record per floor-plan table and maps statuses to table states without status markers', () => {
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], nodes = restaurantNodes(snapshot);
      expect(snapshot.tables.map(table => table.tableId).sort()).toEqual(TABLE_LAYOUT.map(table => table.id).sort());
      for (const session of snapshot.tables) {
        const node = asset(nodes, `table:${session.tableId}`), seats = TABLE_LAYOUT.find(table => table.id === session.tableId)!.seats;
        expect(node.state).toBe(TABLE_STATUS[session.status].state); expect(node.entityId).toBe(session.tableId);
        expect(node.count).toBe(session.status === 'free' ? 0 : Math.min(seats, session.party));
        expect(nodes.some(other => other.kind === 'asset' && other.asset === 'map-pin'), scenario).toBe(false);
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

  it('sets full plates on one table, clears finished plates from another and refills at the pass', () => {
    expect(plateRuns(SCENARIOS.rush).map(run => run.server)).toEqual(['staff:ana', 'staff:ben', 'staff:cleo', 'staff:dan']);
    expect(plateRuns(SCENARIOS.quiet).map(run => run.server)).toEqual(['staff:dan']); expect(plateRuns(SCENARIOS.closed)).toEqual([]);
    for (const scenario of scenarios) for (const run of plateRuns(SCENARIOS[scenario])) {
      const label = `${scenario} ${run.server}`, route = asset(restaurantNodes(SCENARIOS[scenario]), run.server).route!;
      // The two laps return the plates to where they started.
      expect(applyPlateVisit(run.pairs.at(-1)!, run.visits[0].table), label).toEqual(run.pairs[0]);
      // Every table pause moves plates: full plates go down on a table, finished plates come back empty.
      run.visits.forEach((visit, k) => {
        if (!visit.table || k === 0) return;
        const before = run.pairs[k - 1], after = run.pairs[k], moved = after.findIndex((pair, i) => pair.table !== before[i].table);
        expect(moved, `${label} visit ${k}`).toBeGreaterThanOrEqual(0);
        expect(after[moved], `${label} visit ${k}`).toEqual(after[moved].table ? { load: 'full', table: visit.table } : { load: 'empty' });
      });
      // Polling the carry anchor along two loops reaches every visit in order, and the stagger start matches the walk.
      const visited: number[] = [], seen = (until: number, from = 0) => {
        let k = from;
        for (let t = 0; t <= until; t += .2) {
          const { position: [x, y, z], yaw } = sampleRoute(route, t), next = nextPlateVisit(run, [x + Math.sin(yaw) * .47, y, z + Math.cos(yaw) * .47], k);
          if (next !== k) visited.push(k = next);
        }
        return k;
      };
      seen(2 * routeDuration(route) + 2);
      expect(visited, label).toEqual([...run.visits.keys(), ...run.visits.keys()].slice(1).concat(0));
      expect(seen(route.elapsed ?? 0), label).toBe(run.start);
    }
  });

  it('puts plates in hand on top of the hands and plates set down on the guests\' place settings', () => {
    for (const scenario of scenarios) for (const run of plateRuns(SCENARIOS[scenario])) run.pairs.forEach((pairs, k) => {
      const label = `${scenario} ${run.server} visit ${k}`, nodes = restaurantNodes(SCENARIOS[scenario], { [run.server]: k }), server = asset(nodes, run.server);
      const plates = nodes.filter((node): node is AssetNode => node.kind === 'asset' && node.id.startsWith(`plate:${run.server}:`));
      expect(plates, label).toHaveLength(pairs.length * 2);
      expect(server.variant, label).toBe(pairs.some(pair => !pair.table) ? 'holding' : 'walking');
      for (const plate of plates) {
        expect(plate.asset).toBe('serving-plates'); expect(plate.count).toBe(1); expect(plate.transfer).toBeDefined();
        const pair = pairs[Number(plate.id.split(':').at(-2))];
        expect(plate.variant, label).toBe(pair.load);
        expect(plate.attachment, label).toEqual(pair.table ? { nodeId: `table:${pair.table}`, anchor: 'top' } : { nodeId: run.server, anchor: 'carry' });
        // Check the model placement once per place: in hand, and on each table.
        if (k !== run.pairs.findIndex(other => other.some(item => item.table === pair.table))) continue;
        const owner = pair.table ? asset(nodes, `table:${pair.table}`) : { ...server, route: undefined };
        const holder = catalogAssets[owner.asset](owner), model = catalogAssets['serving-plates'](plate);
        holder.getObjectByName(`anchor-${plate.attachment!.anchor}`)!.add(model); model.position.fromArray(plate.position!); model.rotation.set(...(plate.rotation ?? [0, 0, 0])); holder.updateMatrixWorld(true);
        const held = new THREE.Box3().setFromObject(model);
        if (!pair.table) {
          // The plates rest just on top of the hands, not below them at the carry anchor.
          const hands = new THREE.Box3().setFromObject(holder.getObjectByName('anchor-hand')!.parent!);
          expect(held.min.y - hands.max.y, label).toBeGreaterThan(-.01); expect(held.min.y - hands.max.y, label).toBeLessThan(.03);
        } else {
          // A plate set down covers one of the table's place settings, so it sits in front of a seated guest.
          const settings: THREE.Box3[] = []; holder.traverse(child => { if (child.name === 'setting-plate') settings.push(new THREE.Box3().setFromObject(child)); });
          const center = held.getCenter(new THREE.Vector3()), under = settings.find(box => Math.hypot(box.getCenter(new THREE.Vector3()).x - center.x, box.getCenter(new THREE.Vector3()).z - center.z) < .02);
          expect(under, `${label} ${plate.id}`).toBeDefined();
          expect(held.min.y - under!.max.y, label).toBeGreaterThanOrEqual(-.001); expect(held.min.y - under!.max.y, label).toBeLessThan(.01);
        }
        model.removeFromParent(); disposeObject(model); disposeObject(holder);
      }
      const settled = plates.filter(plate => plate.attachment!.nodeId.startsWith('table:'));
      expect(new Set(settled.map(plate => `${plate.attachment!.nodeId} ${plate.position!.join()}`)).size, label).toBe(settled.length);
    });
  });

  it('shows a closed restaurant with idle stations, a cold oven and no guests', () => {
    const nodes = restaurantNodes(SCENARIOS.closed);
    for (const station of STATIONS) expect(asset(nodes, `station:${station.id}`).state, station.id).toBe('inactive');
    expect(nodes.some(node => node.id.startsWith('guest:') || node.id.startsWith('bar-guest:'))).toBe(false);
    const oven = catalogAssets['pizza-oven'](asset(nodes, 'station:pizza')); let fire = 0; oven.traverse(child => { if (child.name === 'oven-fire') fire++; }); expect(fire).toBe(0); disposeObject(oven);
    expect(restaurantMetrics(SCENARIOS.closed)).toMatchObject({ guests: 0, occupied: 0, tickets: 0 });
  });
});
