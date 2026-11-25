import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { actionRing, type PanelElement, type PanelNode } from '@opsorama/ui';
import { ActionRing as ReactRing } from '@opsorama/react/ui';
import { ActionRing as VueRing } from '@opsorama/vue/ui';

const elements = <T>(node: PanelNode<T>): PanelElement<T>[] => node.kind === 'element' ? [node, ...node.children.flatMap(elements)] : [];
const byClass = <T>(tree: PanelNode<T>, name: string) => elements(tree).filter(node => String(node.attrs.class ?? '').split(' ').includes(name));
const text = <T>(node: PanelNode<T>): string => node.kind === 'content' ? String(node.value ?? '') : node.children.map(text).join(' ');
const actions = (count: number, onSelect = () => {}) => Array.from({ length: count }, (_, i) => ({ id: `a${i}`, label: `Action ${i}`, onSelect }));

describe('action ring', () => {
  it('is a toolbar of command pills in an arc over a name pill', () => {
    const ring = actionRing({ title: 'Server', tone: 'success', actions: actions(3) });
    expect(ring.attrs).toMatchObject({ class: 'dp-ring', role: 'toolbar', 'aria-label': 'Server', 'data-tone': 'success' });
    // The actions come first and the name pill last, so the name sits nearest the node the ring stands over.
    expect(ring.children.map(child => child.kind === 'element' ? child.attrs.class : '')).toEqual(['dp-ring-actions', 'dp-ring-title']);
    const pills = byClass(ring, 'dp-ring-action');
    expect(pills.map(pill => [pill.tag, pill.attrs.type, pill.attrs['data-tone'], pill.style?.['--dp-ring-lift']])).toEqual([['button', 'button', 'success', '0px'], ['button', 'button', 'success', '18px'], ['button', 'button', 'success', '0px']]);
    expect(byClass(actionRing({ actions: actions(5), arc: 10 }), 'dp-ring-action').map(pill => pill.style?.['--dp-ring-lift'])).toEqual(['0px', '7.5px', '10px', '7.5px', '0px']);
    expect(byClass(actionRing({ actions: actions(1) }), 'dp-ring-action')[0].style?.['--dp-ring-lift']).toBe('18px');
    expect(text(ring)).toContain('Server');
  });

  it('reports switches and disabled actions, and calls only enabled ones', () => {
    const select = vi.fn(), ring = actionRing({ title: 'Reach truck', actions: [
      { id: 'auto', label: 'Auto', pressed: true, onSelect: select },
      { id: 'send', label: 'Send', disabled: true, tone: 'warning', onSelect: select },
      { id: 'take', icon: '✋', ariaLabel: 'Take pallet 1038', onSelect: select },
    ] });
    const [auto, send, take] = byClass(ring, 'dp-ring-action');
    expect([auto.attrs['aria-pressed'], send.attrs.disabled, send.attrs['data-tone'], take.attrs['data-icon-only'], take.attrs.title, take.attrs['aria-label']]).toEqual([true, true, 'warning', true, 'Take pallet 1038', 'Take pallet 1038']);
    auto.onClick?.(); send.onClick?.(); take.onClick?.();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('names the fix for invalid input', () => {
    expect(() => actionRing({ actions: [] })).toThrow('needs a title or at least one action');
    expect(() => actionRing({ actions: [{ id: 'x', label: 'A' }, { id: 'x', label: 'B' }] })).toThrow('nonempty and unique');
    expect(() => actionRing({ actions: [{ id: 'x', icon: '✋' }] })).toThrow('an icon-only action needs icon and ariaLabel');
    expect(() => actionRing({ actions: actions(2), arc: -1 })).toThrow('arc must be a finite number');
  });

  it('renders the same toolbar in React and Vue', async () => {
    const props = { title: 'Server', label: 'Commands of Server', actions: [{ id: 'move', label: 'Move' }, { id: 'inspect', label: 'Inspect' }] };
    const react = renderToStaticMarkup(createElement(ReactRing, props));
    expect(react).toContain('role="toolbar"'); expect(react).toContain('aria-label="Commands of Server"'); expect(react).toContain('Move');
    const vue = await renderToString(createSSRApp({ render: () => h(VueRing, { options: props }) }));
    expect(vue).toContain('role="toolbar"'); expect(vue).toContain('Inspect');
  });
});
