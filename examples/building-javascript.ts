import { createSceneRenderer, type SceneRenderer } from '@opsorama/renderer-three';
import { makeBuildingSession, type BuildingSession, type BuildingStateCallback } from './building-data';
export function mountBuildingJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void, onState: BuildingStateCallback): BuildingSession {
  const session = makeBuildingSession(onState), renderer = createSceneRenderer(container, session.store); ready(renderer);
  return { store: session.store, dispose: () => { session.unbind(); renderer.dispose(); session.store.dispose(); } };
}
