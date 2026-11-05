import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { makeWarehouseObjectsStore, type WarehouseObjectsSession } from './warehouse-objects-data';

export function mountWarehouseObjectsJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): WarehouseObjectsSession {
  const store = makeWarehouseObjectsStore();
  const renderer = createSceneRenderer(container, store); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
