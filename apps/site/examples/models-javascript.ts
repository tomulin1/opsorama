import type { SceneSettings } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/three';
import { makeModelsStore, modelAssets, modelsDefinition, type ModelsCallbacks, type ModelsData, type ModelsSession } from './models-data';

/** Plain JavaScript: the store holds the whole definition; a new drone count replaces the nodes and a theme change rebuilds the models from the cached file. */
export function mountModelsJavaScript(container: HTMLElement, settings: Partial<SceneSettings>, data: ModelsData, callbacks: ModelsCallbacks): ModelsSession {
  const store = makeModelsStore(modelsDefinition(data.count), { ...settings, theme: data.theme });
  const renderer = createSceneRenderer(container, store, { assets: modelAssets, wheelZoom: true, onSelect: callbacks.select, onError: callbacks.error });
  callbacks.ready(renderer);
  return { store, setData: next => { store.configure({ theme: next.theme }); store.replace(modelsDefinition(next.count).nodes); }, dispose: () => { renderer.dispose(); store.dispose(); } };
}
