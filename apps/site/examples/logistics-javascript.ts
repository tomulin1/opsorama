import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { makeLogisticsStore, type LogisticsSession } from './logistics-data';
import { catalogAssets } from '@opsorama/objects';

export function mountLogisticsJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): LogisticsSession {
  const store = makeLogisticsStore();
  const renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
