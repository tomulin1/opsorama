import { createApp, h } from 'vue';
import type { SceneNode } from '@opsorama/core';
import { Asset, DashboardProvider, Ground, SceneCanvas } from '@opsorama/vue';
import { lightingAssets, lightingSettings, makeLightingStore, sceneNodes, type LightingCallbacks, type LightingData, type LightingSession } from './lighting-data';

const props = (node: SceneNode): { id: string; [key: string]: unknown } => ({ ...node, key: node.id, position: node.position && [...node.position], rotation: node.rotation && [...node.rotation], scale: node.scale && [...node.scale] });

/** Native Vue: the yard as components under one `DashboardProvider`; the page's choices go to `store.configure`. */
export function mountLightingVue(container: HTMLElement, data: LightingData, callbacks: LightingCallbacks): LightingSession {
  const store = makeLightingStore(data, { schemaVersion: 1, nodes: [] });
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => [
    h(SceneCanvas, { assets: lightingAssets, wheelZoom: true, style: { height: '460px' }, onReady: callbacks.ready, onSelect: callbacks.select, onError: callbacks.error }),
    ...sceneNodes().map(node => h(node.kind === 'ground' ? Ground : Asset, props(node))),
  ] }) });
  app.mount(container);
  return { store, setData: next => store.configure(lightingSettings(next)), dispose: () => { app.unmount(); store.dispose(); } };
}
