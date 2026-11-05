import { createSceneStore, type AssetNode } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/renderer-three';

export function mountDisplayJavaScript(container: HTMLElement, initial: AssetNode) {
  const store = createSceneStore({ schemaVersion: 1, nodes: [initial] }, { shadows: false }), renderer = createSceneRenderer(container, store);
  return { update: (node: AssetNode) => store.upsert(node), configure: store.configure, dispose: () => { renderer.dispose(); store.dispose(); } };
}
