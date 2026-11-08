import { describe, expect, it } from 'vitest';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { createSceneStore, type SceneStore } from '@opsorama/core';
import { createBuildSlice, loadingIndicatorAttributes, loadProgress, loadStateText, SCENE_LOADING_STYLES, type SceneLoadState } from '@opsorama/three';
import { DashboardProvider as ReactProvider, SceneCanvas as ReactCanvas, type SceneCanvasProps } from '@opsorama/react';
import { DashboardProvider as VueProvider, SceneCanvas as VueCanvas } from '@opsorama/vue';

/** The provider with optional children, so children can be passed as createElement arguments. */
const Provider = ReactProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>;
const building = (built: number, total: number): SceneLoadState => ({ phase: 'building', built, total });

describe('scene load state', () => {
  it('counts building as most of the progress, then shader compilation, then the first frame', () => {
    expect(loadProgress(null)).toBe(0);
    expect(loadProgress(building(0, 0))).toBe(0);
    expect(loadProgress(building(50, 100))).toBeCloseTo(.45);
    expect(loadProgress(building(100, 100))).toBeCloseTo(.9);
    // The total can shrink while the store changes; progress never passes the building share.
    expect(loadProgress(building(120, 100))).toBeCloseTo(.9);
    expect(loadProgress({ phase: 'compiling', built: 100, total: 100 })).toBeCloseTo(.9);
    expect(loadProgress({ phase: 'loaded', built: 100, total: 100 })).toBe(1);
  });

  it('describes every phase and exposes it as an accessible progress bar', () => {
    expect(loadStateText(null)).toBe('Starting renderer');
    expect(loadStateText(building(1200, 3400))).toBe('Building 1,200 of 3,400 objects');
    expect(loadStateText({ phase: 'compiling', built: 3, total: 3 })).toBe('Preparing materials');
    expect(loadingIndicatorAttributes(building(1, 2))).toEqual({ role: 'progressbar', 'aria-label': 'Loading 3D scene', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '45', 'aria-valuetext': 'Building 1 of 2 objects' });
  });
});

describe('build slices', () => {
  it('always allows the first build, then builds until the budget runs out', () => {
    let time = 100; const slice = createBuildSlice(12, () => time);
    time = 150; expect(slice.allow()).toBe(true);
    const next = createBuildSlice(12, () => time);
    expect(next.allow()).toBe(true);
    time = 161; expect(next.allow()).toBe(true);
    time = 162; expect(next.allow()).toBe(false);
  });

  it('builds everything with an infinite budget and one model per slice with a zero budget', () => {
    let time = 0; const unlimited = createBuildSlice(Infinity, () => time);
    time = 1e9; for (let i = 0; i < 5; i++) expect(unlimited.allow()).toBe(true);
    const single = createBuildSlice(0, () => time);
    expect([single.allow(), single.allow()]).toEqual([true, false]);
    // A negative budget behaves like zero rather than building everything.
    const negative = createBuildSlice(-5, () => time);
    expect([negative.allow(), negative.allow()]).toEqual([true, false]);
  });
});

describe('loading indicator in server-rendered adapters', () => {
  it('ships styles that HTML escaping leaves unchanged', () => {
    expect(SCENE_LOADING_STYLES).not.toMatch(/[<>&"']/);
  });

  it('React renders the indicator before the renderer mounts, with replaceable content', () => {
    const store = createSceneStore(); store.configure({ theme: 'midnight' });
    const render = (props: Partial<SceneCanvasProps> = {}) => renderReact(createElement(Provider, { store }, createElement(ReactCanvas, { assets: {}, ...props })));
    const html = render();
    expect(html).toContain('class="kit-scene-loading"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('data-theme="midnight"');
    expect(html).toContain('>Starting renderer<');
    expect(html).toContain(SCENE_LOADING_STYLES);
    expect(render({ loading: false })).not.toContain('kit-scene-loading');
    const custom = render({ loading: (state: SceneLoadState | null) => createElement('em', null, state ? 'Busy' : 'Waiting for data') });
    expect(custom).toContain('<em>Waiting for data</em>');
    expect(custom).not.toContain('>Starting renderer<');
    store.dispose();
  });

  it('Vue renders the same indicator, replaced by the loading slot or turned off by the loading prop', async () => {
    const store = createSceneStore();
    const render = (props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) => renderVue(createSSRApp({ render: () => h(VueProvider, { store }, { default: () => h(VueCanvas, { assets: {}, ...props }, slots) }) }));
    const html = await render();
    expect(html).toContain('class="kit-scene-loading"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('>Starting renderer<');
    expect(html).toContain(SCENE_LOADING_STYLES);
    expect(await render({ loading: false })).not.toContain('kit-scene-loading');
    const custom = await render({}, { loading: ({ state }: { state: SceneLoadState | null }) => h('em', state ? 'Busy' : 'Waiting for data') });
    expect(custom).toContain('<em>Waiting for data</em>');
    expect(custom).not.toContain('>Starting renderer<');
    store.dispose();
  });
});
