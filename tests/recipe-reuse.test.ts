import { describe, expect, it } from 'vitest';
import type { AssetNode, SceneNode, SceneStore } from '@opsorama/core';
import { assetDescriptors, basicAssets } from '@opsorama/renderer-three';
import { createAquaticsStore } from '../src/features/aquatics/model';
import { createEcommerceStore } from '../src/features/ecommerce/simulation';
import { createFarmStore } from '../src/features/farm/scene';
import { createOfficeStore } from '../src/features/office/scene';
import { createRestaurantStore } from '../src/features/restaurant/model';
import { makeDatacenterStore } from '../examples/datacenter-data';

/** The domain examples in their default scenario, read as plain scene data. */
const stores: readonly (readonly [string, () => SceneStore])[] = [
  ['ecommerce', () => createEcommerceStore()], ['office', createOfficeStore], ['restaurant', createRestaurantStore], ['farm', createFarmStore], ['aquatics', createAquaticsStore], ['datacenter', makeDatacenterStore],
];
const scenes = stores.map(([name, create]) => { const store = create(), nodes = store.getSnapshot().nodes; store.dispose(); return { name, nodes }; });
const assetsOf = (nodes: readonly SceneNode[]) => nodes.filter((node): node is AssetNode => node.kind === 'asset');

describe('recipe reuse (C4)', () => {
  it('every domain scene is built from the shared catalog, with no recipe-only models', () => {
    for (const { name, nodes } of scenes) {
      for (const node of assetsOf(nodes)) {
        expect(basicAssets[node.asset], `${name}: ${node.id} uses ${node.asset}`).toBeDefined();
        expect(assetDescriptors[node.asset], `${name}: ${node.asset}`).toBeDefined();
      }
    }
  });

  it('domains share definitions rather than duplicating them', () => {
    const uses = new Map<string, Set<string>>();
    for (const { name, nodes } of scenes) for (const node of assetsOf(nodes)) uses.set(node.asset, (uses.get(node.asset) ?? new Set()).add(name));
    const shared = [...uses].filter(([, domains]) => domains.size > 1).map(([asset]) => asset);
    expect(shared.length).toBeGreaterThanOrEqual(8);
    expect(shared).toEqual(expect.arrayContaining(['bench', 'map-pin', 'pallet', 'worker']));
  });
});
