import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { DataPanel as ReactPanel, MetricCard as ReactMetric } from '@opsorama/react/ui';
import { DataPanel as VuePanel, MetricCard as VueMetric } from '@opsorama/vue/ui';
import { defaultMetricConfig, metricOptions, metricSizes, metricSnippet, metricTones, metricVisuals, sampleMetrics, sampleRecords, type PanelFramework } from '../apps/site/examples/panel-docs-fixture';
import { valueMeter, metricCard, entityInspector, resourceList, processTracker, activityFeed, type PanelNode, type PanelElement } from '@opsorama/ui';

function text<T>(node: PanelNode<T>): string { return node.kind === 'content' ? String(node.value ?? '') : node.children.map(text).join(' '); }
function elements<T>(node: PanelNode<T>): PanelElement<T>[] { return node.kind === 'element' ? [node, ...node.children.flatMap(elements)] : []; }
const meter = (value: number | null, max: number | null = 100) => valueMeter({ label: 'Reading', value, max, unit: 'units' });

const classes = <T>(tree: PanelNode<T>) => elements(tree).map(node => String(node.attrs.class ?? ''));
const visible = <T>(tree: PanelNode<T>, name: string) => elements(tree).filter(node => String(node.attrs.class ?? '').split(' ').includes(name)).map(node => !String(node.attrs.class).includes('dp-sr-only'));
const context = { delta: { label: '+2 units', direction: 'up' as const, tone: 'critical' as const }, comparison: 'Above target' };

