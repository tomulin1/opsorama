import { createSceneStore, type AssetNode } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

export function mountDisplayJavaScript(container: HTMLElement, initial: AssetNode) {
  const store = createSceneStore({ schemaVersion: 1, nodes: [initial] }, { shadows: false }), renderer = createSceneRenderer(container, store, { assets: catalogAssets });
  return { update: (node: AssetNode) => store.upsert(node), configure: store.configure, dispose: () => { renderer.dispose(); store.dispose(); } };
}
