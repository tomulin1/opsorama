import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeLogisticsStore, type LogisticsSession } from './logistics-data';

export function mountLogisticsReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void): LogisticsSession {
  const store = makeLogisticsStore(), root = createRoot(container);
  root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
