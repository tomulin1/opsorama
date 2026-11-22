import type { SceneSettings } from '@opsorama/core';
import { createSceneRenderer } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CLICK_READOUT_CLASS, clickReadout, createRobotDispatch, destinationRingPlugin, FIXED_STEP, HOVER_READOUT_CLASS, hoverReadout, makeEngineHooksStore, sendRobot, STEP_READOUT_CLASS, stepReadout, type EngineHooksCallbacks, type EngineHooksSession } from './engine-hooks-data';

/** Plain JavaScript: `onPointer` and `plugins` are renderer options; `renderer.onFrame` drives the fixed-step readout. */
export function mountEngineHooksJavaScript(container: HTMLElement, settings: Partial<SceneSettings>, callbacks: EngineHooksCallbacks): EngineHooksSession {
  const store = makeEngineHooksStore(settings), dispatch = createRobotDispatch();
  const readout = (className: string, text: string) => { const element = document.createElement('output'); element.className = className; element.textContent = text; return element; };
  const steps = readout(STEP_READOUT_CLASS, stepReadout(null)), click = readout(CLICK_READOUT_CLASS, clickReadout(null)), hover = readout(HOVER_READOUT_CLASS, hoverReadout(null));
  let hovered: string | null = null;
  const renderer = createSceneRenderer(container, store, {
    assets: catalogAssets, wheelZoom: true, plugins: [destinationRingPlugin(dispatch, callbacks.lifecycle)],
    onPointer: event => {
      if (event.type === 'click') click.textContent = clickReadout(event, sendRobot(store, dispatch, event));
      else if (event.type === 'enter' || event.type === 'leave' && hovered === event.nodeId) { hovered = event.type === 'enter' ? event.nodeId : null; hover.textContent = hoverReadout(hovered); }
    },
  });
  container.append(steps, click, hover);
  const stop = renderer.onFrame(frame => { steps.textContent = stepReadout(frame); }, { step: FIXED_STEP });
  callbacks.ready(renderer);
  return { store, dispose: () => { stop(); steps.remove(); click.remove(); hover.remove(); renderer.dispose(); store.dispose(); } };
}
