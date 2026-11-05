import { createRoot } from 'react-dom/client';
import { DataPanel, MetricCard, EntityInspector, ProcessTracker, ResourceList, CapacityCard, ActivityFeed, StatusBadge, ValueMeter, ZoomControl } from '@opsorama/react/ui';
import { panelSample, type PanelSample } from './panels-fixture';
export function mountPanelsReact(container: HTMLElement, initial: PanelSample, onSelect: (id: string) => void, onZoom?: (value: number) => void) {
  const root = createRoot(container);
  const update = (value: PanelSample) => {
    const p = panelSample(value, onSelect, onZoom);
    root.render(<div className="panel-samples-grid">
      <DataPanel {...p.panel} slots={{ actions: <StatusBadge label="Custom badge" tone="info" />, footer: <button type="button" onClick={() => onSelect('custom')}>Custom action</button> }} />
      <MetricCard {...p.metric} />{p.sizedMetrics.map(options => <MetricCard key={options.title} {...options} />)}<EntityInspector {...p.inspector} /><ProcessTracker {...p.process} />
      <ResourceList {...p.resources} /><CapacityCard {...p.capacity} /><ActivityFeed {...p.activity} />
      <DataPanel title="ValueMeter"><ValueMeter label="Custom range" value={value.value} min={10} max={80} /></DataPanel>
      <div className="zoom-samples">{p.zoom.map(options => <ZoomControl key={options.labels?.group ?? 'zoom'} {...options} />)}</div>
    </div>);
  };
  update(initial);
  return { update, dispose() { queueMicrotask(() => root.unmount()); } };
}
