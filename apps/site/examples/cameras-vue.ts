import { createApp, defineComponent, h } from 'vue';
import type { CameraSettings } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, useCameraView, useScene } from '@opsorama/vue';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CAMERA_READOUT_CLASS, cameraReadout, makeCamerasStore, type CameraSession } from './cameras-data';

/** Any component under the provider reads the camera with `useCameraView`; `useSceneRenderer` gives the camera API. */
const CameraReadout = defineComponent({
  name: 'CameraReadout',
  setup() {
    const view = useCameraView(), snapshot = useScene();
    return () => h('output', { class: CAMERA_READOUT_CLASS }, cameraReadout(snapshot.value.settings.camera.projection, view.value));
  },
});

/** Native Vue: the scene and its readout under one `DashboardProvider`. `touchGestures` is mount-time. */
export function mountCamerasVue(container: HTMLElement, camera: CameraSettings, ready: (renderer: SceneRenderer) => void, touchGestures = false): CameraSession {
  const store = makeCamerasStore(camera);
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, wheelZoom: true, touchGestures, style: { height: '420px' }, onReady: ready }, { default: () => h(CameraReadout) }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
