import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeLogisticsStore, type LogisticsSession } from './logistics-data';

export function mountLogisticsVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): LogisticsSession {
  const store = makeLogisticsStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
