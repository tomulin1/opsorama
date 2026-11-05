import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { createMoveModeSession, type MoveModeSession } from './move-mode-data';

export function mountMoveModeJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void): MoveModeSession {
  const session = createMoveModeSession(), renderer = createSceneRenderer(container, session.store);
  session.connect(renderer); ready(renderer);
  return { ...session, dispose: () => { session.dispose(); renderer.dispose(); } };
}
