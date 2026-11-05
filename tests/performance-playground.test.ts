import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { resolveCountRepresentation, routeDuration, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions } from '@opsorama/objects';
import { createPerformanceStore, PERFORMANCE_PRESETS, performanceNodes, summarizeThroughput, type PerformancePreset } from '../apps/site/src/features/performance/model';

describe('repeatable performance fixture', () => {
  it.each(Object.keys(PERFORMANCE_PRESETS) as PerformancePreset[])('%s has exact instance totals, valid routes and stable synthetic identities', preset => {
    const nodes = performanceNodes(preset), count = PERFORMANCE_PRESETS[preset].instances;
    expect(nodes).toEqual(performanceNodes(preset));
    expect(nodes).toHaveLength(count + 1);
    expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length);
    const assets = nodes.filter((node): node is AssetNode => node.kind === 'asset');
    expect(assets).toHaveLength(count);
    expect(new Set(assets.map(node => node.asset)).size).toBe(8);
    expect(assets.filter(node => node.route)).toHaveLength(count / 8);
    const ground = nodes[0]; if (ground.kind !== 'ground') throw new Error('Missing ground');
    for (const node of assets) {
      expect(node.entityId).toBeUndefined();
      expect(node.scale).toEqual([.32, .32, .32]);
      expect(Math.abs(node.position![0])).toBeLessThan(ground.size[0] / 2 - 1);
      expect(Math.abs(node.position![2])).toBeLessThan(ground.size[1] / 2 - 1);
      if (node.count !== undefined) expect(() => resolveCountRepresentation(node, assetCountDefinitions[node.asset])).not.toThrow();
      if (node.route) { expect(node.route.points[0]).toEqual(node.route.points.at(-1)); expect(routeDuration(node.route)).toBeGreaterThan(0); }
    }
    const store = createPerformanceStore(preset);
    expect(store.getSnapshot().nodes).toHaveLength(count + 1);
    expect(store.getSnapshot().settings).toMatchObject({ shadows: false, labels: false, motion: true, zoom: 1 });
    store.dispose();
  });

  it('all workload models build with the actual options and have finite bounds and owned cleanup', () => {
    for (const node of performanceNodes('mega').slice(1, 9) as AssetNode[]) {
      const object = catalogAssets[node.asset](node), bounds = new THREE.Box3().setFromObject(object);
      expect(bounds.isEmpty()).toBe(false);
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      let meshCount = 0; const disposed = new Set<THREE.BufferGeometry>();
      object.traverse(child => { if (child instanceof THREE.Mesh) { meshCount++; child.geometry.addEventListener('dispose', () => disposed.add(child.geometry)); } });
      expect(meshCount).toBeGreaterThan(0);
      disposeObject(object); expect(disposed.size).toBeGreaterThan(0);
    }
  });
});

describe('completed-frame throughput', () => {
  it('weights delayed timer intervals by real elapsed time, including intervals with no completed frames', () => {
    const result = summarizeThroughput([{ frames: 60, elapsedMs: 1000 }, { frames: 30, elapsedMs: 2000 }, { frames: 0, elapsedMs: 1000 }]);
    expect(result).toEqual({ frames: 90, elapsedMs: 4000, averageFps: 22.5, minimumIntervalFps: 0, maximumIntervalFps: 60, intervals: 3 });
    expect(summarizeThroughput([])).toBeNull();
  });
  it.each([{ frames: -1, elapsedMs: 1000 }, { frames: 1.5, elapsedMs: 1000 }, { frames: 1, elapsedMs: 0 }, { frames: 1, elapsedMs: Infinity }])('rejects invalid input %j', sample => {
    expect(() => summarizeThroughput([sample])).toThrow('Throughput samples require');
  });
});
