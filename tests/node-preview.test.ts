import { describe, expect, it } from 'vitest';
import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToString as renderReact } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { createSceneStore, type SceneNode, type SceneStore } from '@opsorama/core';
import { NODE_PREVIEW_MAX_NODES, previewNodes } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';
import { DashboardProvider as ReactProvider, NodePreview as ReactNodePreview } from '@opsorama/react';
import { DashboardProvider as VueProvider, NodePreview as VueNodePreview } from '@opsorama/vue';

const Provider = ReactProvider as FunctionComponent<{ store: SceneStore; children?: ReactNode }>;

const nodes: SceneNode[] = [
  { id: 'counter', kind: 'asset', asset: 'station', position: [4, .12, -3], rotation: [0, 1, 0], label: 'Counter', entityId: 'COUNTER', route: { points: [[4, .12, -3], [6, .12, -3]], speed: 1 } } as SceneNode,
  { id: 'espresso', kind: 'asset', asset: 'espresso-machine', attachment: { nodeId: 'counter', anchor: 'top' }, state: 'warning' },
  { id: 'pin', kind: 'asset', asset: 'map-pin', attachment: { nodeId: 'espresso' } },
  { id: 'alert', kind: 'marker', attachment: { nodeId: 'counter' }, label: 'Hot' },
  { id: 'note', kind: 'asset', asset: 'order-ticket', attachment: { nodeId: 'alert' } },
  { id: 'hall', kind: 'asset', asset: 'building', position: [10, 0, 0], building: { view: 'closed' } },
  { id: 'rack', kind: 'asset', asset: 'equipment-cabinet', parentId: 'hall', position: [1, .12, 0] },
  { id: 'aisle', kind: 'zone', parentId: 'hall', size: [2, 1], position: [0, .04, 0] },
  { id: 'loose', kind: 'asset', asset: 'tote', parentId: 'counter', position: [0, 0, 0] },
];

describe('previewNodes', () => {
  it('copies the node at the origin with its attached descendants, owners first, and nothing that travels', () => {
    const copy = previewNodes(nodes, 'counter');
    expect(copy.map(node => node.id)).toEqual(['counter', 'espresso', 'pin']);
    expect(copy[0]).toMatchObject({ position: [0, 0, 0], rotation: [0, 1, 0], label: 'Counter' });
    expect(copy[0]).not.toHaveProperty('route');
    expect(copy[1]).toMatchObject({ attachment: { nodeId: 'counter', anchor: 'top' }, state: 'warning' });
  });

  it('leaves out markers with what they carry, and parentId children of anything but an open building', () => {
    expect(previewNodes(nodes, 'counter').map(node => node.id)).not.toContain('note');
    expect(previewNodes(nodes, 'counter').map(node => node.id)).not.toContain('loose');
    expect(previewNodes(nodes, 'alert')).toEqual([]);
    expect(previewNodes(nodes, 'missing')).toEqual([]);
  });

  it('shows a building interior only while the building is open, as the scene does', () => {
    expect(previewNodes(nodes, 'hall').map(node => node.id)).toEqual(['hall']);
    const open = nodes.map(node => node.id === 'hall' ? { ...node, building: { view: 'open' as const } } : node);
    expect(previewNodes(open, 'hall').map(node => node.id)).toEqual(['hall', 'rack', 'aisle']);
    expect(previewNodes(open, 'rack')[0]).not.toHaveProperty('parentId');
  });

  it('keeps the root and the nearest descendants within the node limit', () => {
    expect(NODE_PREVIEW_MAX_NODES).toBe(240);
    expect(previewNodes(nodes, 'counter', 2).map(node => node.id)).toEqual(['counter', 'espresso']);
    expect(previewNodes(nodes, 'counter', 0)).toEqual([]);
  });

  it('does not change the scene nodes', () => {
    const before = JSON.stringify(nodes);
    previewNodes(nodes, 'counter');
    expect(JSON.stringify(nodes)).toBe(before);
  });
});

describe('NodePreview in server-rendered adapters', () => {
  it('renders the same sized container in React and Vue without touching WebGL', async () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'box', kind: 'asset', asset: 'parcel' }] });
    const react = renderReact(createElement(Provider, { store }, createElement(ReactNodePreview, { nodeId: 'box', assets: catalogAssets })));
    const vue = await renderVue(createSSRApp({ render: () => h(VueProvider, { store }, () => h(VueNodePreview, { nodeId: 'box', assets: catalogAssets })) }));
    for (const html of [react, vue]) {
      expect(html).toMatch(/position:\s*relative/);
      expect(html).toMatch(/height:\s*160px/);
      expect(html).not.toContain('<canvas');
    }
    store.dispose();
  });
});
