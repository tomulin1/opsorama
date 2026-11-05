import { createRoot } from 'react-dom/client';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, SceneCanvas } from '@opsorama/react';

export function mountDisplayReact(container: HTMLElement, initial: AssetNode) {
  const store = createSceneStore(undefined, { shadows: false }), root = createRoot(container);
  const update = (node: AssetNode) => root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 380 }}><Asset {...node} /></SceneCanvas></DashboardProvider>);
  update(initial);
  return { update, configure: store.configure, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
