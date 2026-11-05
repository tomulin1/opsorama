import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { makeDomainKitsStore, type DomainKitsSession } from './domain-kits-data';

export function mountDomainKitsJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): DomainKitsSession {
  const store = makeDomainKitsStore();
  const renderer = createSceneRenderer(container, store); ready(renderer);
  return { store, dispose: () => { renderer.dispose(); store.dispose(); } };
}
