import { createSceneStore, type MarkerNode } from '@opsorama/core';
import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { markerSceneNodes, markerSceneSettings } from './marker-data';
import { catalogAssets } from '@opsorama/objects';

/** Plain JavaScript: the store holds the marker like any node, and `upsert` restyles it. */
export function mountMarkerJavaScript(container: HTMLElement, featured: MarkerNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes: markerSceneNodes(featured) }, markerSceneSettings), renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  return { update: (marker: MarkerNode) => store.upsert(marker), dispose: () => { renderer.dispose(); store.dispose(); } };
}
