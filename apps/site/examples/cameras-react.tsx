import { createRoot } from 'react-dom/client';
import type { CameraSettings } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, useCameraView, useScene } from '@opsorama/react';
import type { SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CAMERA_READOUT_CLASS, cameraReadout, makeCamerasStore, type CameraSession } from './cameras-data';

/** Any component under the provider reads the camera with `useCameraView`; `useSceneRenderer` gives the camera API. */
function CameraReadout() {
  const view = useCameraView(), projection = useScene().settings.camera.projection;
  return <output className={CAMERA_READOUT_CLASS}>{cameraReadout(projection, view)}</output>;
}

/** React: the scene and its readout under one `DashboardProvider`. */
export function mountCamerasReact(container: HTMLElement, camera: CameraSettings, ready: (renderer: SceneRenderer) => void): CameraSession {
  const store = makeCamerasStore(camera), root = createRoot(container);
  root.render(<DashboardProvider store={store}><SceneCanvas assets={catalogAssets} wheelZoom style={{ height: 420 }} onReady={ready}><CameraReadout /></SceneCanvas></DashboardProvider>);
  return { store, dispose: () => { queueMicrotask(() => { root.unmount(); store.dispose(); }); } };
}
