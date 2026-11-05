import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeBuildingSession, type BuildingSession, type BuildingStateCallback } from './building-data';
export function mountBuildingReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void, onState: BuildingStateCallback): BuildingSession {
  const session = makeBuildingSession(onState), root = createRoot(container);
  root.render(<DashboardProvider store={session.store}><SceneCanvas style={{ height: 420 }} onReady={ready} /></DashboardProvider>);
  return { store: session.store, dispose: () => { session.unbind(); queueMicrotask(() => { root.unmount(); session.store.dispose(); }); } };
}
