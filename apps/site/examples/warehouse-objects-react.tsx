import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeWarehouseObjectsStore, type WarehouseObjectsSession } from './warehouse-objects-data';

export function mountWarehouseObjectsReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void): WarehouseObjectsSession {
  const store = makeWarehouseObjectsStore(), root = createRoot(container);
  root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
