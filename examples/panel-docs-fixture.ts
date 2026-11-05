import type { MetricSize, MetricVisual, Tone } from '@opsorama/ui';

/** Neutral values for the panel documentation. Hosts supply their own meanings, tones and layout. */
export type MetricVisualKind = MetricVisual['kind'];
export type PanelFramework = 'react' | 'vue' | 'javascript';
export interface MetricConfig { size: MetricSize; visual: MetricVisualKind; tone: Tone; delta: boolean; comparison: boolean; }
export const metricSizes = ['s', 'm'] as const satisfies readonly MetricSize[];
export const metricVisuals = ['symbol', 'trend', 'capacity'] as const satisfies readonly MetricVisualKind[];
export const metricTones = ['neutral', 'info', 'success', 'warning', 'critical'] as const satisfies readonly Tone[];
export const defaultMetricConfig: MetricConfig = { size: 'm', visual: 'symbol', tone: 'info', delta: true, comparison: false };

const VISUALS: Readonly<Record<MetricVisualKind, MetricVisual>> = {
  symbol: { kind: 'symbol' },
  trend: { kind: 'trend', points: [392, 398, 391, 405, 412, 408, 421], label: 'Throughput over the last hour' },
  capacity: { kind: 'capacity', max: 640 },
};
/** Options shared by the live preview and its generated snippet. */
export function metricOptions(config: MetricConfig) {
  return {
    size: config.size, title: 'Throughput', value: 421, unit: 'items/h', tone: config.tone, visual: VISUALS[config.visual],
    ...(config.delta ? { delta: { label: '+13 items/h', direction: 'up' as const, tone: 'success' as const } } : {}),
    ...(config.comparison ? { comparison: 'Last hour' } : {}),
  };
}

function literal(value: unknown): string {
  if (typeof value === 'string') return `'${value}'`;
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (typeof value === 'object' && value !== null) return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${literal(item)}`).join(', ')} }`;
  return String(value);
}
/** A complete snippet for the chosen adapter. The icon is a string so it runs without an icon library. */
export function metricSnippet(config: MetricConfig, framework: PanelFramework): string {
  const options = Object.entries({ ...metricOptions(config), slots: { icon: '#' } });
  const object = `{\n${options.map(([key, value]) => `  ${key}: ${literal(value)},`).join('\n')}\n}`;
  if (framework === 'react') return `import { MetricCard } from '@opsorama/react/ui';\nimport '@opsorama/ui/styles.css';\n\n<MetricCard\n${options.map(([key, value]) => typeof value === 'string' ? `  ${key}="${value}"` : `  ${key}={${literal(value)}}`).join('\n')}\n/>`;
  if (framework === 'vue') return `<script setup lang="ts">\nimport { MetricCard } from '@opsorama/vue/ui';\nimport '@opsorama/ui/styles.css';\n\nconst metric = ${object};\n</script>\n\n<template>\n  <MetricCard :options="metric" />\n</template>`;
  return `import { metricCard } from '@opsorama/ui';\nimport { mountPanel } from '@opsorama/ui/dom';\nimport '@opsorama/ui/styles.css';\n\nconst view = mountPanel(container, metricCard(${object}));\nview.dispose();`;
}

/** A neutral operations row: one metric per visual, plus a symbol metric with a delta. */
export const sampleMetrics = [
  { id: 'capacity', title: 'Capacity', value: 64, unit: '%', tone: 'info', visual: { kind: 'capacity', max: 100 }, comparison: 'Across four sites' },
  { id: 'throughput', title: 'Throughput', value: 421, unit: 'items/h', tone: 'info', visual: VISUALS.trend, comparison: 'Last hour' },
  { id: 'reading', title: 'Peak reading', value: 34.8, unit: '°C', tone: 'critical', delta: { label: '4.8 °C over limit', direction: 'up', tone: 'critical' }, comparison: 'Limit 30 °C' },
  { id: 'alerts', title: 'Open alerts', value: 3, tone: 'warning', comparison: '1 critical · 2 warning' },
] as const;

/** Records for the composed HUD sample; the host owns selection. */
export const sampleRecords = [
  { id: 'line-a', label: 'Line A', description: 'Running at full rate', value: '412 items/h', status: 'Healthy', tone: 'success' },
  { id: 'line-b', label: 'Line B', description: 'Input queue is growing', value: '208 items/h', status: 'Warning', tone: 'warning' },
  { id: 'line-c', label: 'Line C', description: 'Stopped by a sensor fault', value: '0 items/h', status: 'Critical', tone: 'critical' },
] as const;
