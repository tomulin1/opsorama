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
    expect(ring.attrs).toMatchObject({ class: 'dp-action-ring', role: 'toolbar', 'aria-label': 'Server', 'data-tone': 'success' });
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

  it('draws a switch with a knob, reported as a switch, and a compact density', () => {
    const ring = actionRing({ title: 'Forklift', density: 'compact', actions: [{ id: 'auto', label: 'Auto', switch: true, pressed: false, ariaLabel: 'Work by yourself' }, { id: 'done', label: 'Done' }] });
    expect(ring.attrs['data-density']).toBe('compact');
    const [auto, done] = byClass(ring, 'dp-ring-action');
    expect([auto.attrs.role, auto.attrs['aria-checked'], auto.attrs['aria-pressed'], auto.attrs['data-switch']]).toEqual(['switch', false, undefined, true]);
    expect(byClass(auto, 'dp-ring-switch')).toHaveLength(1); expect(byClass(auto, 'dp-ring-knob')).toHaveLength(1);
    expect(done.attrs.role).toBeUndefined();
    expect(byClass(actionRing({ title: 'Forklift', actions: [{ id: 'auto', label: 'Auto', switch: true, pressed: true }] }), 'dp-ring-action')[0].attrs['aria-checked']).toBe(true);
    expect(actionRing({ title: 'Forklift', actions: actions(1) }).attrs['data-density']).toBeUndefined();
    // The root class stays apart from the metric card's dp-ring gauge.
    expect(byClass(ring, 'dp-ring')).toHaveLength(0);
  });

  it('lays out a card with a status dot, a row of actions, one primary action and a leader line', () => {
    const ring = actionRing({ title: 'Replenisher', tone: 'success', layout: 'card', arc: 30, actions: [{ id: 'stop', label: 'Stop', icon: '■', tone: 'critical' }, { id: 'auto', label: 'Auto', switch: true }, { id: 'done', label: 'Done', icon: '✓', primary: true }] });
    expect(ring.attrs['data-layout']).toBe('card');
    expect(ring.children.map(child => child.kind === 'element' ? child.attrs.class : '')).toEqual(['dp-ring-card', 'dp-ring-leader']);
    const [card] = byClass(ring, 'dp-ring-card');
    expect(card.children.map(child => child.kind === 'element' ? child.attrs.class : '')).toEqual(['dp-ring-title', 'dp-ring-actions']);
    expect(byClass(card, 'dp-ring-dot')).toHaveLength(1);
    const pills = byClass(ring, 'dp-ring-action');
    // The card ignores the arc, and only the primary action is marked.
    expect(pills.map(pill => [pill.attrs['data-primary'], pill.style?.['--dp-ring-lift']])).toEqual([[undefined, '0px'], [undefined, '0px'], [true, '0px']]);
    expect(actionRing({ actions: actions(1) }).attrs['data-layout']).toBeUndefined();
    // The card unfolds when it appears unless the host mounts it again; an arc never does.
    expect(ring.attrs['data-unfold']).toBe(true);
    expect(actionRing({ title: 'Replenisher', layout: 'card', unfold: false, actions: actions(1) }).attrs['data-unfold']).toBeUndefined();
    expect(actionRing({ actions: actions(1) }).attrs['data-unfold']).toBeUndefined();
  });

  it('names the fix for invalid input', () => {
    expect(() => actionRing({ actions: [] })).toThrow('needs a title or at least one action');
    expect(() => actionRing({ actions: [{ id: 'x', label: 'A' }, { id: 'x', label: 'B' }] })).toThrow('nonempty and unique');
    expect(() => actionRing({ actions: [{ id: 'x', icon: '✋' }] })).toThrow('an icon-only action needs icon and ariaLabel');
    expect(() => actionRing({ actions: actions(2), arc: -1 })).toThrow('arc must be a finite number');
    expect(() => actionRing({ actions: [{ id: 'auto', icon: '⚙', ariaLabel: 'Auto', switch: true }] })).toThrow('Action auto is a switch; a switch needs a label.');
    expect(() => actionRing({ actions: actions(1), density: 'tiny' as 'compact' })).toThrow('density must be regular or compact, not tiny');
    expect(() => actionRing({ actions: actions(1), layout: 'grid' as 'card' })).toThrow('layout must be arc or card, not grid');
    expect(() => actionRing({ actions: [{ id: 'a', label: 'A', primary: true }, { id: 'b', label: 'B', primary: true }] })).toThrow('Action ring has 2 primary actions; mark at most one.');
  });

  it('renders the same toolbar in React and Vue', async () => {
    const props = { title: 'Server', label: 'Commands of Server', actions: [{ id: 'move', label: 'Move' }, { id: 'inspect', label: 'Inspect' }] };
    const react = renderToStaticMarkup(createElement(ReactRing, props));
    expect(react).toContain('role="toolbar"'); expect(react).toContain('aria-label="Commands of Server"'); expect(react).toContain('Move');
    const vue = await renderToString(createSSRApp({ render: () => h(VueRing, { options: props }) }));
    expect(vue).toContain('role="toolbar"'); expect(vue).toContain('Inspect');
  });
});
