import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleRendererFps } from '@opsorama/three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ZOOM_RANGE, createSceneStore } from '@opsorama/core';
import { ZoomControl as ReactZoom } from '@opsorama/react/ui';
import { ZoomControl as VueZoom } from '@opsorama/vue/ui';
import { ZOOM_DEFAULTS, formatZoom, stepZoom, zoomControl, type PanelElement, type PanelNode, type ZoomControlProps } from '@opsorama/ui';

function elements<T>(node: PanelNode<T>): PanelElement<T>[] { return node.kind === 'element' ? [node, ...node.children.flatMap(elements)] : []; }
function text<T>(node: PanelNode<T>): string { return node.kind === 'content' ? String(node.value ?? '') : node.children.map(text).join(''); }
function control(props: Partial<ZoomControlProps<string>> = {}) {
  const changes: number[] = [];
  const tree = zoomControl<string>({ value: 1, onChange: value => changes.push(value), ...props });
  const part = (name: string) => elements(tree).find(node => String(node.attrs.class).split(' ').includes(name));
  return { tree, changes, part };
}

describe('zoom control', () => {
  it('matches the validated scene range and steps without drift', () => {
    expect([ZOOM_DEFAULTS.min, ZOOM_DEFAULTS.max]).toEqual([ZOOM_RANGE.min, ZOOM_RANGE.max]);
    expect(stepZoom(1.05, .2)).toBe(1.25);
    expect(stepZoom(4.95, .1)).toBe(5); expect(stepZoom(.7, -.1)).toBe(.65);
    expect(stepZoom(2, 1, { min: 1, max: 2.5 })).toBe(2.5);
    const store = createSceneStore({ schemaVersion: 1, nodes: [] });
    for (const value of [ZOOM_RANGE.min, ZOOM_RANGE.max]) expect(() => store.configure({ zoom: value })).not.toThrow();
    expect(() => store.configure({ zoom: ZOOM_RANGE.max + .01 })).toThrow('zoom');
  });
  it('is compact unless a host asks for comfortable buttons', () => {
    expect(control().tree.attrs['data-density']).toBe('compact');
    expect(control({ density: 'comfortable' }).tree.attrs['data-density']).toBe('comfortable');
  });
  it('formats multipliers, percentages relative to the default and host formatters', () => {
    expect(formatZoom(1.25)).toBe('1.25×');
    expect(formatZoom(1.35, 'percent', 1.25)).toBe('108%');
    expect(formatZoom(2, (value, base) => `${value}/${base}`, 1)).toBe('2/1');
    expect(control({ value: 1.5, controls: 'slider', format: 'percent', defaultValue: 1.25 }).part('zc-slider')!.attrs['aria-valuetext']).toBe('120%');
  });
  it('emits clamped steps, disables at bounds and never emits while disabled', () => {
    const { part, changes } = control({ value: 4.95, step: .2 });
    part('zc-in')!.onClick!(); part('zc-out')!.onClick!();
    expect(changes).toEqual([5, 4.75]);
    const top = control({ value: 5 });
    expect(top.part('zc-in')!.attrs.disabled).toBe(true); top.part('zc-in')!.onClick!();
    expect(top.changes).toEqual([]);
    const off = control({ disabled: true, controls: 'both', reset: true });
    for (const name of ['zc-in', 'zc-out', 'zc-reset']) { expect(off.part(name)!.attrs.disabled).toBe(true); off.part(name)!.onClick!(); }
    off.part('zc-slider')!.onInput!('2'); expect(off.changes).toEqual([]);
  });
  it('supports slider, reset, orientation, labels and custom content', () => {
    const resets: string[] = [];
    const slider = control({ value: 1, controls: 'slider', reset: true, defaultValue: 1.25, min: 1, max: 3 });
    expect(slider.part('zc-in')).toBeUndefined();
    expect(slider.part('zc-slider')!.attrs).toMatchObject({ type: 'range', min: 1, max: 3, step: 'any', 'aria-valuetext': '1.00×' });
    slider.part('zc-slider')!.onInput!('9'); slider.part('zc-reset')!.onClick!();
    expect(slider.changes).toEqual([3, 1.25]);
    const custom = control({ reset: true, onReset: () => resets.push('view'), orientation: 'vertical', caption: 'Camera', labels: { group: 'Board controls', zoomIn: 'Enlarge' }, icons: { zoomIn: '[+]' }, children: 'extra' });
    custom.part('zc-reset')!.onClick!(); expect(resets).toEqual(['view']); expect(custom.changes).toEqual([]);
    expect(custom.tree.attrs).toMatchObject({ role: 'group', 'aria-label': 'Board controls', 'data-orientation': 'vertical' });
    expect(custom.part('zc-in')!.attrs['aria-label']).toBe('Enlarge');
    // Vertical controls put zoom in above zoom out; trailing host content stays last.
    const order = (tree: PanelNode<string>) => elements(tree).flatMap(node => String(node.attrs.class).match(/zc-(caption|in|out|reset|slider|separator)(?:\s|$)/)?.[1] ?? []);
    expect(order(custom.tree)).toEqual(['caption', 'in', 'out', 'reset', 'separator']); expect(text(custom.tree)).toBe('Camera[+]extra');
    expect(order(control({ controls: 'both' }).tree)).toEqual(['out', 'slider', 'in']);
    // The control shows no zoom value of its own.
    expect(text(control({ value: 1.5 }).tree)).toBe('');
    // Built-in icons are decorative SVG drawn with currentColor; a supplied icon replaces only its own button.
    const icons = elements(custom.tree).filter(node => node.tag === 'svg');
    expect(icons).toHaveLength(2); expect(icons.every(icon => icon.attrs['aria-hidden'] === true && icon.attrs.stroke === 'currentColor')).toBe(true);
    // Standalone toolbar by default; host content follows a divider there but not in plain host toolbars.
    expect(custom.tree.attrs['data-appearance']).toBe('toolbar'); expect(custom.part('zc-separator')!.attrs['aria-hidden']).toBe(true);
    const plain = control({ appearance: 'plain', children: 'extra' });
    expect(plain.tree.attrs['data-appearance']).toBe('plain'); expect(plain.part('zc-separator')).toBeUndefined();
    expect(control({ appearance: 'toolbar' }).part('zc-separator')).toBeUndefined();
  });
  it('shows a host FPS reading after a divider, with a placeholder while unknown', () => {
    const live = control({ fps: 59.6 }), unknown = control({ fps: null });
    const reading = (tree: PanelNode<string>) => elements(tree).find(node => node.attrs['aria-label'] === 'Scene FPS');
    expect(text(reading(live.tree)!)).toBe('60'); expect(text(reading(unknown.tree)!)).toBe('—');
    expect(text(live.part('zc-fps')!)).toBe('60FPS'); expect(live.part('zc-fps')!.attrs.title).toContain('not GPU');
    expect(live.part('zc-separator')).toBeDefined(); expect(control({ fps: 1, appearance: 'plain' }).part('zc-separator')).toBeUndefined();
    expect(control().part('zc-fps')).toBeUndefined();
    // FPS precedes host content; labels translate the readout.
    const both = control({ fps: 30, children: 'extra', labels: { fps: 'Snímky', fpsUnit: 'FPS' } });
    expect(text(both.tree).endsWith('30FPSextra')).toBe(true); expect(reading(both.tree)).toBeUndefined();
    for (const fps of [-1, NaN, Infinity]) expect(() => control({ fps })).toThrow('FPS');
  });
  it('rejects invalid ranges, steps and defaults', () => {
    expect(() => control({ value: NaN })).toThrow('finite');
    expect(() => control({ min: 2, max: 1 })).toThrow('range');
    expect(() => control({ min: 0 })).toThrow('range');
    expect(() => control({ step: 0 })).toThrow('step');
    expect(() => control({ sliderStep: -1 })).toThrow('Slider step');
    expect(() => control({ defaultValue: 9 })).toThrow('Default');
    expect(control({ min: 2, max: 4, value: 3 }).part('zc-out')!.attrs.disabled).toBe(false);
  });
  it('renders the same structure natively in React and Vue', async () => {
    const options = { value: 1.25, onChange: () => {}, controls: 'both' as const, reset: true, caption: 'Zoom' };
    const react = renderToStaticMarkup(createElement(ReactZoom, options, createElement('button', {}, 'Host action')));
    const vue = await renderToString(createSSRApp({ render: () => h(VueZoom, { options }, { default: () => h('button', {}, 'Host action') }) }));
    for (const html of [react, vue]) {
      expect(html).toContain('role="group"'); expect(html).toContain('aria-label="Zoom in"');
      expect(html).toContain('type="range"'); expect(html).toContain('1.25×');
      expect(html).toContain('<button>Host action</button>'); expect(html).not.toContain('[object Object]');
      expect(html).toContain('<svg'); expect(html).toContain('viewBox="0 0 24 24"'); expect(html).toContain('stroke-width:2');
    }
  });
});

