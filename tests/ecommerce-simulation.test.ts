import { describe, expect, it } from 'vitest';
import { createSceneStore, type AssetNode, type SceneNode } from '@opsorama/core';
import { assetHandling, basicAssets, disposeObject } from '@opsorama/renderer-three';
import { LOCATIONS, SCENARIOS, type EcommerceScenario, type LocationId } from '../apps/site/src/features/ecommerce/model';
import { createEcommerceSimulation, type EcommerceSimulation } from '../apps/site/src/features/ecommerce/simulation';

const scenarios = Object.keys(SCENARIOS) as EcommerceScenario[];
const assets = (nodes: readonly SceneNode[]) => nodes.filter((node): node is AssetNode => node.kind === 'asset');
const pallets = (simulation: EcommerceSimulation) => assets(simulation.nodes()).filter(node => node.id.startsWith('pallet:'));
const inRack = (simulation: EcommerceSimulation, id: LocationId) => pallets(simulation).filter(node => node.attachment?.nodeId === `rack:${id}`).length;
const racks = LOCATIONS.filter(value => value.kind === 'rack').map(value => value.id);
const critical = (simulation: EcommerceSimulation) => simulation.snapshot().events.filter(event => event.text.includes('stopped:'));
/** Run in slices and keep every check on the way; a scene that cannot be published or rendered fails here. */
function run(simulation: EcommerceSimulation, seconds: number, each?: (time: number) => void) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 5) { simulation.advance(5); each?.(simulation.time); }
}

