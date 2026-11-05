import { createRoot } from 'react-dom/client';
import { DashboardProvider, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { createMoveModeSession, type MoveModeSession } from './move-mode-data';

export function mountMoveModeReact(container: HTMLElement, ready: (renderer: SceneRenderer) => void): MoveModeSession {
  const session = createMoveModeSession(), root = createRoot(container);
  const onReady = (renderer: SceneRenderer) => { session.connect(renderer); ready(renderer); };
  root.render(<DashboardProvider store={session.store}><SceneCanvas style={{ height: 460 }} onReady={onReady} /></DashboardProvider>);
  return { ...session, dispose: () => { queueMicrotask(() => { root.unmount(); session.dispose(); }); } };
}
