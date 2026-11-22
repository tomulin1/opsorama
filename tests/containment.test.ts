import { describe, expect, it } from 'vitest';
import { bindChildren, createSceneStore, isContained, isNodeVisible, NODE_VIEWS, nodeView, setNodeView, validateParents, type AssetNode, type SceneNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

// Any asset can contain children; a cabinet stands in for a container that is not a building.
const cabinet: AssetNode = { id: 'cabinet', kind: 'asset', asset: 'equipment-cabinet', position: [2, 0, 0] };
const server: AssetNode = { id: 'server', kind: 'asset', asset: 'rack-server', parentId: cabinet.id, position: [0, .4, 0], selectable: true };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('generic containment', () => {
  it('lets any asset be a parent and hides its children until its view opens', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [cabinet, server] });
    expect(nodeView(store.getSnapshot().nodes[0])).toBe('closed');
    expect(isNodeVisible(server, store.getSnapshot().nodes)).toBe(false);
    setNodeView(store, cabinet.id, 'peek'); expect(isNodeVisible(server, store.getSnapshot().nodes)).toBe(true);
    store.select(server.id); expect(store.getSnapshot().selection?.nodeId).toBe(server.id);
    setNodeView(store, cabinet.id, 'closed'); expect(isNodeVisible(server, store.getSnapshot().nodes)).toBe(false);
    expect(store.getSnapshot().selection).toBeNull();
    setNodeView(store, cabinet.id, 'open'); expect(isNodeVisible(server, store.getSnapshot().nodes)).toBe(true);
    store.remove(cabinet.id); expect(store.getSnapshot().nodes).toEqual([]); store.dispose();
  });

  it('rejects parents that are not asset nodes and parent cycles with actionable errors', () => {
    const ground: SceneNode = { id: 'floor', kind: 'ground', size: [4, 4] };
    expect(() => validateParents([ground, { ...server, parentId: ground.id }])).toThrow('Parent floor of server must be an asset node');
    expect(() => validateParents([{ ...cabinet, parentId: server.id }, server])).toThrow('Parent cycle');
    expect(() => validateParents([server])).not.toThrow();
    const store = createSceneStore({ schemaVersion: 1, nodes: [ground] });
    expect(() => setNodeView(store, ground.id, 'open')).toThrow('only asset nodes have a view');
    expect(() => store.upsert({ ...cabinet, view: 'ajar' } as unknown as AssetNode)).toThrow(`Use ${NODE_VIEWS.join(', ')}`);
    expect(() => store.upsert({ ...cabinet, peekOnHover: 'yes' } as unknown as AssetNode)).toThrow('peekOnHover');
    store.dispose();
  });

  it('marks children and what they carry as contained, independent of the view', () => {
    const tote: AssetNode = { id: 'tote', kind: 'asset', asset: 'tote', attachment: { nodeId: server.id } };
    const byId = new Map<string, SceneNode>([cabinet, server, tote].map(node => [node.id, node]));
    expect(isContained(server, byId)).toBe(true); expect(isContained(tote, byId)).toBe(true); expect(isContained(cabinet, byId)).toBe(false);
  });

  it('loads the children of a non-building container on demand with bindChildren', async () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [cabinet] }), states: string[] = [];
    const unbind = bindChildren(store, cabinet.id, async () => [{ ...server, parentId: undefined }], state => states.push(state));
    await flush(); expect(states).toEqual([]);
    setNodeView(store, cabinet.id, 'open'); await flush();
    expect(states).toEqual(['loading', 'ready']); expect(store.getSnapshot().nodes.find(node => node.id === server.id)?.parentId).toBe(cabinet.id);
    unbind(); expect(store.getSnapshot().nodes.map(node => node.id)).toEqual([cabinet.id]); store.dispose();
  });

  it('takes label heights and container bounds from factory hints', () => {
    const worker = catalogAssets.worker({ id: 'w', kind: 'asset', asset: 'worker' }), hall = catalogAssets.building({ id: 'h', kind: 'asset', asset: 'building', options: { building: { size: [10, 5, 8] } } });
    expect(worker.userData.labelHeight).toBe(2.15); expect(worker.userData.containerBounds).toBeUndefined();
    expect(hall.userData.labelHeight).toBeCloseTo(5.4); expect(hall.userData.containerBounds).toBeDefined();
    disposeObject(worker); disposeObject(hall);
  });
});
