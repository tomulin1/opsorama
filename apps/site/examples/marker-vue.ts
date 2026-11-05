import { createApp, h, shallowRef } from 'vue';
import { createSceneStore, type MarkerNode } from '@opsorama/core';
import { DashboardProvider, Marker, SceneCanvas, SceneElement } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { markerGallery, markerProps, markerSceneSettings, markerStage } from './marker-data';
import { catalogAssets } from '@opsorama/objects';

/** Native Vue: `Marker` takes the marker fields as props; the stage nodes go through `SceneElement`. */
export function mountMarkerVue(container: HTMLElement, featured: MarkerNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, markerSceneSettings), marker = shallowRef(featured);
  // Vue's prop typing cannot see through the shared node component, so the fields go in as a plain record.
  const props = (node: MarkerNode): { id: string } & Record<string, unknown> => ({ ...markerProps(node) });
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '380px' }, onReady: ready }, { default: () => [
    ...markerStage.map(node => h(SceneElement, { key: node.id, node })),
    h(Marker, props(marker.value)),
    ...markerGallery.map(item => h(Marker, { key: item.id, ...props(item) })),
  ] }) }) });
  app.mount(container);
  return { update: (value: MarkerNode) => { marker.value = value; }, dispose: () => { app.unmount(); store.dispose(); } };
}
