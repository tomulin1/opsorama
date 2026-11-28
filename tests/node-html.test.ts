import { describe, expect, it } from 'vitest';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { createSceneStore, type SceneStore } from '@opsorama/core';
import { createNodeHtmlLayer, NODE_HTML_ATTRIBUTE, NODE_HTML_TRANSLATE, NODE_HTML_Z_INDEX, validateNodeHtmlOptions, type NodeHtmlProjector } from '@opsorama/three';
import { DashboardProvider as ReactProvider, NodeHtml as ReactNodeHtml } from '@opsorama/react';
import { DashboardProvider as VueProvider, NodeHtml as VueNodeHtml } from '@opsorama/vue';

/** A stand-in for an HTML element: records style writes, attributes, listeners and removal. */
function fakeElement(initial: Record<string, string> = {}) {
  const values: Record<string, string> = { position: '', top: '', left: '', transform: '', visibility: '', pointerEvents: '', zIndex: '', ...initial };
  const writes: string[] = [], attributes = new Map<string, string>(), listeners = new Map<string, Set<(event: Event) => void>>();
  let removed = 0;
  const style = new Proxy(values, { set(target, key, value) { writes.push(`${String(key)}=${value}`); target[key as string] = value; return true; } });
  const element = {
    style, setAttribute: (name: string, value: string) => { attributes.set(name, value); }, getAttribute: (name: string) => attributes.get(name) ?? null, removeAttribute: (name: string) => { attributes.delete(name); },
    addEventListener: (type: string, listener: (event: Event) => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener: (type: string, listener: (event: Event) => void) => { listeners.get(type)?.delete(listener); },
    remove: () => { removed++; },
  };
  return { element: element as unknown as HTMLElement, values, writes, attributes, listeners, removed: () => removed };
}
const fakeLayer = () => { const children: unknown[] = []; return { layer: { append: (...nodes: unknown[]) => { children.push(...nodes); } } as unknown as Pick<HTMLElement, 'append'>, children }; };

describe('node HTML options', () => {
  it('accepts valid options and rejects invalid ones with a message that names the fix', () => {
    expect(() => validateNodeHtmlOptions(undefined)).not.toThrow();
    expect(() => validateNodeHtmlOptions({ anchor: 'top', offset: [0, 1, 0], align: 'center' })).not.toThrow();
    expect(() => validateNodeHtmlOptions([])).toThrow(/must be an object/);
    expect(() => validateNodeHtmlOptions({ anchor: ' ' })).toThrow(/anchor must be a non-empty anchor name/);
    expect(() => validateNodeHtmlOptions({ offset: [0, Number.NaN, 0] })).toThrow(/three finite numbers/);
    expect(() => validateNodeHtmlOptions({ offset: [0, 1] })).toThrow(/three finite numbers/);
    expect(() => validateNodeHtmlOptions({ align: 'left' })).toThrow(/one of above, center, below; got "left"/);
  });
});

describe('node HTML layer', () => {
  it('attaches an element to the layer, marks it and lets it take pointer input', () => {
    const { layer, children } = fakeLayer(), html = createNodeHtmlLayer(layer), item = fakeElement();
    const handle = html.attach('robot', item.element);
    expect(children).toEqual([item.element]); expect(html.size).toBe(1);
    expect(item.attributes.get(NODE_HTML_ATTRIBUTE)).toBe('robot');
    expect(item.values).toMatchObject({ position: 'absolute', top: '0', left: '0', pointerEvents: 'auto', zIndex: NODE_HTML_Z_INDEX, visibility: 'hidden' });
    expect(handle.getState()).toEqual({ visible: false, x: Number.NaN, y: Number.NaN });
    // The wheel over the element stops at it, so the scene does not zoom.
    let stopped = 0; for (const listener of item.listeners.get('wheel')!) listener({ stopPropagation: () => { stopped++; } } as Event);
    expect(stopped).toBe(1);
  });

  it('places the element on its projected point per align, and hides it while the point cannot show', () => {
    const { layer } = fakeLayer(), html = createNodeHtmlLayer(layer), item = fakeElement(), calls: unknown[][] = [];
    let point: { x: number; y: number } | null = { x: 120, y: 80 };
    const project: NodeHtmlProjector = (...args) => { calls.push(args); return point; };
    const handle = html.attach('robot', item.element, { anchor: 'top', offset: [0, .5, 0] });
    html.layout(project);
    expect(calls).toEqual([['robot', 'top', [0, .5, 0]]]);
    expect(item.values.transform).toBe(`translate(120px,80px) ${NODE_HTML_TRANSLATE.above}`); expect(item.values.visibility).toBe('visible');
    expect(handle.getState()).toEqual({ visible: true, x: 120, y: 80 });
    handle.update({ align: 'below' }); html.layout(project);
    expect(item.values.transform).toBe(`translate(120px,80px) ${NODE_HTML_TRANSLATE.below}`);
    // Omitted options return to their defaults.
    expect(calls.at(-1)).toEqual(['robot', undefined, undefined]);
    point = null; html.layout(project);
    expect(item.values.visibility).toBe('hidden'); expect(handle.getState().visible).toBe(false);
    point = { x: 120, y: 80 }; html.layout(project);
    expect(item.values.visibility).toBe('visible'); expect(item.values.transform).toBe(`translate(120px,80px) ${NODE_HTML_TRANSLATE.below}`);
  });

  it('writes styles only when the position, align or visibility changed', () => {
    const { layer } = fakeLayer(), html = createNodeHtmlLayer(layer), item = fakeElement(), project: NodeHtmlProjector = () => ({ x: 10, y: 20 });
    html.attach('robot', item.element); html.layout(project);
    const writes = item.writes.length;
    html.layout(project); html.layout(project);
    expect(item.writes.length).toBe(writes);
    html.layout(() => ({ x: 11, y: 20 }));
    expect(item.writes.slice(writes)).toEqual([`transform=translate(11px,20px) ${NODE_HTML_TRANSLATE.above}`]);
  });

  it('removes an element, restores its inline styles and attribute, and allows attaching it again', () => {
    const { layer } = fakeLayer(), html = createNodeHtmlLayer(layer), item = fakeElement({ position: 'relative', zIndex: '3' });
    const handle = html.attach('robot', item.element);
    expect(() => html.attach('rack', item.element)).toThrow(/already attached to node "robot"; call remove\(\)/);
    html.layout(() => ({ x: 1, y: 2 }));
    handle.remove(); handle.remove();
    expect(item.removed()).toBe(1); expect(html.size).toBe(0);
    expect(item.values).toMatchObject({ position: 'relative', zIndex: '3', transform: '', visibility: '', pointerEvents: '', top: '', left: '' });
    expect(item.attributes.has(NODE_HTML_ATTRIBUTE)).toBe(false); expect(item.listeners.get('wheel')!.size).toBe(0);
    expect(handle.getState().visible).toBe(false);
    // A removed element is no longer placed.
    html.layout(() => ({ x: 5, y: 5 })); expect(item.values.transform).toBe('');
    expect(() => html.attach('rack', item.element)).not.toThrow();
  });

  it('clears every attachment and rejects a missing node ID or element', () => {
    const { layer } = fakeLayer(), html = createNodeHtmlLayer(layer), a = fakeElement(), b = fakeElement();
    html.attach('a', a.element); html.attach('b', b.element);
    html.clear();
    expect(html.size).toBe(0); expect(a.removed()).toBe(1); expect(b.removed()).toBe(1);
    expect(() => html.attach('', fakeElement().element)).toThrow(/ID of a scene node/);
    expect(() => html.attach('a', null as unknown as HTMLElement)).toThrow(/needs an HTML element/);
    expect(() => html.attach('a', fakeElement().element, { align: 'side' as never })).toThrow(/align must be one of/);
  });
});

describe('NodeHtml adapters', () => {
  it('render nothing on the server, in React and Vue', async () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [] });
    const Provider = ReactProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>;
    const react = renderReact(createElement(Provider, { store }, createElement(ReactNodeHtml, { nodeId: 'robot', className: 'menu' }, 'Menu')));
    expect(react).toBe('');
    const vue = await renderVue(createSSRApp({ render: () => h(VueProvider, { store }, { default: () => h(VueNodeHtml, { nodeId: 'robot', class: 'menu' }, { default: () => 'Menu' }) }) }));
    expect(vue).not.toContain('Menu');
    store.dispose();
  });
});
