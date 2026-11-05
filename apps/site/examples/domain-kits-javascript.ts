import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { makeDomainKitsStore, type DomainKitsSession } from './domain-kits-data';
import { catalogAssets } from '@opsorama/objects';

export function mountDomainKitsJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): DomainKitsSession {
  const store = makeDomainKitsStore();
  const renderer = createSceneRenderer(container, store, { assets: catalogAssets }); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
