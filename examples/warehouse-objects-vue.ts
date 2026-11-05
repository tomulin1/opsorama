import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeWarehouseObjectsStore, type WarehouseObjectsSession } from './warehouse-objects-data';

export function mountWarehouseObjectsVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): WarehouseObjectsSession {
  const store = makeWarehouseObjectsStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
