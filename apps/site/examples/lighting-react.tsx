import { createRoot } from 'react-dom/client';
import type { SceneNode } from '@opsorama/core';
import { Asset, DashboardProvider, Ground, SceneCanvas } from '@opsorama/react';
import { lightingAssets, lightingSettings, makeLightingStore, sceneNodes, type LightingCallbacks, type LightingData, type LightingSession } from './lighting-data';

function SceneNodeView({ node }: { node: SceneNode }) {
  if (node.kind === 'ground') return <Ground {...node} />;
  if (node.kind === 'asset') return <Asset {...node} />;
  return null;
}

/** React: the yard as components under one `DashboardProvider`; the page's choices go to `store.configure`. */
export function mountLightingReact(container: HTMLElement, data: LightingData, callbacks: LightingCallbacks): LightingSession {
  const store = makeLightingStore(data, { schemaVersion: 1, nodes: [] }), root = createRoot(container);
  root.render(<DashboardProvider store={store}>
    <SceneCanvas assets={lightingAssets} wheelZoom style={{ height: 460 }} onReady={callbacks.ready} onSelect={callbacks.select} onError={callbacks.error} />
    {sceneNodes().map(node => <SceneNodeView key={node.id} node={node} />)}
  </DashboardProvider>);
  return { store, setData: next => store.configure(lightingSettings(next)), dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
