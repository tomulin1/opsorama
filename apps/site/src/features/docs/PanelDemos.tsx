'use client';
import { useState, type ReactNode } from 'react';
import { AlertTriangle, Box, Gauge, Thermometer, Workflow } from 'lucide-react';
import { EntityInspector, MetricCard, ResourceList, StatusBadge, type MetricSize } from '@opsorama/react/ui';
import { defaultMetricConfig, metricOptions, metricSizes, metricSnippet, metricTones, metricVisuals, sampleMetrics, sampleRecords, type MetricConfig, type PanelFramework } from '../../../examples/panel-docs-fixture';
import { CodeBlock } from './CodeBlock';
import '@opsorama/ui/styles.css';
import './panels.css';

const ICONS: Record<(typeof sampleMetrics)[number]['id'], ReactNode> = { capacity: <Box />, throughput: <Gauge />, reading: <Thermometer />, alerts: <AlertTriangle /> };
const FRAMEWORKS: readonly { id: PanelFramework; label: string }[] = [{ id: 'react', label: 'React' }, { id: 'vue', label: 'Vue' }, { id: 'javascript', label: 'JavaScript' }];

function Choice<V extends string>({ label, value, options, onChange }: { label: string; value: V; options: readonly V[]; onChange(value: V): void }) {
  return <label>{label}<select aria-label={label} value={value} onChange={event => onChange(event.target.value as V)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="panel-demo-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label>;
}

/** Live MetricCard with a generated snippet from the same options. */
export function MetricConfigurator() {
  const [config, setConfig] = useState<MetricConfig>(defaultMetricConfig), [framework, setFramework] = useState<PanelFramework>('react');
  const set = <K extends keyof MetricConfig>(key: K) => (value: MetricConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  return <div className="panel-demo" role="group" aria-label="MetricCard configurator">
    <div className="panel-demo-stage"><div className="panel-demo-card" data-size={config.size}><MetricCard {...metricOptions(config)} slots={{ icon: <Gauge /> }} /></div></div>
    <div className="panel-sample-controls">
      <Choice label="Size" value={config.size} options={metricSizes} onChange={set('size')} />
      <Choice label="Visual" value={config.visual} options={metricVisuals} onChange={set('visual')} />
      <Choice label="Tone" value={config.tone} options={metricTones} onChange={set('tone')} />
      <Toggle label="Delta" checked={config.delta} onChange={set('delta')} />
      <Toggle label="Comparison" checked={config.comparison} onChange={set('comparison')} />
    </div>
    <div className="panel-sample-controls" role="group" aria-label="Snippet adapter">{FRAMEWORKS.map(({ id, label }) => <button type="button" key={id} aria-pressed={framework === id} onClick={() => setFramework(id)}>{label}</button>)}</div>
    <CodeBlock code={metricSnippet(config, framework)} language={framework === 'react' ? 'tsx' : framework === 'vue' ? 'vue' : 'js'} />
  </div>;
}

/** Every size and visual. */
export function MetricMatrix() {
  return <div className="panel-demo" role="group" aria-label="Metric sizes and visuals">
    {metricSizes.map(size => <div key={size}><p className="panel-demo-label">Size {size}</p><div className="panel-demo-row">{metricVisuals.map(visual => <MetricCard key={visual} {...metricOptions({ size, visual, tone: 'info', delta: true, comparison: false })} title={visual} slots={{ icon: <Gauge /> }} />)}</div></div>)}
  </div>;
}

export function MetricTones() {
  return <div className="panel-demo panel-demo-row" role="group" aria-label="Metric tones">{metricTones.map(tone => <MetricCard key={tone} size="s" title={tone} value={42} tone={tone} slots={{ icon: <Gauge /> }} />)}</div>;
}

export function PanelStates() {
  return <div className="panel-demo panel-demo-row" role="group" aria-label="Panel states">
    <MetricCard size="s" title="Loading" value={42} state="loading" />
    <MetricCard size="s" title="Empty" value={42} state="empty" />
    <MetricCard size="s" title="Error" value={42} state="error" />
    <MetricCard size="s" title="Unknown value" value={null} tone="neutral" slots={{ icon: <Gauge /> }} />
    <MetricCard size="s" title="Zero is a value" value={0} tone="neutral" slots={{ icon: <Gauge /> }} />
  </div>;
}

/** Both families in their zones over a placeholder scene. The layout is host CSS, not a library feature. */
export function HudComposition() {
  const [size, setSize] = useState<MetricSize>('m'), [selected, setSelected] = useState<string>(sampleRecords[1].id);
  const record = sampleRecords.find(item => item.id === selected)!;
  return <div className="panel-demo" role="group" aria-label="Composed HUD sample">
    <div className="panel-sample-controls" role="group" aria-label="Metric size">{metricSizes.map(value => <button type="button" key={value} aria-pressed={size === value} onClick={() => setSize(value)}>Size {value}</button>)}</div>
    <div className="panel-hud" data-metric-size={size}>
      <span className="panel-hud-scene">Your scene</span>
      <div className="panel-hud-top">{sampleMetrics.map(({ id, ...metric }) => <MetricCard key={id} size={size} {...metric} action={id === 'alerts' ? { label: 'Show the line with the fault', onActivate: () => setSelected('line-c'), pressed: selected === 'line-c' } : undefined} slots={{ icon: ICONS[id] }} />)}</div>
      <EntityInspector className="panel-hud-side" title={record.label} description={record.description} density="compact" slots={{ icon: <Workflow size={16} />, actions: <StatusBadge label={record.status} tone={record.tone} /> }} fields={[{ id: 'rate', label: 'Rate', value: record.value }]} />
      <ResourceList className="panel-hud-bottom" title="Lines" density="compact" selectedId={selected} onSelect={setSelected} items={sampleRecords} />
    </div>
  </div>;
}
