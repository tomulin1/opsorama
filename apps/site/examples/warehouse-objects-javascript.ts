import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { makeWarehouseObjectsStore, type WarehouseObjectsSession } from './warehouse-objects-data';
import { catalogAssets } from '@opsorama/objects';

export function mountWarehouseObjectsJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): WarehouseObjectsSession {
  const store = makeWarehouseObjectsStore();
  const renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
