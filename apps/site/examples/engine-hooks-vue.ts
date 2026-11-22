import { createApp, defineComponent, h, ref } from 'vue';
import type { SceneSettings } from '@opsorama/core';
import { DashboardProvider, SceneCanvas, useSceneFrame } from '@opsorama/vue';
import type { ScenePointerEvent } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { CLICK_READOUT_CLASS, clickReadout, createRobotDispatch, destinationRingPlugin, FIXED_STEP, HOVER_READOUT_CLASS, hoverReadout, makeEngineHooksStore, sendRobot, STEP_READOUT_CLASS, stepReadout, type EngineHooksCallbacks, type EngineHooksSession } from './engine-hooks-data';

/** A fixed-step listener under the provider; it writes the element directly, so 60 steps a second cause no re-render. */
const StepReadout = defineComponent({
  name: 'StepReadout',
  setup() {
    const output = ref<HTMLOutputElement>();
    useSceneFrame(frame => { if (output.value) output.value.textContent = stepReadout(frame); }, { step: FIXED_STEP });
    return () => h('output', { ref: output, class: STEP_READOUT_CLASS }, stepReadout(null));
  },
});

/** Native Vue: `useSceneFrame`, the validated `pointer` event and the mount-time `plugins` prop under one `DashboardProvider`. */
export function mountEngineHooksVue(container: HTMLElement, settings: Partial<SceneSettings>, callbacks: EngineHooksCallbacks): EngineHooksSession {
  const store = makeEngineHooksStore(settings), dispatch = createRobotDispatch(), plugins = [destinationRingPlugin(dispatch, callbacks.lifecycle)];
  const click = ref(clickReadout(null)), hovered = ref<string | null>(null);
  const onPointer = (event: ScenePointerEvent) => {
    if (event.type === 'click') click.value = clickReadout(event, sendRobot(store, dispatch, event));
    else if (event.type === 'enter') hovered.value = event.nodeId;
    else if (event.type === 'leave' && hovered.value === event.nodeId) hovered.value = null;
  };
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => h(SceneCanvas, { assets: catalogAssets, wheelZoom: true, plugins, onPointer, style: { height: '420px' }, onReady: callbacks.ready }, { default: () => [h(StepReadout), h('output', { class: CLICK_READOUT_CLASS }, click.value), h('output', { class: HOVER_READOUT_CLASS }, hoverReadout(hovered.value))] }) }) });
  app.mount(container);
  return { store, dispose: () => { app.unmount(); store.dispose(); } };
}
