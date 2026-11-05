import { createSceneStore, type MarkerNode } from '@opsorama/core';
import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { markerSceneNodes, markerSceneSettings } from './marker-data';

/** Plain JavaScript: the store holds the marker like any node, and `upsert` restyles it. */
export function mountMarkerJavaScript(container: HTMLElement, featured: MarkerNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes: markerSceneNodes(featured) }, markerSceneSettings), renderer = createSceneRenderer(container, store); ready(renderer);
  return { update: (marker: MarkerNode) => store.upsert(marker), dispose: () => { renderer.dispose(); store.dispose(); } };
}
