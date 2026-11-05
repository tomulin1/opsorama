import { createRoot } from 'react-dom/client';
import { createSceneStore, type SceneNode } from '@opsorama/core';
import { DashboardProvider, EntityLayer, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';

export function mountContractReact(container: HTMLElement, nodes: readonly SceneNode[], ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, { zoom: 2.6 }), root = createRoot(container);
  const update = (next: readonly SceneNode[]) => root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 380 }} onReady={ready}><EntityLayer entities={next} mapEntity={(node: SceneNode) => node} /></SceneCanvas></DashboardProvider>);
  update(nodes);
  return { update, store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