describe('renderer FPS sampler', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('reports completed frames per second, resets on renderer change, hiding and disposal, and stops cleanly', () => {
    vi.useFakeTimers();
    const listeners = new Set<() => void>(), doc = { hidden: false, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
    vi.stubGlobal('document', doc); vi.stubGlobal('window', globalThis);
    let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const renderer = (frames = { value: 0 }, disposed = false) => ({ frames, getDiagnostics: () => ({ renderedFrames: frames.value, disposed }) });
    let current: ReturnType<typeof renderer> | null = renderer();
    const samples: (number | null)[] = [];
    const stop = sampleRendererFps(() => current, value => samples.push(value));
    current.frames.value = 58; now = 1000; vi.advanceTimersByTime(1000);
    current.frames.value = 118; now = 2000; vi.advanceTimersByTime(1000);
    current = renderer({ value: 500 }); now = 3000; vi.advanceTimersByTime(1000);
    doc.hidden = true; listeners.forEach(listener => listener());
    doc.hidden = false; current = renderer({ value: 0 }, true); now = 4000; vi.advanceTimersByTime(1000);
    expect(samples).toEqual([null, 58, 60, null, null, null]);
    stop(); stop(); expect(listeners.size).toBe(0);
    now = 5000; vi.advanceTimersByTime(3000); expect(samples).toHaveLength(6);
    expect(() => sampleRendererFps(() => null, () => {}, { intervalMs: 0 })).toThrow('interval');
  });
});
