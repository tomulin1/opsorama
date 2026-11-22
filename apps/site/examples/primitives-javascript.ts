import type { SceneSettings } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/three';
import { makePrimitivesStore, noAssets, primitivesDefinition, type ChartValues, type PrimitivesCallbacks, type PrimitivesSession } from './primitives-data';

/** Plain JavaScript: the store holds the whole definition; a new data set replaces the nodes (IDs stay, so only changed bars rebuild). */
export function mountPrimitivesJavaScript(container: HTMLElement, settings: Partial<SceneSettings>, values: ChartValues, callbacks: PrimitivesCallbacks): PrimitivesSession {
  const store = makePrimitivesStore(primitivesDefinition(values), settings);
  const renderer = createSceneRenderer(container, store, { assets: noAssets, wheelZoom: true, onSelect: callbacks.select });
  callbacks.ready(renderer);
  return { store, setValues: next => store.replace(primitivesDefinition(next).nodes), dispose: () => { renderer.dispose(); store.dispose(); } };
}