describe('sized metrics', () => {
  it('shows more context per size and keeps hidden context in the accessible tree', () => {
    const at = (size: 's' | 'm') => metricCard({ title: 'Reading', value: 3, size, ...context });
    expect([visible(at('s'), 'dp-delta'), visible(at('s'), 'dp-comparison')]).toEqual([[false], [false]]);
    expect([visible(at('m'), 'dp-delta'), visible(at('m'), 'dp-comparison')]).toEqual([[true], [false]]);
    expect(visible(metricCard({ value: 3, size: 'm', comparison: 'Only context' }), 'dp-comparison')).toEqual([true]);
    for (const size of ['s', 'm'] as const) expect(text(at(size))).toContain('Above target');
    expect(at('m').attrs).toMatchObject({ 'data-size': 'm', 'data-tone': 'neutral', 'data-visual': 'symbol', 'aria-label': 'Reading' });
  });
  it('keeps zero and unknown distinct, and shows state placeholders with their title', () => {
    expect(text(metricCard({ value: 0, size: 'm' }))).toContain('0');
    expect(text(metricCard({ value: null, size: 'm', unknownLabel: 'No reading' }))).toContain('No reading');
    const loading = metricCard({ title: 'Reading', value: 1, size: 's', state: 'loading' });
    expect(text(loading)).toContain('Reading'); expect(text(loading)).toContain('Loading');
    expect(classes(loading)).not.toContain('dp-metric-layout');
  });
  it('names the fix when unsized and sized inputs are mixed', () => {
    // @ts-expect-error size is required; plain JavaScript callers get the error instead.
    expect(() => metricCard({ value: 1 })).toThrow('Set size to s or m');
  });
  it('draws a labeled trend, replaces the icon at size s and gives it the context space', () => {
    const visual = { kind: 'trend', points: [1, 3, 2], label: 'Last hour' } as const;
    const medium = metricCard({ title: 'Load', value: 2, size: 'm', visual, ...context, slots: { icon: 'I' } });
    const spark = elements(medium).find(node => node.tag === 'svg')!;
    expect(spark.attrs).toMatchObject({ role: 'img', 'aria-label': 'Last hour' });
    expect(elements(spark)[2].attrs.d).toBe('M0.00 28.00 L50.00 2.00 L100.00 15.00');
    expect(classes(medium)).toContain('dp-metric-symbol');
    expect(visible(medium, 'dp-delta')).toEqual([false]);
    expect(classes(metricCard({ value: 2, size: 's', visual, slots: { icon: 'I' } }))).not.toContain('dp-metric-symbol');
    expect(elements(metricCard({ value: 2, size: 'm', visual: { ...visual, points: [4, 4] } })).find(node => node.attrs.class === 'dp-spark-line')!.attrs.d).toBe('M0.00 15.00 L100.00 15.00');
    expect(elements(metricCard({ value: 2, size: 'm', visual: { ...visual, points: [4] }, slots: { icon: 'I' } })).some(node => node.tag === 'svg')).toBe(false);
    expect(() => metricCard({ value: 2, size: 'm', visual: { ...visual, points: [1, NaN] } })).toThrow('finite');
  });
  it('derives capacity accessibility from the value and leaves unknown rings empty', () => {
    const ring = (value: number | string | null, max: number | null = 200) => metricCard({ title: 'Capacity', value, unit: 'kW', size: 'm', visual: { kind: 'capacity', max } });
    const known = elements(ring(50)).find(node => node.attrs.class === 'dp-ring')!;
    expect(known.attrs).toMatchObject({ role: 'meter', 'aria-label': 'Capacity', 'aria-valuemin': 0, 'aria-valuemax': 200, 'aria-valuenow': 50, 'aria-valuetext': '50 kW / 200 kW' });
    expect(elements(ring(50)).find(node => node.attrs.class === 'dp-ring-value')!.style?.strokeDasharray).toBe('25.00 100');
    expect(elements(ring(500)).find(node => node.attrs.class === 'dp-ring-value')!.style?.strokeDasharray).toBe('100.00 100');
    for (const tree of [ring(null), ring('n/a'), ring(50, null), ring(0)]) expect(classes(tree)).not.toContain('dp-ring-value');
    expect(elements(ring(null)).find(node => node.attrs.class === 'dp-ring')!.attrs.role).toBeUndefined();
  });
  it('keeps the documented options valid and their snippets complete', () => {
    for (const size of metricSizes) for (const visual of metricVisuals) for (const tone of metricTones) for (const delta of [true, false]) {
      const config = { ...defaultMetricConfig, size, visual, tone, delta }, tree = metricCard(metricOptions(config));
      expect(tree.attrs).toMatchObject({ 'data-size': size, 'data-visual': visual, 'data-tone': tone });
      for (const framework of ['react', 'vue', 'javascript'] as PanelFramework[]) {
        const snippet = metricSnippet(config, framework);
        for (const part of [`kind: '${visual}'`, 'Throughput', tone, framework === 'javascript' ? 'mountPanel' : 'MetricCard']) expect(snippet).toContain(part);
        expect(snippet.includes('+13 items/h')).toBe(delta);
      }
    }
    expect(metricSnippet({ ...defaultMetricConfig, size: 's' }, 'react')).toContain('size="s"');
    expect(sampleMetrics.map(({ id, ...metric }) => text(metricCard({ ...metric, id, size: 'm' }))).join(' ')).toContain('Peak reading');
    expect(text(resourceList({ items: sampleRecords }))).toContain('Line C');
  });
  it('makes a sized card one labeled button while its content stays outside', () => {
    let activated = 0;
    const options = { title: 'Alerts', value: 3, size: 'm' as const, action: { label: 'Open alerts', onActivate: () => { activated += 1; }, pressed: true } };
    const tree = metricCard(options), button = elements(tree).find(node => node.tag === 'button')!;
    expect(button.attrs).toMatchObject({ type: 'button', 'aria-label': 'Open alerts', 'aria-pressed': true });
    expect(button.children).toEqual([]);
    button.onClick!(); expect(activated).toBe(1);
    expect(elements(metricCard({ value: 3, size: 'm' })).some(node => node.tag === 'button')).toBe(false);
    expect(elements(metricCard({ ...options, state: 'loading' })).some(node => node.tag === 'button')).toBe(false);
  });
  it('renders the same sized markup through React and Vue', async () => {
    const options = { title: 'Reading', value: 2, size: 'm' as const, tone: 'warning' as const, visual: { kind: 'capacity' as const, max: 4 } };
    const trend = { title: 'First', value: 1, size: 's' as const, visual: { kind: 'trend' as const, points: [1, 2], label: 'Trend' } };
    const react = [renderToStaticMarkup(createElement(ReactMetric, options)), renderToStaticMarkup(createElement(ReactMetric, trend))];
    const vue = [await renderToString(createSSRApp({ render: () => h(VueMetric, { options }) })), await renderToString(createSSRApp({ render: () => h(VueMetric, { options: trend }) }))];
    for (const html of [...react, ...vue]) expect(html).not.toContain('[object Object]');
    expect(react[0]).toContain('stroke-dasharray:50.00 100'); expect(vue[0]).toContain('stroke-dasharray:50.00 100');
    expect(react[0]).toContain('viewBox="0 0 100 100"'); expect(vue[0]).toContain('viewBox="0 0 100 100"');
    expect(react[1]).toContain('dp-spark-line'); expect(vue[1]).toContain('dp-spark-line');
  });
});

