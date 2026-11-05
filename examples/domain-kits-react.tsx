import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeDomainKitsStore, type DomainKitsSession } from './domain-kits-data';

export function mountDomainKitsReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void): DomainKitsSession {
  const store = makeDomainKitsStore(), root = createRoot(container);
  root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
