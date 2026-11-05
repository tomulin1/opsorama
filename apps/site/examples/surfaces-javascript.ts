import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { makeSurfacesStore, type SurfacesSession } from './surfaces-data';
import { catalogAssets } from '@opsorama/objects';

export function mountSurfacesJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SurfacesSession {
  const store = makeSurfacesStore();
  const renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
