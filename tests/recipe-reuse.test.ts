import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AssetNode, SceneNode, SceneStore } from '@opsorama/core';
import { assetDescriptors, catalogAssets } from '@opsorama/objects';
import { createAquaticsStore } from '../apps/site/src/features/aquatics/model';
import { createEcommerceSimulation, createEcommerceStore } from '../apps/site/src/features/ecommerce/simulation';
import { createFarmStore } from '../apps/site/src/features/farm/scene';
import { createOfficeStore } from '../apps/site/src/features/office/scene';
import { createRestaurantStore } from '../apps/site/src/features/restaurant/model';
import { createWarehouseStore } from '../apps/site/src/features/warehouse/scene';
import { makeDatacenterStore } from '../apps/site/examples/datacenter-data';
import { createShiftGame } from '../apps/site/src/features/cutoff/rules';
import { playNodes } from '../apps/site/src/features/cutoff/scene';

/** The domain examples in their default scenario, read as plain scene data. */
const stores: readonly (readonly [string, () => SceneStore])[] = [
  ['ecommerce', () => createEcommerceStore()], ['office', createOfficeStore], ['restaurant', createRestaurantStore], ['farm', createFarmStore], ['aquatics', createAquaticsStore], ['datacenter', makeDatacenterStore], ['warehouse', () => createWarehouseStore()],
];
const scenes = stores.map(([name, create]) => { const store = create(), nodes = store.getSnapshot().nodes; store.dispose(); return { name, nodes }; });
const assetsOf = (nodes: readonly SceneNode[]) => nodes.filter((node): node is AssetNode => node.kind === 'asset');

describe('recipe reuse (C4)', () => {
  it('every domain scene is built from the shared catalog, with no recipe-only models', () => {
    for (const { name, nodes } of scenes) {
      for (const node of assetsOf(nodes)) {
        expect(catalogAssets[node.asset], `${name}: ${node.id} uses ${node.asset}`).toBeDefined();
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

  it('a recipe that is not a dashboard, the Cut-off game, reuses the catalog, simulation and panels', () => {
    const game = createShiftGame({ scenario: 'peak', seed: 1 });
    game.advance(120);
    // The dashboards as they start, and the e-commerce dashboard after the same two minutes, with shoppers' bags and parcels.
    const live = createEcommerceSimulation('peak', 1); live.advance(120);
    const nodes = playNodes(game, []), dashboards = new Set([...scenes.flatMap(({ nodes: list }) => assetsOf(list)), ...assetsOf(live.nodes())].map(node => node.asset));
    game.dispose(); live.dispose();
    // Every model of the game is a catalog model the dashboards use too: the game brings no models of its own.
    for (const node of assetsOf(nodes)) {
      expect(catalogAssets[node.asset], node.id).toBeDefined();
      expect(dashboards.has(node.asset), node.asset).toBe(true);
    }
    // Its feedback is made of generic nodes: here, markers such as the one on the truck that waits to unload.
    expect(nodes.filter(node => node.kind === 'marker').length).toBeGreaterThan(0);
    // The page builds its HUD from the shared panel package and the dashboards' feed loop.
    const page = readFileSync(new URL('../apps/site/src/features/cutoff/CutoffGame.tsx', import.meta.url), 'utf8');
    expect(page).toContain("from '@opsorama/react/ui'");
    expect(page).toContain("from '../ecommerce/feed-loop'");
    expect(page).not.toMatch(/from 'three'/);
  });
});
