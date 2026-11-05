import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeSurfacesStore, type SurfacesSession } from './surfaces-data';

export function mountSurfacesVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SurfacesSession {
  const store = makeSurfacesStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
