import { describe, expect, it } from 'vitest';
import type { AssetNode, SceneNode } from '@opsorama/core';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { PASS_CAPACITY, PICKUP_CAPACITY, SCENARIOS, STATIONS, TABLE_LAYOUT, TABLE_STATUS, applyRestaurantSnapshot, createRestaurantStore, isOccupied, restaurantMetrics, restaurantNodes, stationTickets, type RestaurantScenario } from '../apps/site/src/features/restaurant/model';

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

  it('shows a closed restaurant with idle stations, a cold oven and no guests', () => {
    const nodes = restaurantNodes(SCENARIOS.closed);
    for (const station of STATIONS) expect(asset(nodes, `station:${station.id}`).state, station.id).toBe('inactive');
    expect(nodes.some(node => node.id.startsWith('guest:') || node.id.startsWith('bar-guest:'))).toBe(false);
    const oven = basicAssets['pizza-oven'](asset(nodes, 'station:pizza')); let fire = 0; oven.traverse(child => { if (child.name === 'oven-fire') fire++; }); expect(fire).toBe(0); disposeObject(oven);
    expect(restaurantMetrics(SCENARIOS.closed)).toMatchObject({ guests: 0, occupied: 0, tickets: 0 });
  });
});
