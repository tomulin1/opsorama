import { createApp, h, shallowRef, type VNodeChild } from 'vue';
import { ZoomControl } from '@opsorama/vue/ui';
import { zoomOptions, type ZoomSample } from './zoom-control-fixture';
export function mountZoomControlVue(container: HTMLElement, initial: ZoomSample) {
  const current = shallowRef(initial);
  const app = createApp({ render: () => h(ZoomControl, { options: zoomOptions<VNodeChild>(current.value) }, current.value.config.extra ? { default: () => h('span', { class: 'zoom-host-content' }, 'Host content') } : undefined) });
  app.mount(container);
  return { update(sample: ZoomSample) { current.value = sample; }, dispose() { app.unmount(); } };
}
