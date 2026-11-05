import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { makeBuildingSession, type BuildingSession, type BuildingStateCallback } from './building-data';
import { catalogAssets } from '@opsorama/objects';
export function mountBuildingVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void, onState: BuildingStateCallback): BuildingSession {
  const session = makeBuildingSession(onState);
  const app = createApp({ render: () => h(DashboardProvider, { store: session.store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '420px' }, onReady: ready }) }) }); app.mount(container);
  return { store: session.store, dispose: () => { session.unbind(); app.unmount(); session.store.dispose(); } };
}
