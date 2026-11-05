/** Neutral API samples only. Hosts supply their own meanings, layout and records. */
export interface PanelSample { value: number | null; selectedId: string | null; state: 'ready' | 'loading' | 'empty' | 'error'; reverseRows?: boolean; zoom?: number; }
export const initialPanelSample: PanelSample = { value: 42, selectedId: null, state: 'ready' };
export function panelSample(sample: PanelSample, onSelect: (id: string) => void, onZoom: (value: number) => void = () => {}) {
  const items = [{ id: 'a', label: 'Item A', description: 'Optional description', status: 'Available', tone: 'success' as const }, { id: 'b', label: 'Item B', status: 'Attention', tone: 'warning' as const }, { id: 'c', label: 'Item C', disabled: true }];
  return {
    panel: { title: 'DataPanel', description: 'Custom content', children: 'Your content', state: sample.state, freshness: { label: 'Sample data', state: 'unknown' as const } },
    metric: { size: 'm' as const, title: 'MetricCard', value: sample.value, unit: 'units', comparison: 'Host-supplied comparison', state: sample.state },
    // Sized metrics share one reading, so null and range behavior match the other samples.
    sizedMetrics: [
      { title: 'Symbol metric', value: sample.value, unit: 'units', size: 'm' as const, tone: 'warning' as const, delta: { label: '+2 units', direction: 'up' as const, tone: 'warning' as const }, action: { label: 'Select from metric', onActivate: () => onSelect('metric'), pressed: sample.selectedId === 'metric' }, slots: { icon: '#' }, state: sample.state },
      { title: 'Trend metric', value: sample.value, unit: 'units', size: 'm' as const, tone: 'info' as const, visual: { kind: 'trend' as const, points: [30, 34, 33, 38, sample.value ?? 38], label: 'Sample history' }, slots: { icon: '~' }, state: sample.state },
      { title: 'Capacity metric', value: sample.value, unit: 'units', size: 'm' as const, tone: 'success' as const, visual: { kind: 'capacity' as const, max: 100 }, slots: { icon: '%' }, state: sample.state },
    ],
    inspector: { title: 'EntityInspector', fields: [{ id: 'selection', label: 'Selection', value: sample.selectedId }, { id: 'custom', label: 'Custom field', value: 'Host value' }], state: sample.state },
    process: { title: 'ProcessTracker', steps: [{ id: 'a', label: 'Step A', status: 'Custom status', tone: 'success' as const }, { id: 'b', label: 'Step B', status: 'Another status', current: true, meta: 'Optional detail' }], onSelect, state: sample.state },
    resources: { title: 'ResourceList', items: sample.reverseRows ? items.toReversed() : items, selectedId: sample.selectedId, onSelect, state: sample.state },
    capacity: { title: 'CapacityCard', meter: { label: 'Reading', value: sample.value, max: 100, unit: 'units' }, state: sample.state },
    // Three standalone toolbar variants of one controlled value.
    zoom: [
      { value: sample.zoom ?? 1, onChange: onZoom, step: .25, reset: true, caption: 'Zoom' },
      { value: sample.zoom ?? 1, onChange: onZoom, orientation: 'vertical' as const, reset: true, labels: { group: 'Vertical zoom', zoomIn: 'Enlarge', zoomOut: 'Reduce' } },
      { value: sample.zoom ?? 1, onChange: onZoom, controls: 'slider' as const, caption: 'Slider', labels: { group: 'Slider zoom' } },
    ],
    activity: { title: 'ActivityFeed', items: [{ id: 'event-a', content: 'Host-supplied event', timeLabel: '09:40 UTC', dateTime: '2026-10-15T09:40:00Z', meta: 'Optional event context' }], state: sample.state },
  };
}
