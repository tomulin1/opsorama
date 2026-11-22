import type { CameraSettings } from '@opsorama/core';
import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CAMERA_READOUT_CLASS, cameraReadout, makeCamerasStore, type CameraSession } from './cameras-data';

/** Plain JavaScript: the renderer's camera API, with `onCameraChange` driving an HTML readout over the scene. */
export function mountCamerasJavaScript(container: HTMLElement, camera: CameraSettings, ready: (renderer: SceneRenderer) => void): CameraSession {
  const store = makeCamerasStore(camera), renderer = createSceneRenderer(container, store, { assets: catalogAssets, wheelZoom: true });
  const readout = document.createElement('output'); readout.className = CAMERA_READOUT_CLASS; container.append(readout);
  const show = () => { readout.textContent = cameraReadout(store.getSnapshot().settings.camera.projection, renderer.getCameraView()); };
  const stopCamera = renderer.onCameraChange(show), stopStore = store.subscribe(show); show(); ready(renderer);
  return { store, dispose: () => { stopCamera(); stopStore(); readout.remove(); renderer.dispose(); store.dispose(); } };
}
