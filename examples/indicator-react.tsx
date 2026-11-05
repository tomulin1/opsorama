import { createRoot } from 'react-dom/client';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';

export function mountIndicatorReact(container: HTMLElement, initial: AssetNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, { motion: false, shadows: false }), root = createRoot(container);
  const update = (node: AssetNode) => root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 380 }} onReady={ready}><Asset {...node} /></SceneCanvas></DashboardProvider>);
  update(initial);
  return { update, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
