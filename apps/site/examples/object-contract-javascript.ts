import { createSceneStore, type SceneNode } from '@opsorama/core';
import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

export function mountContractJavaScript(container: HTMLElement, nodes: readonly SceneNode[], ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes }, { zoom: 2.6 }), renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  // replace() commits every node at once; unchanged nodes keep their model and position.
  return { update: (next: readonly SceneNode[]) => store.replace(next), store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
