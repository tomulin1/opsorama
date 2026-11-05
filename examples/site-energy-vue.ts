import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeSiteEnergyStore, type SiteEnergySession } from './site-energy-data';

export function mountSiteEnergyVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SiteEnergySession {
  const store = makeSiteEnergyStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
