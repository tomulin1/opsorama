import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { makeSiteEnergyStore, type SiteEnergySession } from './site-energy-data';

export function mountSiteEnergyJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SiteEnergySession {
  const store = makeSiteEnergyStore();
  const renderer = createSceneRenderer(container, store); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