describe('generic data panel semantics', () => {
  it('keeps zero, unknown, exact overflow and range accessibility distinct', () => {
    expect(text(metricCard({ size: 'm', value: 0 }))).toContain('0');
    expect(text(metricCard({ size: 'm', value: null }))).toContain('Unknown');
    expect(text(entityInspector({ fields: [{ id: 'a', label: 'A', value: null }] }))).toContain('Unknown');
    const overflow = meter(120), mark = elements(overflow).find(node => node.attrs.role === 'meter')!;
    expect(mark.attrs['aria-valuenow']).toBe(100);
    expect(mark.attrs['aria-valuetext']).toBe('120 units / 100 units (above range)');
    expect(elements(overflow).find(node => node.attrs.class === 'dp-meter-fill')!.style?.width).toBe('100%');
    expect(text(meter(-10))).toContain('below range');
    for (const tree of [meter(null), meter(10, null), meter(0, 0)]) {
      expect(elements(tree).some(node => node.attrs.role === 'meter')).toBe(false);
      expect(elements(tree).find(node => node.attrs.class === 'dp-meter-fill')!.style?.width).toBe('0%');
    }
    expect(() => meter(NaN)).toThrow('finite'); expect(() => meter(Infinity)).toThrow('finite');
    expect(() => meter(10, -1)).toThrow('Maximum');
    const extreme = valueMeter({ label: 'Extreme range', min: -Number.MAX_VALUE, max: Number.MAX_VALUE, value: 0 });
    expect(elements(extreme).find(node => node.attrs.class === 'dp-meter-fill')!.style?.width).toBe('50%');
  });
  it('validates identity, preserves supplied process states and never selects implicitly', () => {
    const items = Object.freeze([Object.freeze({ id: 'a', label: 'A', status: 'Host state' }), Object.freeze({ id: 'b', label: 'B', disabled: true })]);
    const selected: string[] = [];
    const tree = resourceList({ items, selectedId: 'missing', onSelect: id => selected.push(id) });
    const buttons = elements(tree).filter(node => node.tag === 'button');
    expect(buttons.map(node => node.attrs['aria-pressed'])).toEqual([false, false]);
    buttons[0].onClick!(); buttons[1].onClick!(); expect(selected).toEqual(['a']);
    expect(elements(resourceList({ items })).some(node => node.tag === 'button')).toBe(false);
    expect(() => resourceList({ items: [items[0], items[0]] })).toThrow('unique');
    expect(() => activityFeed({ items: [{ id: '', content: 'Event' }] })).toThrow('nonempty');
    const process = processTracker({ steps: [{ id: 'later', label: 'Later', current: true, status: 'Host-specific' }, { id: 'earlier', label: 'Earlier', status: 'Unknown' }] });
    expect(elements(process).filter(node => node.attrs['aria-current'] === 'step')).toHaveLength(1);
    expect(text(process)).toContain('Host-specific'); expect(text(process)).toContain('Unknown');
    expect(text(process)).not.toContain('complete');
  });
  it('keeps source freshness independent from content state and native content opaque', () => {
    const tree = metricCard({ size: 'm', title: 'Custom', value: 42, state: 'loading', slots: { loading: 'Waiting for host', footer: 'Footer' }, freshness: { label: 'Last known reading', state: 'stale' } });
    expect(text(tree)).not.toContain('42'); expect(text(tree)).toContain('Waiting for host');
    expect(text(tree)).toContain('Last known reading'); expect(text(tree)).toContain('Footer');
    expect(tree.attrs['aria-busy']).toBe(true);
    expect(elements(tree).some(node => node.attrs['data-freshness'] === 'stale')).toBe(true);
  });
  it('renders native React and Vue without a scene provider, DOM or graphics runtime', async () => {
    const react = renderToStaticMarkup(createElement(ReactPanel, { title: 'Host <title>', slots: { footer: createElement('button', {}, 'Host action') } }, createElement(ReactMetric, { size: 'm', title: 'Value', value: 0 })));
    const vue = await renderToString(createSSRApp({ render: () => h(VuePanel, { options: { title: 'Host <title>' } }, { footer: () => h('button', {}, 'Host action'), default: () => h(VueMetric, { options: { size: 'm', title: 'Value', value: 0 } }) }) }));
    for (const html of [react, vue]) {
      expect(html).toContain('Host &lt;title&gt;'); expect(html).toContain('<button>Host action</button>');
      expect(html).toContain('dp-metric-value'); expect(html).not.toContain('[object Object]');
      expect(html).not.toContain('canvas'); expect(html).not.toContain('script');
    }
  });
});
