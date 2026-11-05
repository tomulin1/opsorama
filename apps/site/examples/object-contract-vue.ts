import { createApp, h, shallowRef } from 'vue';
import { createSceneStore, type SceneNode } from '@opsorama/core';
import { DashboardProvider, EntityLayer, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';

export function mountContractVue(container: HTMLElement, nodes: readonly SceneNode[], ready: (renderer: SceneRenderer) => void) {
  const store = createSceneStore(undefined, { zoom: 2.6 }), current = shallowRef(nodes);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '380px' }, onReady: ready }, { default: () => h(EntityLayer, { nodes: current.value }) }) }) });
  app.mount(container);
  return { update: (next: readonly SceneNode[]) => { current.value = next; }, store, dispose: () => { app.unmount(); store.dispose(); } };
}
