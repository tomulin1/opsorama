import { createSceneRenderer } from '@opsorama/renderer-three';
import { makeExampleStore, moveSample } from '../shared';
export function mountVanillaExample(container: HTMLElement, instancing = true) {
  const store = makeExampleStore(); const canvas = document.createElement('div'); canvas.style.cssText = 'height:360px;position:relative;';
  const controls = document.createElement('div'); controls.className = 'adapter-example-controls'; const button = document.createElement('button'); button.textContent = 'Move order #1001'; const selection = document.createElement('span'); selection.textContent = 'Selected: none'; controls.append(button, selection); container.append(canvas, controls);
  const renderer = createSceneRenderer(canvas, store, { instancing }); const unsubscribe = store.subscribe(() => { selection.textContent = `Selected: ${store.getSnapshot().selection?.entityId || 'none'}`; });
  const onMove = () => moveSample(store); button.addEventListener('click', onMove);
  return () => { unsubscribe(); button.removeEventListener('click', onMove); renderer.dispose(); store.dispose(); canvas.remove(); controls.remove(); };
}
