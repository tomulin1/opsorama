import { createApp, h, shallowRef } from 'vue';
import type { SceneNode, SceneSettings } from '@opsorama/core';
import { Asset, DashboardProvider, Ground, SceneCanvas, Zone } from '@opsorama/vue';
import { makeModelsStore, modelAssets, sceneNodes, type ModelsCallbacks, type ModelsData, type ModelsSession } from './models-data';

/** Props of a node for its Vue component, with key; Vue's array props take mutable copies of the frozen vectors. */
const props = (node: SceneNode): { id: string; [key: string]: unknown } => ({ ...node, key: node.id, position: node.position && [...node.position], rotation: node.rotation && [...node.rotation], scale: node.scale && [...node.scale] });
const component = (node: SceneNode) => node.kind === 'ground' ? Ground : node.kind === 'zone' ? Zone : Asset;

/** Native Vue: catalog models and glTF drones as `Asset` components under one `DashboardProvider`; a new count re-renders the drones. */
export function mountModelsVue(container: HTMLElement, settings: Partial<SceneSettings>, initial: ModelsData, callbacks: ModelsCallbacks): ModelsSession {
  const store = makeModelsStore({ schemaVersion: 1, nodes: [] }, { ...settings, theme: initial.theme }), data = shallowRef(initial);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => [
    h(SceneCanvas, { assets: modelAssets, wheelZoom: true, style: { height: '460px' }, onReady: callbacks.ready, onSelect: callbacks.select, onError: callbacks.error }),
    ...sceneNodes(data.value.count).map(node => h(component(node), props(node))),
  ] }) });
  app.mount(container);
  return { store, setData: next => { store.configure({ theme: next.theme }); data.value = next; }, dispose: () => { app.unmount(); store.dispose(); } };
}
