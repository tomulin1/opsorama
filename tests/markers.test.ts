import { describe, expect, it } from 'vitest';
import { createSceneStore, interiorAreas, MARKER_ICONS, MARKER_SHAPES, MARKER_SIZES, resolveMarkerTone, validateNode, type MarkerNode } from '@opsorama/core';
import { MARKER_ICON_ELEMENTS, MARKER_SHAPE_GEOMETRY, markerAccessibleName, resolveMarkerAppearance } from '@opsorama/renderer-three';
import { defaultFeaturedMarker, markerGallery, markerSceneNodes, markerSnippet } from '../examples/marker-data';

const marker = (extra: Partial<MarkerNode> = {}): MarkerNode => ({ id: 'm', kind: 'marker', label: 'Inlet alert', ...extra });

describe('scene marker contract', () => {
  it('accepts every shape, icon and size and a custom icon', () => {
    for (const shape of MARKER_SHAPES) expect(() => validateNode(marker({ shape }))).not.toThrow();
    for (const icon of MARKER_ICONS) expect(() => validateNode(marker({ icon }))).not.toThrow();
    for (const markerSize of Object.keys(MARKER_SIZES) as (keyof typeof MARKER_SIZES)[]) expect(() => validateNode(marker({ markerSize }))).not.toThrow();
    expect(() => validateNode(marker({ icon: { paths: ['M4 4h16v16H4z', 'm8 12 3 3 5-6'] } }))).not.toThrow();
  });
  it('rejects bad input with a message that names the fix', () => {
    expect(() => validateNode({ id: 'm', kind: 'marker' } as MarkerNode)).toThrow(/label is required/);
    expect(() => validateNode(marker({ shape: 'star' as never }))).toThrow(/unknown shape "star"; use one of pin/);
    expect(() => validateNode(marker({ tone: 'danger' as never }))).toThrow(/unknown tone/);
    expect(() => validateNode(marker({ icon: 'skull' as never }))).toThrow(/unknown icon "skull".*\{ paths \}/);
    expect(() => validateNode(marker({ markerSize: 'huge' as never }))).toThrow(/use small, medium or large/);
    expect(() => validateNode(marker({ icon: { paths: ['M0 0"/><script>'] } }))).toThrow(/SVG path data/);
    expect(() => validateNode(marker({ icon: { paths: [] } }))).toThrow(/1–8 paths/);
    expect(() => validateNode(marker({ eyebrow: 'x'.repeat(41) }))).toThrow(/eyebrow/);
    expect(() => validateNode(marker({ detail: ' ' }))).toThrow(/detail/);
    expect(() => validateNode(marker({ pulse: 'yes' as never }))).toThrow(/pulse/);
    expect(() => validateNode({ ...marker(), interior: true } as MarkerNode)).toThrow(/cannot be an interior area/);
  });
  it('derives the tone from state unless set', () => {
    expect(resolveMarkerTone({}, 'critical')).toBe('critical'); expect(resolveMarkerTone({}, 'warning')).toBe('warning');
    expect(resolveMarkerTone({}, 'inactive')).toBe('neutral'); expect(resolveMarkerTone({}, 'busy')).toBe('info'); expect(resolveMarkerTone({ tone: 'success' }, 'critical')).toBe('success');
  });
  it('stores markers frozen, follows an anchor and stays out of interior areas', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: markerSceneNodes(defaultFeaturedMarker) });
    const stored = store.getSnapshot().nodes.find(node => node.id === 'featured')!;
    expect(stored).toMatchObject({ kind: 'marker', attachment: { nodeId: 'cabinet', anchor: 'top' } }); expect(Object.isFrozen(stored)).toBe(true);
    store.upsert(marker({ id: 'custom', icon: { paths: ['M4 4h16'] } }));
    const custom = store.getSnapshot().nodes.find(node => node.id === 'custom') as MarkerNode;
    expect(Object.isFrozen(custom.icon)).toBe(true); expect(interiorAreas(store.getSnapshot().nodes)).toEqual([]);
    store.dispose();
  });
});

describe('scene marker appearance', () => {
  it('has geometry for every shape and drawing for every icon', () => {
    for (const shape of MARKER_SHAPES) expect(MARKER_SHAPE_GEOMETRY[shape].d).toMatch(/Z$/);
    for (const icon of MARKER_ICONS) if (icon !== 'none') expect(MARKER_ICON_ELEMENTS[icon].length).toBeGreaterThan(0);
  });
  it('reads tone colours from the scene palette, and node colour wins', () => {
    expect(resolveMarkerAppearance(marker({ tone: 'critical' })).color).toBe('#d9483b');
    expect(resolveMarkerAppearance(marker({ tone: 'critical' }), { critical: '#ff0000' }).color).toBe('#ff0000');
    expect(resolveMarkerAppearance(marker({ tone: 'success' }), { normal: '#00aa00' }).color).toBe('#00aa00');
    expect(resolveMarkerAppearance(marker({ tone: 'info' }), { accent: '#0000ff' }).color).toBe('#0000ff');
    expect(resolveMarkerAppearance(marker({ tone: 'critical', color: '#123456' }), { critical: '#ff0000' }).color).toBe('#123456');
  });
  it('defaults to a medium pin with the tone icon, and pulses only critical markers', () => {
    const critical = resolveMarkerAppearance(marker({ state: 'critical' }));
    expect(critical).toMatchObject({ shape: 'pin', tone: 'critical', width: 32, height: 40, pulse: true });
    expect(critical.icon).toBe(MARKER_ICON_ELEMENTS.alert);
    expect(resolveMarkerAppearance(marker({ tone: 'success' }))).toMatchObject({ icon: MARKER_ICON_ELEMENTS.check, pulse: false });
    expect(resolveMarkerAppearance(marker({ shape: 'circle', markerSize: 'large', pulse: true }))).toMatchObject({ width: 40, height: 40, pulse: true });
    expect(resolveMarkerAppearance(marker({ icon: 'none' })).icon).toBeNull();
    expect(resolveMarkerAppearance(marker({ icon: { paths: ['M4 4h16'] } })).icon).toEqual([['path', { d: 'M4 4h16' }]]);
  });
  it('names the button with the card text in reading order', () => {
    expect(markerAccessibleName(marker({ eyebrow: 'Critical', detail: '34.8 °C' }))).toBe('Select Critical · Inlet alert · 34.8 °C');
    expect(markerAccessibleName(marker())).toBe('Select Inlet alert');
  });
});

describe('marker examples', () => {
  it('show every shape once and write snippets for each adapter', () => {
    expect(markerGallery.map(item => item.shape)).toEqual([...MARKER_SHAPES]);
    for (const item of markerGallery) expect(() => validateNode(item)).not.toThrow();
    expect(markerSnippet(defaultFeaturedMarker, 'react')).toContain("attachment={{ nodeId: 'cabinet', anchor: 'top' }}");
    expect(markerSnippet(defaultFeaturedMarker, 'vue')).toContain(":attachment=\"{ nodeId: 'cabinet', anchor: 'top' }\"");
    expect(markerSnippet(defaultFeaturedMarker, 'javascript')).toContain("kind: 'marker',");
  });
});
