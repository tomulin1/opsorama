import { createSceneStore, type AssetNode } from '@opsorama/core';
import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { motionControllers, motionSceneNodes } from './motion-data';
import { catalogAssets } from '@opsorama/objects';

export function mountMotionJavaScript(container: HTMLElement, agents: readonly AssetNode[], ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes: [...motionSceneNodes, ...agents] }, { zoom: 1.45 }), renderer = createSceneRenderer(container, store, { assets: catalogAssets, controllers: motionControllers }); ready(renderer);
  let current = new Set(agents.map(node => node.id));
  // Unchanged routes keep their progress; new routes join at the first shared point. Nodes the host no longer lists (shipped parcels) are removed.
  const update = (next: readonly AssetNode[]) => { const ids = new Set(next.map(node => node.id)); for (const id of current) if (!ids.has(id)) store.remove(id); next.forEach(node => store.upsert(node)); current = ids; };
  return { update, store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
