import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { createMoveModeSession, type MoveModeSession } from './move-mode-data';
import { catalogAssets } from '@opsorama/objects';

export function mountMoveModeJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): MoveModeSession {
  const session = createMoveModeSession(), renderer = createSceneRenderer(container, session.store, { assets: catalogAssets });
  session.connect(renderer); ready(renderer);
  return { ...session, dispose: () => { session.dispose(); renderer.dispose(); } };
}
