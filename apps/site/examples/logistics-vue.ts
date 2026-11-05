import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { makeLogisticsStore, type LogisticsSession } from './logistics-data';
import { catalogAssets } from '@opsorama/objects';

export function mountLogisticsVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): LogisticsSession {
  const store = makeLogisticsStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