describe('e-commerce mock feed', () => {
  it('starts from the scenario records, with one real pallet per occupied rack position', () => {
    for (const scenario of scenarios) {
      const simulation = createEcommerceSimulation(scenario), snapshot = simulation.snapshot(), start = SCENARIOS[scenario];
      expect(snapshot.orders).toEqual(start.orders); expect(snapshot.occupancy).toEqual(start.occupancy); expect(snapshot.time).toBe(start.time);
      for (const id of racks) expect(inRack(simulation, id), `${scenario} ${id}`).toBe(start.occupancy[id]);
      const nodes = assets(simulation.nodes());
      for (const id of racks) expect(nodes.find(node => node.id === `rack:${id}`)?.count).toBe(0);
      // On the floor: the staging lane, plus the pallet the forklift is about to take off an unloading truck.
      expect(pallets(simulation).filter(node => !node.attachment && (node.position?.[0] ?? 0) < 20)).toHaveLength(start.staging);
      simulation.dispose();
    }
  });

  it('starts its customers inside the shop, each on a point of their own', () => {
    for (const scenario of scenarios) {
      const simulation = createEcommerceSimulation(scenario), shoppers = assets(simulation.nodes()).filter(node => /^shopper:\d+$/.test(node.id));
      expect(shoppers.filter(node => node.position![2] > 4), scenario).toEqual([]);
      for (const [i, a] of shoppers.entries()) for (const b of shoppers.slice(i + 1)) expect(Math.hypot(a.position![0] - b.position![0], a.position![2] - b.position![2]), `${scenario} ${a.id} ${b.id}`).toBeGreaterThan(.5);
      simulation.dispose();
    }
  });

  it('lets customers in from the street one at a time', () => {
    const simulation = createEcommerceSimulation('peak'), visible = () => new Set(simulation.nodes().filter(node => /^shopper:\d+$/.test(node.id)).map(node => node.id)), entries: number[] = [];
    let inside = visible();
    for (let i = 0; i < 2400; i++) {
      simulation.advance(.5);
      const now = visible();
      for (const id of now) if (!inside.has(id)) entries.push(simulation.time);
      inside = now;
    }
    expect(entries.length).toBeGreaterThan(20);
    entries.slice(1).forEach((time, i) => expect(time - entries[i], `${time}`).toBeGreaterThan(2));
    simulation.dispose();
  }, 60000);

  it('keeps every agent working through a long shift, with valid nodes at every check', () => {
    for (const scenario of scenarios) {
      const simulation = createEcommerceSimulation(scenario);
      run(simulation, 1500, time => {
        const nodes = simulation.nodes(), ids = new Set(nodes.map(node => node.id));
        expect(ids.size, `${scenario} ${time}`).toBe(nodes.length);
        for (const node of nodes) if (node.attachment) expect(ids.has(node.attachment.nodeId), `${scenario} ${time} ${node.id} → ${node.attachment.nodeId}`).toBe(true);
        expect(critical(simulation), `${scenario} ${time}`).toEqual([]);
        const snapshot = simulation.snapshot();
        for (const value of LOCATIONS) { expect(snapshot.occupancy[value.id]).toBeGreaterThanOrEqual(0); expect(snapshot.occupancy[value.id]).toBeLessThanOrEqual(value.capacity); }
        for (const id of racks) expect(inRack(simulation, id), `${scenario} ${time} ${id}`).toBe(snapshot.occupancy[id]);
      });
      simulation.dispose();
    }
  }, 120000);

  it('gives the same result however the time is sliced', () => {
    const coarse = createEcommerceSimulation('peak'), fine = createEcommerceSimulation('peak');
    coarse.advance(120); for (let i = 0; i < 2400; i++) fine.advance(.05);
    expect(fine.snapshot().orders).toEqual(coarse.snapshot().orders); expect(fine.snapshot().occupancy).toEqual(coarse.snapshot().occupancy);
    coarse.dispose(); fine.dispose();
  });

  it('puts inbound pallets away: the dock empties, staging drains and the racks fill', () => {
    const simulation = createEcommerceSimulation('night'), before = simulation.snapshot(), reserve = racks.reduce((sum, id) => sum + before.occupancy[id], 0);
    run(simulation, 400);
    const after = simulation.snapshot();
    expect(after.staging).toBeLessThan(before.staging);
    expect(racks.reduce((sum, id) => sum + after.occupancy[id], 0)).toBeGreaterThan(reserve - 2);
    expect(after.events.some(event => /put away to R0/.test(event.text))).toBe(true);
    simulation.dispose();
  });

  it('replenishes a short pick face from reserve and clears the alert', () => {
    const simulation = createEcommerceSimulation('peak');
    expect(simulation.snapshot().alerts.find(alert => alert.sku === 'OUT-215')?.onHand).toBe(0);
    const reserve = simulation.snapshot().occupancy.R04;
    let moved = false;
    run(simulation, 300, () => { moved ||= simulation.snapshot().occupancy.R04 < reserve; });
    expect(moved).toBe(true);
    expect(simulation.snapshot().alerts.some(alert => alert.sku === 'OUT-215')).toBe(false);
    expect(simulation.snapshot().orders.find(order => order.id === '#50419')?.issue).toBeUndefined();
    simulation.dispose();
  });

  it('moves orders through picking, sortation, packing and dispatch', () => {
    const simulation = createEcommerceSimulation('peak'), shipped = simulation.snapshot().shippedToday, seen = new Set<string>();
    run(simulation, 900, () => { for (const order of simulation.snapshot().orders) if (order.id === '#50421') seen.add(order.stage); });
    expect(seen.has('sorting') || seen.has('packing') || seen.has('staged')).toBe(true);
    expect(simulation.snapshot().shippedToday).toBeGreaterThan(shipped);
    simulation.dispose();
  });

  it('sells goods from the shelves and restocks them', () => {
    const simulation = createEcommerceSimulation('peak'), start = simulation.snapshot().shop;
    let restocked = false;
    run(simulation, 900, () => { restocked ||= simulation.snapshot().events.some(event => /gondola restocked/.test(event.text)); });
    expect(simulation.snapshot().shop.sales).toBeGreaterThan(start.sales);
    expect(restocked).toBe(true);
    simulation.dispose();
  });

  it('never lets a unit fly: every hand-over is a straight, short move', () => {
    const simulation = createEcommerceSimulation('peak');
    run(simulation, 1500, time => {
      for (const node of assets(simulation.nodes())) if (node.transfer) { expect(node.transfer.arc, `${time} ${node.id}`).toBe(0); expect(node.transfer.seconds).toBeLessThanOrEqual(.35); }
      expect(simulation.nodes().some(node => node.id.startsWith('flight:'))).toBe(false);
    });
    simulation.dispose();
  }, 60000);

  it('keeps a pallet turned the same way through every hand-over, long side along the forks', () => {
    const same = (a: number, b: number) => Math.abs(Math.sin(a - b)) < 1e-6;
    for (const scenario of ['peak', 'night'] as const) {
      const simulation = createEcommerceSimulation(scenario), last = new Map<string, { parent?: string; yaw: number }>();
      let handOvers = 0;
      for (let i = 0; i < 3000; i++) {
        simulation.advance(.1);
        const nodes = assets(simulation.nodes()), trucks = new Map(nodes.filter(node => node.id === 'forklift' || node.id === 'reach-truck').map(node => [node.id, node]));
        for (const node of nodes.filter(item => item.id.startsWith('pallet:'))) {
          const parent = node.attachment?.nodeId, truck = parent ? trucks.get(parent) : undefined, turn = node.rotation?.[1] ?? 0, yaw = turn + (truck?.rotation?.[1] ?? 0), before = last.get(node.id);
          if (truck) expect(turn, node.id).toBeCloseTo(Math.PI / 2);
          if (parent?.startsWith('rack:')) expect(turn, node.id).toBeCloseTo(Math.PI / 2);
          if (before && before.parent !== parent) { handOvers++; expect(same(before.yaw, yaw), `${scenario} ${node.id}: ${before.parent} → ${parent}`).toBe(true); }
          last.set(node.id, { parent, yaw });
        }
      }
      expect(handOvers, scenario).toBeGreaterThan(5);
      simulation.dispose();
    }
  }, 60000);

  it('lifts pallets to their rack level with the forks and backs the trucks out', () => {
    const simulation = createEcommerceSimulation('night');
    let highest = 0, attached = false, reached = 0;
    for (let i = 0; i < 8000; i++) {
      simulation.advance(.1);
      const nodes = assets(simulation.nodes()), truck = nodes.find(node => node.id === 'reach-truck')!, moves = truck.forks?.moves ?? [];
      for (const move of moves) { highest = Math.max(highest, move.height); reached = Math.max(reached, move.reach ?? 0); }
      if (moves.some(move => move.height > 1)) attached ||= nodes.some(node => node.attachment?.nodeId === 'reach-truck' && node.attachment.anchor === 'load');
      if (truck.route?.reverseSegments) expect(truck.route.points.length).toBeGreaterThan(1);
    }
    expect(highest).toBeGreaterThan(1.3); expect(reached).toBe(1); expect(attached).toBe(true);
    simulation.dispose();
  }, 60000);

  it('uses the deep aisle and all ten departments', () => {
    const simulation = createEcommerceSimulation('peak'), nodes = assets(simulation.nodes());
    expect(nodes.filter(node => node.asset === 'pallet-rack')).toHaveLength(14);
    expect(nodes.filter(node => node.asset === 'store-shelving')).toHaveLength(20);
    expect(inRack(simulation, 'R08')).toBeGreaterThan(0);
    let deep = false;
    run(simulation, 900, () => { deep ||= assets(simulation.nodes()).some(node => node.id === 'reach-truck' && (node.position?.[2] ?? 0) < -15); });
    expect(deep).toBe(true);
    expect(simulation.snapshot().shop.facings.garden).toBeLessThan(SCENARIOS.peak.shop.facings.garden + 16);
    simulation.dispose();
  });

  it('declares every moving unit in the shared handling table and builds it with the shared factories', () => {
    const simulation = createEcommerceSimulation('peak'); run(simulation, 200);
    for (const original of assets(simulation.nodes())) {
      if (/^(pallet|tote|carton|parcel|bag):/.test(original.id)) expect(assetHandling[original.asset], original.id).toBeDefined();
      const object = basicAssets[original.asset]({ ...original, surfaceLabel: undefined, attachment: undefined, route: undefined, controller: undefined });
      expect(object, original.id).toBeDefined(); disposeObject(object);
    }
    const store = createSceneStore({ schemaVersion: 1, nodes: simulation.nodes() });
    expect(store.getSnapshot().nodes.length).toBeGreaterThan(100); store.dispose(); simulation.dispose();
  });
});
