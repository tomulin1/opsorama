import { createApp, h, shallowRef } from 'vue';
import { DataPanel, MetricCard, EntityInspector, ProcessTracker, ResourceList, CapacityCard, ActivityFeed, StatusBadge, ValueMeter, ZoomControl } from '@opsorama/vue/ui';
import { panelSample, type PanelSample } from './panels-fixture';
export function mountPanelsVue(container: HTMLElement, initial: PanelSample, onSelect: (id: string) => void, onZoom?: (value: number) => void) {
  const current = shallowRef(initial);
  const app = createApp({ render() {
    const p = panelSample(current.value, onSelect, onZoom);
    return h('div', { class: 'panel-samples-grid' }, [
      h(DataPanel, { options: p.panel }, { actions: () => h(StatusBadge, { options: { label: 'Custom badge', tone: 'info' } }), footer: () => h('button', { type: 'button', onClick: () => onSelect('custom') }, 'Custom action') }),
      h(MetricCard, { options: p.metric }), ...p.sizedMetrics.map(options => h(MetricCard, { key: options.title, options })), h(EntityInspector, { options: p.inspector }), h(ProcessTracker, { options: p.process }),
      h(ResourceList, { options: p.resources }), h(CapacityCard, { options: p.capacity }), h(ActivityFeed, { options: p.activity }),
      h(DataPanel, { options: { title: 'ValueMeter' } }, { default: () => h(ValueMeter, { options: { label: 'Custom range', value: current.value.value, min: 10, max: 80 } }) }),
      h('div', { class: 'zoom-samples' }, p.zoom.map(options => h(ZoomControl, { key: options.labels?.group ?? 'zoom', options }))),
    ]);
  } });
  app.mount(container);
  return { update(value: PanelSample) { current.value = value; }, dispose() { app.unmount(); } };
}
