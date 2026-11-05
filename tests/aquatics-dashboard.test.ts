import { describe, expect, it } from 'vitest';
import type { AssetNode, SceneNode } from '@opsorama/core';
import { LAP_POOL } from '@opsorama/renderer-three';
import { LANE_IDS, LANE_VISIBLE, SCENARIOS, TEACHING_VISIBLE, aquaticsMetrics, aquaticsNodes, applyAquaticsSnapshot, createAquaticsStore, laneLoop, laneState, postState, waterState, type AquaticsScenario } from '../apps/site/src/features/aquatics/model';

const asset = (nodes: readonly SceneNode[], id: string) => nodes.find(node => node.id === id) as AssetNode;
const scenarios = Object.keys(SCENARIOS) as AquaticsScenario[];

describe('aquatic centre dashboard model', () => {
  it('builds a valid store for every snapshot and replaces it without stale swimmers or guards', () => {
    const store = createAquaticsStore('morning');
    for (const scenario of [...scenarios, 'afternoon'] as const) {
      applyAquaticsSnapshot(store, SCENARIOS[scenario]);
      const nodes = store.getSnapshot().nodes, snapshot = SCENARIOS[scenario];
      const swimmers = nodes.filter(node => node.id.startsWith('swimmer:'));
      expect(swimmers, scenario).toHaveLength(snapshot.lanes.reduce((sum, lane) => sum + Math.min(LANE_VISIBLE, lane.swimmers), 0));
      expect(nodes.filter(node => node.id.startsWith('child:')), scenario).toHaveLength(Math.min(TEACHING_VISIBLE, snapshot.teaching.bathers));
      for (const node of nodes) if (node.attachment) expect(nodes.some(other => other.id === node.attachment!.nodeId), node.id).toBe(true);
    }
    store.dispose();
  });

  it('keeps one starting block per lane on the lane-start anchors with the lane state', () => {
    for (const scenario of scenarios) {
      const snapshot = SCENARIOS[scenario], nodes = aquaticsNodes(snapshot);
      expect(snapshot.lanes.map(lane => lane.laneId)).toEqual([...LANE_IDS]);
      snapshot.lanes.forEach((lane, i) => {
        const block = asset(nodes, `lane:${lane.laneId}`);
        expect(block.attachment).toEqual({ nodeId: 'pool:main', anchor: `lane-${i}-start` });
        expect(block.state).toBe(laneState(lane)); expect(block.entityId).toBe(lane.laneId);
      });
    }
    const afternoon = SCENARIOS.afternoon.lanes;
    expect(laneState(afternoon[0])).toBe('warning'); expect(laneState(afternoon[3])).toBe('critical'); expect(laneState(afternoon[5])).toBe('inactive'); expect(laneState(afternoon[4])).toBe('busy');
  });

  it('swims every visible swimmer on a closed loop inside its lane at the water height', () => {
    const nodes = aquaticsNodes(SCENARIOS.afternoon);
    for (const node of nodes.filter(item => item.id.startsWith('swimmer:')) as AssetNode[]) {
      const route = node.route!, points = route.points, lane = LANE_IDS.indexOf(node.id.split(':')[1] as typeof LANE_IDS[number]);
      expect(route.loop).toBe(true); expect(points[0]).toEqual(points.at(-1)); expect(node.position).toEqual(points[0]);
      expect(points.every(point => point[1] < LAP_POOL.water && point[1] > 0)).toBe(true);
      const zs = points.map(point => point[2]), center = laneLoop(lane, 0)[1][2] - .45;
      expect(Math.max(...zs.map(z => Math.abs(z - center)))).toBeLessThanOrEqual(.4501);
    }
    // Swimmers in one lane start at different points.
    const lane1 = nodes.filter(node => node.id.startsWith('swimmer:L1:')) as AssetNode[];
    expect(new Set(lane1.map(node => node.position!.join())).size).toBe(lane1.length);
  });

  it('derives metrics, post and water states from the same snapshot', () => {
    const afternoon = SCENARIOS.afternoon, metrics = aquaticsMetrics(afternoon), nodes = aquaticsNodes(afternoon);
    expect(metrics.inWater).toBe(afternoon.lanes.reduce((sum, lane) => sum + lane.swimmers, 0) + afternoon.teaching.bathers);
    expect(metrics.lanesOpen).toBe(5); expect(metrics.onPost).toBe(2);
    const teaching = afternoon.posts.find(post => post.id === 'teaching')!, north = afternoon.posts.find(post => post.id === 'north')!;
    expect(postState(afternoon, teaching)).toBe('warning'); expect(postState(afternoon, north)).toBe('critical');
    expect(asset(nodes, 'post:teaching').state).toBe('warning');
    expect(nodes.some(node => node.id === 'guard:teaching')).toBe(false); expect(nodes.some(node => node.id === 'guard:south')).toBe(true);
    expect(waterState(afternoon.water.teaching)).toBe('warning'); expect(waterState(afternoon.water.main)).toBe('normal');
    expect(asset(nodes, 'dosing:teaching').state).toBe('warning');
    expect(waterState({ ph: 7.3, chlorine: .1, temperature: 28 })).toBe('critical');
    // A post on break with an empty pool is not a problem.
    expect(postState(SCENARIOS.morning, SCENARIOS.morning.posts.find(post => post.id === 'teaching')!)).toBe('inactive');
  });

  it('shows a closed centre with a covered pool, a dry fountain and no people in the water', () => {
    const nodes = aquaticsNodes(SCENARIOS.closed);
    expect(asset(nodes, 'pool:main').variant).toBe('covered'); expect(asset(nodes, 'pool:teaching').variant).toBe('still');
    expect(nodes.some(node => /^(swimmer|child|guard):/.test(node.id))).toBe(false);
    for (const post of ['north', 'south', 'teaching']) expect(asset(nodes, `post:${post}`).state).toBe('inactive');
    expect(aquaticsMetrics(SCENARIOS.closed)).toMatchObject({ inWater: 0, lanesOpen: 0, capacity: 0 });
  });
});
