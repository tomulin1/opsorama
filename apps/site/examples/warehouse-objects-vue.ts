import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { makeWarehouseObjectsStore, type WarehouseObjectsSession } from './warehouse-objects-data';
import { catalogAssets } from '@opsorama/objects';

export function mountWarehouseObjectsVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): WarehouseObjectsSession {
  const store = makeWarehouseObjectsStore();
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '420px' }, onReady: ready }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
