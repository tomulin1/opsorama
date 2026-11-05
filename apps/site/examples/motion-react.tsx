import { createRoot } from 'react-dom/client';
import { createSceneStore, type AssetNode, type SceneNode } from '@opsorama/core';
import { DashboardProvider, Asset, EntityLayer, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { motionControllers, motionSceneNodes } from './motion-data';
import { catalogAssets } from '@opsorama/objects';

export function mountMotionReact(container: HTMLElement, agents: readonly AssetNode[], ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, { zoom: 1.45 }), root = createRoot(container);
  const update = (next: readonly AssetNode[]) => root.render(<DashboardProvider store={store}><SceneCanvas assets={catalogAssets} style={{ height: 460 }} controllers={motionControllers} onReady={ready}><EntityLayer entities={motionSceneNodes} mapEntity={(entry: SceneNode) => entry} />{next.map(node => <Asset key={node.id} {...node} />)}</SceneCanvas></DashboardProvider>);
  update(agents);
  return { update, store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
