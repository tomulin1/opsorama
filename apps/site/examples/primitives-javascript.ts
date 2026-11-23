import type { SceneSettings } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/three';
import { makePrimitivesStore, noAssets, primitivesDefinition, type ChartData, type PrimitivesCallbacks, type PrimitivesSession } from './primitives-data';

/** Plain JavaScript: the store holds the whole definition; new data replaces the nodes (IDs stay, so only changed bars and labels rebuild). */
export function mountPrimitivesJavaScript(container: HTMLElement, settings: Partial<SceneSettings>, data: ChartData, callbacks: PrimitivesCallbacks): PrimitivesSession {
  const store = makePrimitivesStore(primitivesDefinition(data.values, data.labels), settings);
  const renderer = createSceneRenderer(container, store, { assets: noAssets, wheelZoom: true, onSelect: callbacks.select, onError: callbacks.error });
  callbacks.ready(renderer);
  return { store, setData: next => store.replace(primitivesDefinition(next.values, next.labels).nodes), dispose: () => { renderer.dispose(); store.dispose(); } };
}
