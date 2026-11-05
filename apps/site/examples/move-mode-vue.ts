import { createApp, h } from 'vue';
import { DashboardProvider, SceneCanvas } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { createMoveModeSession, type MoveModeSession } from './move-mode-data';
import { catalogAssets } from '@opsorama/objects';

export function mountMoveModeVue(container: HTMLElement, ready: (renderer: SceneRenderer) => void): MoveModeSession {
  const session = createMoveModeSession();
  const onReady = (renderer: SceneRenderer) => { session.connect(renderer); ready(renderer); };
  const app = createApp({ render: () => h(DashboardProvider, { store: session.store }, { default: () => h(SceneCanvas, { assets: catalogAssets, style: { height: '460px' }, onReady }) }) });
  app.mount(container);
  return { ...session, dispose: () => { app.unmount(); session.dispose(); } };
}
