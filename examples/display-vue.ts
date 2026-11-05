import { createApp, h, shallowRef } from 'vue';
import { createSceneStore, type AssetNode } from '@opsorama/core';
import { DashboardProvider, Asset, SceneCanvas } from '@opsorama/vue';

export function mountDisplayVue(container: HTMLElement, initial: AssetNode) {
  const store = createSceneStore(undefined, { shadows: false }), node = shallowRef(initial);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { style: { height: '380px' } }, { default: () => h(Asset, { ...node.value, position: node.value.position && [...node.value.position], rotation: node.value.rotation && [...node.value.rotation], scale: node.value.scale && [...node.value.scale], display: node.value.display, surfaceLabel: node.value.surfaceLabel }) }) }) });
  app.mount(container);
  return { update: (value: AssetNode) => { node.value = value; }, configure: store.configure, dispose: () => { app.unmount(); store.dispose(); } };
}
