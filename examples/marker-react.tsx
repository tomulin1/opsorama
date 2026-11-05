import { createRoot } from 'react-dom/client';
import { createSceneStore, type MarkerNode } from '@opsorama/core';
import { Asset, DashboardProvider, Ground, Marker, SceneCanvas } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { markerGallery, markerProps, markerSceneSettings, markerStage } from './marker-data';

/** React: `<Marker>` takes the same fields as a marker node, without `kind`. */
export function mountMarkerReact(container: HTMLElement, featured: MarkerNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, markerSceneSettings), root = createRoot(container);
  const [floor, cabinet] = markerStage;
  const update = (marker: MarkerNode) => root.render(<DashboardProvider store={store}><SceneCanvas style={{ height: 380 }} onReady={ready}>
    {floor.kind === 'ground' && <Ground {...floor} />}{cabinet.kind === 'asset' && <Asset {...cabinet} />}
    <Marker {...markerProps(marker)} />
    {markerGallery.map(item => <Marker key={item.id} {...markerProps(item)} />)}
  </SceneCanvas></DashboardProvider>);
  update(featured);
  return { update, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
