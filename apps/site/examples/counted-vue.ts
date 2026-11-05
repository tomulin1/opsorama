import { createApp, h, shallowRef } from 'vue';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

export function mountCountedVue(container: HTMLElement, initial: AssetNode, ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore({ schemaVersion: 1, nodes: [] }, { motion: false, shadows: false }), node = shallowRef(initial);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '340px' }, onReady: ready }, { default: () => h(Asset, { id: node.value.id, asset: node.value.asset, count: node.value.count, countLayout: node.value.countLayout, multiplier: node.value.multiplier, surfaceLabel: node.value.surfaceLabel, color: node.value.color, label: node.value.label, selectable: node.value.selectable, scale: node.value.scale && [...node.value.scale] }) }) }) });
  app.mount(container);
  return { update: (value: AssetNode) => { node.value = value; }, dispose: () => { app.unmount(); store.dispose(); } };
}
