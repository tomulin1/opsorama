import { createSceneRenderer } from '@opsorama/three';
import { lightingAssets, lightingSettings, makeLightingStore, type LightingCallbacks, type LightingData, type LightingSession } from './lighting-data';

/** Plain JavaScript: the renderer over a store; the page's choices go to `store.configure`. */
export function mountLightingJavaScript(container: HTMLElement, data: LightingData, callbacks: LightingCallbacks): LightingSession {
  const store = makeLightingStore(data);
  const renderer = createSceneRenderer(container, store, { assets: lightingAssets, wheelZoom: true, onSelect: callbacks.select, onError: callbacks.error });
  callbacks.ready(renderer);
  return { store, setData: next => store.configure(lightingSettings(next)), dispose: () => { renderer.dispose(); store.dispose(); } };
}
