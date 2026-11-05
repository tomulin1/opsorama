import { createApp, h, shallowRef } from 'vue';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, EntityLayer, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { motionControllers, motionSceneNodes } from './motion-data';
import { catalogAssets } from '@opsorama/objects';

export function mountMotionVue(container: HTMLElement, agents: readonly AssetNode[], ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, { zoom: 1.45 }), people = shallowRef(agents);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '460px' }, controllers: motionControllers, onReady: ready }, { default: () => [
    h(EntityLayer, { nodes: motionSceneNodes }),
    ...people.value.map(node => h(Asset, { key: node.id, id: node.id, asset: node.asset, variant: node.variant, label: node.label, labelMode: node.labelMode, selectable: node.selectable, color: node.color, position: node.position && [...node.position], rotation: node.rotation && [...node.rotation], scale: node.scale && [...node.scale], attachment: node.attachment, route: node.route, controller: node.controller, transfer: node.transfer, count: node.count })),
  ] }) }) });
  app.mount(container);
  return { update: (next: readonly AssetNode[]) => { people.value = next; }, store, dispose: () => { app.unmount(); store.dispose(); } };
}
