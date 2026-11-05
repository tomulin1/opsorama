import { createApp, h, shallowRef } from 'vue';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

export function mountIndicatorVue(container: HTMLElement, initial: AssetNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, { motion: false, shadows: false }), node = shallowRef(initial);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '380px' }, onReady: ready }, { default: () => h(Asset, { id: node.value.id, asset: node.value.asset, variant: node.value.variant, measurement: node.value.measurement, state: node.value.state, color: node.value.color, selectable: node.value.selectable, scale: node.value.scale && [...node.value.scale] }) }) }) });
  app.mount(container);
  return { update: (value: AssetNode) => { node.value = value; }, dispose: () => { app.unmount(); store.dispose(); } };
}
