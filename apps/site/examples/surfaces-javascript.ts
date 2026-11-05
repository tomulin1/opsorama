import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { makeSurfacesStore, type SurfacesSession } from './surfaces-data';

export function mountSurfacesJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SurfacesSession {
  const store = makeSurfacesStore();
  const renderer = createSceneRenderer(container, store); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
