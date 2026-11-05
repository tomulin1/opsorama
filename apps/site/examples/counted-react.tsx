import { createRoot } from 'react-dom/client';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

export function mountCountedReact(container: HTMLElement, initial: AssetNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes: [] }, { motion: false, shadows: false }), root = createRoot(container);
  const update = (node: AssetNode) => root.render(<DashboardProvider store={store}><SceneCanvas assets={catalogAssets} style={{ height: 340 }} onReady={ready}><Asset {...node} /></SceneCanvas></DashboardProvider>);
  update(initial);
  // The documentation host may dispose during its own React effect cleanup.
  // Unmount this independent root outside that commit, then release its store.
  return { update, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
