import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { makeBuildingSession, type BuildingSession, type BuildingStateCallback } from './building-data';
import { catalogAssets } from '@opsorama/objects';
export function mountBuildingReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void, onState: BuildingStateCallback): BuildingSession {
  const session = makeBuildingSession(onState), root = createRoot(container);
  root.render(<DashboardProvider store={session.store}><SceneCanvas assets={catalogAssets} style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store: session.store, dispose: () => { session.unbind(); queueMicrotask(() => { root.unmount(); session.store.dispose(); }); } };
}
