import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { makeSiteEnergyStore, type SiteEnergySession } from './site-energy-data';
import { catalogAssets } from '@opsorama/objects';

export function mountSiteEnergyJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SiteEnergySession {
  const store = makeSiteEnergyStore();
  const renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
