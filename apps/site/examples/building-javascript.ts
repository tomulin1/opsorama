import { createSceneRenderer, type SceneRenderer } from '@opsorama/three';
import { makeBuildingSession, type BuildingSession, type BuildingStateCallback } from './building-data';
import { catalogAssets } from '@opsorama/objects';
export function mountBuildingJavaScript(container: HTMLElement, ready: (renderer: SceneRenderer) => void, onState: BuildingStateCallback): BuildingSession {
  const session = makeBuildingSession(onState), renderer = createSceneRenderer(container, session.store, { assets: catalogAssets }); ready(renderer);
  return { store: session.store, dispose: () => { session.unbind(); renderer.dispose(); session.store.dispose(); } };
}
