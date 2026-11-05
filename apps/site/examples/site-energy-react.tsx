import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeSiteEnergyStore, type SiteEnergySession } from './site-energy-data';

export function mountSiteEnergyReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void): SiteEnergySession {
  const store = makeSiteEnergyStore(), root = createRoot(container);
  root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
