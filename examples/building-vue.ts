import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/renderer-three';
import { makeBuildingSession, type BuildingSession, type BuildingStateCallback } from './building-data';
export function mountBuildingVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void, onState: BuildingStateCallback): BuildingSession {
  const session = makeBuildingSession(onState);
  const app = createApp({ render: () => h(DashboardProvider, { store: session.store }, { default: () => h(SceneCanvas, { style: { height: '420px' }, onReady: ready }) }) }); app.mount(container);
  return { store: session.store, dispose: () => { session.unbind(); app.unmount(); session.store.dispose(); } };
}
