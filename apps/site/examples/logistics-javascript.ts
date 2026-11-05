import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { makeLogisticsStore, type LogisticsSession } from './logistics-data';

export function mountLogisticsJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): LogisticsSession {
  const store = makeLogisticsStore();
  const renderer = createSceneRenderer(container, store); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
