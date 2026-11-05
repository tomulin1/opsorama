import { createApp, h, defineComponent } from 'vue';
import { DashboardProvider, SceneCanvas, useScene } from '@opsorama/vue';
import { makeExampleStore, moveSample } from '../shared';
import { catalogAssets } from '@opsorama/objects';
export function mountVueExample(container: HTMLElement, instancing = true) {
  const store = makeExampleStore();
  const Controls = defineComponent({ setup() { const snapshot = useScene(); return () => h('div', { class: 'adapter-example-controls' }, [h('button', { onClick: () => moveSample(store) }, 'Move order #1001'), h('span', `Selected: ${snapshot.value.selection?.entityId || 'none'}`)]); } });
  const app = createApp({ render: () => h(DashboardProvider, { store }, { default: () => [h(SceneCanvas, { assets: catalogAssets, instancing, style: { height: '360px' } }), h(Controls)] }) });
  app.mount(container);
  return () => { app.unmount(); store.dispose(); };
}
