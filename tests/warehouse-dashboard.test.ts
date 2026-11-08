import { describe, expect, it } from 'vitest';
import { createSceneStore, validateNode, type AssetNode, type SceneNode } from '@opsorama/core';
import { catalogAssets } from '@opsorama/objects';
import { disposeObject } from '@opsorama/three';
import {
  AISLES, AREAS, DOCKS, LANE_CAPACITY, SCENARIOS, aisleUsage, areaState, bayCount, deliveryLate, loadAtRisk, minutesBetween, stagedPallets, warehouseAlerts, warehouseMetrics, yardDwell,
  type WarehouseScenario,
} from '../apps/site/src/features/warehouse/model';
import { AMR_LOOP, HALL, applyWarehouseSnapshot, createWarehouseStore, reachLoop, warehouseNodes } from '../apps/site/src/features/warehouse/scene';

const scenarios = Object.keys(SCENARIOS) as WarehouseScenario[];
const assets = (nodes: readonly SceneNode[]) => nodes.filter((node): node is AssetNode => node.kind === 'asset');
const inside = (rect: readonly [number, number, number, number], x: number, z: number) => x >= rect[0] && x <= rect[1] && z >= rect[2] && z <= rect[3];

describe('distribution centre dashboard', () => {
  for (const scenario of scenarios) it(`${scenario}: builds a valid scene with unique nodes from registered assets`, () => {
    const snapshot = SCENARIOS[scenario], nodes = warehouseNodes(snapshot), ids = new Set(nodes.map(node => node.id));
    expect(ids.size).toBe(nodes.length);
    for (const node of nodes) expect(() => validateNode(node), node.id).not.toThrow();
    expect(() => createSceneStore({ schemaVersion: 1, nodes }).dispose()).not.toThrow();
    for (const node of assets(nodes)) expect(catalogAssets[node.asset], node.asset).toBeTypeOf('function');
    // Every alert and event points at a node of this snapshot.
    for (const alert of warehouseAlerts(snapshot)) expect(ids.has(alert.node), alert.id).toBe(true);
    for (const event of snapshot.events) expect(ids.has(event.node), event.text).toBe(true);
  });

  it('keeps docks, trucks, deliveries and loads consistent', () => {
    for (const snapshot of Object.values(SCENARIOS)) {
      expect(snapshot.docks.map(value => value.id).sort()).toEqual(DOCKS.map(value => value.id));
      for (const state of snapshot.docks) {
        const truck = snapshot.trucks.find(value => value.dock === state.id), side = DOCKS.find(value => value.id === state.id)!.side;
        // A truck stands at the door exactly while the door is docked, unloading or loading.
        expect(Boolean(truck), `${snapshot.scenario} ${state.id}`).toBe(['docked', 'unloading', 'loading'].includes(state.status));
        if (truck) expect(truck.ref, state.id).toBe(state.ref);
        if (state.ref) expect((side === 'inbound' ? snapshot.deliveries : snapshot.loads).some(value => value.id === state.ref), state.ref).toBe(true);
        if (side === 'inbound') expect(state.staged, state.id).toBeTypeOf('number');
      }
      const stalls = snapshot.trucks.filter(value => value.stall !== undefined).map(value => value.stall);
      expect(new Set(stalls).size).toBe(stalls.length);
      for (const truck of snapshot.trucks) expect([...snapshot.deliveries, ...snapshot.loads].some(value => value.id === truck.ref), truck.id).toBe(true);
      for (const load of snapshot.loads) { expect(load.loaded).toBeLessThanOrEqual(load.picked); expect(load.picked).toBeLessThanOrEqual(load.pallets); }
      for (const delivery of snapshot.deliveries) expect(delivery.received).toBeLessThanOrEqual(delivery.pallets);
    }
  });

  it('draws one pallet per staged pallet in each lane, bounded by the lane, and the exact count in every rack bay', () => {
    for (const snapshot of Object.values(SCENARIOS)) {
      const nodes = assets(warehouseNodes(snapshot));
      for (const value of DOCKS) expect(nodes.filter(node => node.id.startsWith(`lane:${value.id}:`)), `${snapshot.scenario} ${value.id}`).toHaveLength(Math.min(LANE_CAPACITY, stagedPallets(snapshot, value.id)));
      let positions = 0;
      for (const aisle of AISLES) for (let bay = 0; bay < aisle.bays; bay++) for (const side of ['L', 'R'] as const) {
        const node = nodes.find(item => item.id === `rack:${aisle.id}:${bay}:${side}`)!;
        expect(node.count).toBe(bayCount(snapshot, aisle.id, bay, side)); positions += 6;
        expect(inside([HALL.west, HALL.east, HALL.back, HALL.front], node.position![0], node.position![2]), node.id).toBe(true);
      }
      expect(positions).toBe(AISLES.reduce((sum, aisle) => sum + aisleUsage(snapshot, aisle.id).capacity, 0));
      expect(nodes.filter(node => node.asset === 'pallet-rack')).toHaveLength(AISLES.reduce((sum, aisle) => sum + aisle.bays * 2, 0));
    }
    // A damaged bay is unloaded and drawn critical.
    const damaged = assets(warehouseNodes(SCENARIOS.dispatch)).find(node => node.id === 'rack:A04:5:L')!;
    expect(damaged).toMatchObject({ count: 0, state: 'critical' });
  });

  it('derives lateness, dwell, load risk and area states from the records', () => {
    expect(minutesBetween('23:40', '00:30')).toBe(50); expect(minutesBetween('06:00', '05:52')).toBe(-8);
    const morning = SCENARIOS.inbound, dispatch = SCENARIOS.dispatch;
    expect(deliveryLate(morning, morning.deliveries.find(value => value.id === 'ASN-40219')!)).toBe(31);
    expect(deliveryLate(morning, morning.deliveries.find(value => value.id === 'ASN-40220')!)).toBe(0);
    expect(yardDwell(dispatch, dispatch.trucks.find(value => value.id === 'TR-245')!)).toBe(60);
    expect(yardDwell(SCENARIOS.night, SCENARIOS.night.trucks.find(value => value.id === 'TR-401')!)).toBe(0);
    expect(dispatch.loads.filter(value => loadAtRisk(dispatch, value)).map(value => value.id)).toEqual(['L-5123']);
    expect(Object.values(SCENARIOS).flatMap(snapshot => snapshot.loads.filter(value => loadAtRisk(snapshot, value)))).toHaveLength(1);
    expect(areaState(dispatch, 'chilled')).toBe('critical'); expect(areaState(dispatch, 'reserve')).toBe('critical'); expect(areaState(dispatch, 'outbound')).toBe('critical');
    expect(areaState(morning, 'inbound')).toBe('warning'); expect(areaState(SCENARIOS.night, 'sortation')).toBe('inactive');
    expect(warehouseMetrics(morning)).toMatchObject({ occupied: 8, waiting: 3, late: 1, backlog: 33, atRisk: 0 });
    expect(warehouseMetrics(dispatch)).toMatchObject({ occupied: 9, atRisk: 1, blocked: 1, replenish: 4 });
    for (const snapshot of Object.values(SCENARIOS)) for (const area of AREAS) expect(['normal', 'warning', 'critical', 'inactive']).toContain(areaState(snapshot, area.id));
  });

  it('moves vehicles and pickers on closed loops inside the hall and the yard truck through the gates', () => {
    for (const scenario of scenarios) {
      const nodes = assets(warehouseNodes(SCENARIOS[scenario]));
      for (const node of nodes.filter(value => value.route)) {
        const points = node.route!.points;
        expect(points.at(-1), node.id).toEqual(points[0]); expect(node.route!.loop).toBe(true);
        if (node.id !== 'truck:arriving') for (const [x, , z] of points) expect(inside([HALL.west, HALL.east, HALL.back, HALL.front], x, z), node.id).toBe(true);
      }
      const working = SCENARIOS[scenario].fleet.filter(value => value.status === 'working');
      expect(nodes.filter(node => node.id.startsWith('mhe:') && !node.id.endsWith(':load') && node.route).map(node => node.id).sort()).toEqual(working.map(value => `mhe:${value.id}`).sort());
      expect(Boolean(nodes.find(node => node.id === 'truck:arriving')), scenario).toBe(scenario !== 'night');
    }
    // A reach truck's loop stays in its own aisle pair and the back aisle; robots stay in the sortation area.
    for (const aisle of AISLES) for (const [, , z] of reachLoop(aisle.id)) expect(z).toBeLessThanOrEqual(aisle.zone === 'chilled' ? 0 : .3);
    const sortation = AREAS.find(value => value.id === 'sortation')!.rect!;
    for (const [x, , z] of AMR_LOOP) expect(inside(sortation, x, z)).toBe(true);
  });

  it('renders every node of each snapshot with the shared factories', () => {
    // Surface labels draw on a DOM canvas, so this Node test builds the models without them.
    const built = new Set<string>();
    for (const scenario of scenarios) for (const original of warehouseNodes(SCENARIOS[scenario])) {
      if (original.kind !== 'asset' || built.has(`${original.asset}:${original.variant}:${original.count}`)) continue;
      built.add(`${original.asset}:${original.variant}:${original.count}`);
      const node: AssetNode = { ...original, surfaceLabel: undefined, attachment: undefined, route: undefined };
      const object = catalogAssets[node.asset](node);
      expect(object, node.id).toBeDefined(); disposeObject(object);
    }
  });

  it('replaces the scene with a new snapshot without changing the records', () => {
    const store = createWarehouseStore('inbound'), before = JSON.stringify(SCENARIOS);
    applyWarehouseSnapshot(store, SCENARIOS.dispatch);
    const display = store.getSnapshot().nodes.find(node => node.id === 'chilled:display');
    expect(display?.kind === 'asset' && display.state).toBe('critical');
    expect(JSON.stringify(SCENARIOS)).toBe(before); store.dispose();
  });
});
