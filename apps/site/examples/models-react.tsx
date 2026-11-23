import { createRoot } from 'react-dom/client';
import type { SceneNode, SceneSettings } from '@opsorama/core';
import { Asset, DashboardProvider, Ground, SceneCanvas, Zone } from '@opsorama/react';
import { makeModelsStore, modelAssets, sceneNodes, type ModelsCallbacks, type ModelsData, type ModelsSession } from './models-data';

/** The component for a node of this scene: ground, zone or asset. */
function SceneNodeView({ node }: { node: SceneNode }) {
  if (node.kind === 'ground') return <Ground {...node} />;
  if (node.kind === 'zone') return <Zone {...node} />;
  if (node.kind === 'asset') return <Asset {...node} />;
  return null;
}

/** React: catalog models and glTF drones as `Asset` components under one `DashboardProvider`; a new count re-renders the drones. */
export function mountModelsReact(container: HTMLElement, settings: Partial<SceneSettings>, data: ModelsData, callbacks: ModelsCallbacks): ModelsSession {
  const store = makeModelsStore({ schemaVersion: 1, nodes: [] }, { ...settings, theme: data.theme }), root = createRoot(container);
  const render = (next: ModelsData) => {
    store.configure({ theme: next.theme });
    root.render(<DashboardProvider store={store}>
      <SceneCanvas assets={modelAssets} wheelZoom style={{ height: 460 }} onReady={callbacks.ready} onSelect={callbacks.select} onError={callbacks.error} />
      {sceneNodes(next.count).map(node => <SceneNodeView key={node.id} node={node} />)}
    </DashboardProvider>);
  };
  render(data);
  return { store, setData: render, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
