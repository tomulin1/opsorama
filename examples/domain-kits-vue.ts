import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeDomainKitsStore, type DomainKitsSession } from './domain-kits-data';

export function mountDomainKitsVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): DomainKitsSession {
  const store = makeDomainKitsStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
