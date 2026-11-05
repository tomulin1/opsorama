import { createSceneStore, type AssetNode } from '@opsorama/core';
import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

export function mountCountedJavaScript(container: HTMLElement, initial: AssetNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes: [initial] }, { motion: false, shadows: false }), renderer = createSceneRenderer(container, store, { assets: catalogAssets });
  ready(renderer);
  return { update: (node: AssetNode) => store.upsert(node), dispose: () => { renderer.dispose(); store.dispose(); } };
}
