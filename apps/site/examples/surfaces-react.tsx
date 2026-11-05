import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { makeSurfacesStore, type SurfacesSession } from './surfaces-data';
import { catalogAssets } from '@opsorama/objects';

export function mountSurfacesReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SurfacesSession {
  const store = makeSurfacesStore(), root = createRoot(container);
  root.render(<DashboardProvider store={store}><SceneCanvas assets={catalogAssets} style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
