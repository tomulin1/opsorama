import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { bindBuildingInterior, BUILDING_PALETTES, BUILDING_TYPES, createSceneStore, isInteriorVisible, setBuildingView, type AssetNode, type SceneNode } from '@opsorama/core';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { buildingContents, buildingDefinition } from '../apps/site/examples/building-data';

const building: AssetNode = { id: 'building', kind: 'asset', asset: 'building', building: { view: 'closed' } };
const child: AssetNode = { id: 'desk', kind: 'asset', asset: 'desk-pod', parentId: building.id, position: [1, .12, 0], selectable: true };
const makeStore = (nodes: readonly SceneNode[] = [building]) => createSceneStore({ schemaVersion: 1, nodes });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('building containers', () => {
  it('validates dimensions, views, role overrides, parent types and cycles atomically', () => {
    const store = makeStore(), before = store.getSnapshot();
    for (const config of [{ size: [0, 3, 6] }, { size: [101, 3, 6] }, { size: [8, NaN, 6] }, { view: 'transparent' }, { peekOnHover: 1 }, { colors: { wall: 'red' } }, { colors: { unknown: '#123456' } }]) {
      expect(() => store.upsert({ ...building, building: config } as AssetNode)).toThrow(); expect(store.getSnapshot()).toBe(before);
    }
    expect(() => store.upsert({ ...child, parentId: child.id })).toThrow();
    expect(() => store.replace([child, { ...child, id: building.id, parentId: undefined }])).toThrow('must be a building');
    expect(() => store.replace([{ ...building, parentId: 'nested' }, { ...building, id: 'nested', parentId: building.id }])).toThrow('cycle');
    expect(() => store.upsert({ ...child, building: {} })).toThrow('require the building');
    expect(() => store.upsert({ ...building, count: 1 })).toThrow('does not support');
    expect(() => setBuildingView(store, 'missing', 'open')).toThrow();
    store.dispose();
  });
  it('deeply snapshots building options without mutating caller data', () => {
    const size: [number, number, number] = [8, 3, 6], colors = { roof: '#123456' };
    const store = makeStore([{ ...building, building: { size, colors } }]); size[0] = 20; colors.roof = '#abcdef';
    const node = store.getSnapshot().nodes[0] as AssetNode;
    expect(node.building?.size).toEqual([8, 3, 6]); expect(node.building?.colors?.roof).toBe('#123456');
    expect(Object.isFrozen(node.building?.colors)).toBe(true); expect(Object.isFrozen(node.building?.size)).toBe(true); store.dispose();
  });
  it('makes missing/closed ancestors dormant, preserves independent identities, and clears hidden selection', () => {
    const nested: AssetNode = { ...building, id: 'nested', parentId: building.id, building: { view: 'open' } };
    const desk = { ...child, parentId: nested.id, entityId: 'actual-desk' };
    const store = makeStore([building, nested, desk]);
    expect(isInteriorVisible(desk, store.getSnapshot().nodes)).toBe(false);
    store.select(desk.id); expect(store.getSnapshot().selection).toBeNull();
    setBuildingView(store, building.id, 'peek'); expect(isInteriorVisible(desk, store.getSnapshot().nodes)).toBe(true);
    store.select(desk.id); expect(store.getSnapshot().selection?.entityId).toBe('actual-desk');
    setBuildingView(store, building.id, 'closed'); expect(store.getSnapshot().selection).toBeNull();
    expect(isInteriorVisible({ ...child, parentId: 'pending-parent' }, store.getSnapshot().nodes)).toBe(false);
    store.remove(building.id); expect(store.getSnapshot().nodes).toEqual([]); store.dispose();
  });
});

describe('lazy interior host binding', () => {
  it('waits for visibility, caches successful data, and leaves unrelated host nodes intact', async () => {
    const store = makeStore(), load = vi.fn(async () => [child]), state = vi.fn();
    const unbind = bindBuildingInterior(store, building.id, load, state); await flush(); expect(load).not.toHaveBeenCalled();
    setBuildingView(store, building.id, 'open'); await flush();
    expect(load).toHaveBeenCalledTimes(1); expect(state).toHaveBeenLastCalledWith('ready');
    const cached = store.getSnapshot().nodes.find(node => node.id === child.id); expect(cached?.parentId).toBe(building.id);
    setBuildingView(store, building.id, 'closed'); setBuildingView(store, building.id, 'open'); await flush(); expect(load).toHaveBeenCalledTimes(1);
    store.upsert({ id: 'unrelated', kind: 'asset', asset: 'tree' }); unbind();
    expect(store.getSnapshot().nodes.map(node => node.id)).toEqual([building.id, 'unrelated']); store.dispose();
  });
  it('aborts on close and ignores stale responses even when a loader ignores AbortSignal', async () => {
    const store = makeStore(); const requests: { signal: AbortSignal; resolve: (nodes: readonly SceneNode[]) => void }[] = [];
    const unbind = bindBuildingInterior(store, building.id, signal => new Promise(resolve => requests.push({ signal, resolve })));
    setBuildingView(store, building.id, 'peek'); await flush(); expect(requests).toHaveLength(1);
    setBuildingView(store, building.id, 'closed'); expect(requests[0].signal.aborted).toBe(true);
    setBuildingView(store, building.id, 'open'); await flush(); requests[0].resolve([child]); await flush(); expect(store.getSnapshot().nodes).toHaveLength(1);
    requests[1].resolve([{ ...child, id: 'new' }]); await flush(); expect(store.getSnapshot().nodes.map(node => node.id)).toEqual([building.id, 'new']); unbind(); store.dispose();
  });
  it('cancels loading when an ancestor closes, the building disappears, or the binding is disposed', async () => {
    for (const action of ['ancestor', 'remove', 'unbind']) {
      const store = makeStore([{ ...building, building: { view: 'open' } }, { ...building, id: 'nested', parentId: building.id, building: { view: 'open' } }]);
      let signal: AbortSignal | undefined, resolve: ((nodes: readonly SceneNode[]) => void) | undefined;
      const unbind = bindBuildingInterior(store, 'nested', value => { signal = value; return new Promise(done => { resolve = done; }); }); await flush();
      if (action === 'ancestor') setBuildingView(store, building.id, 'closed'); else if (action === 'remove') store.remove('nested'); else unbind();
      expect(signal?.aborted).toBe(true); resolve?.([child]); await flush(); expect(store.getSnapshot().nodes.some(node => node.id === child.id)).toBe(false); unbind(); store.dispose();
    }
  });
  it('rejects collisions and malformed contents without partial writes, then retries after reopening', async () => {
    const store = makeStore(), state = vi.fn(), load = vi.fn(async () => [child, { ...child, id: building.id }]);
    const unbind = bindBuildingInterior(store, building.id, load, state);
    setBuildingView(store, building.id, 'open'); await flush(); expect(state).toHaveBeenLastCalledWith('error', expect.any(Error)); expect(store.getSnapshot().nodes).toHaveLength(1);
    load.mockResolvedValueOnce([{ ...child, parentId: 'other' }]); setBuildingView(store, building.id, 'closed'); setBuildingView(store, building.id, 'open'); await flush(); expect(store.getSnapshot().nodes).toHaveLength(1);
    load.mockResolvedValueOnce([child]); setBuildingView(store, building.id, 'closed'); setBuildingView(store, building.id, 'open'); await flush(); expect(state).toHaveBeenLastCalledWith('ready'); unbind(); store.dispose();
  });
  it('treats empty contents as a successful cached load and catches synchronous host errors', async () => {
    const store = makeStore(), state = vi.fn();
    const load = vi.fn(() => { throw new Error('Host failed'); });
    const unbind = bindBuildingInterior(store, building.id, load, state); setBuildingView(store, building.id, 'open'); await flush(); expect(state).toHaveBeenLastCalledWith('error', expect.any(Error)); unbind();
    const empty = vi.fn(async () => []); const stop = bindBuildingInterior(store, building.id, empty, state); await flush(); expect(state).toHaveBeenLastCalledWith('ready');
    setBuildingView(store, building.id, 'closed'); setBuildingView(store, building.id, 'open'); await flush(); expect(empty).toHaveBeenCalledTimes(1); stop(); store.dispose();
  });
  it('removes nested contents and cancels their bindings when their owning container is unbound', async () => {
    const store = makeStore([{ ...building, building: { view: 'open' } }]);
    const unbindOuter = bindBuildingInterior(store, building.id, async () => [{ ...building, id: 'nested', building: { view: 'open' } }]); await flush();
    const unbindNested = bindBuildingInterior(store, 'nested', async () => [{ ...child, parentId: 'nested' }]); await flush();
    expect(store.getSnapshot().nodes).toHaveLength(3); unbindOuter(); expect(store.getSnapshot().nodes.map(node => node.id)).toEqual([building.id]); unbindNested(); store.dispose();
  });
});

describe('shared building geometry', () => {
  it('validates types and keeps all styles grounded and bounded at minimum, default and maximum dimensions', () => {
    const store = makeStore(), snapshot = store.getSnapshot();
    expect(() => store.upsert({ ...building, building: { type: 'castle' } } as unknown as AssetNode)).toThrow('Unknown building type'); expect(store.getSnapshot()).toBe(snapshot);
    for (const type of BUILDING_TYPES) for (const size of [[2, 2, 2], [8, 3.6, 6], [100, 100, 100]] as const) {
      const closed = basicAssets.building({ ...building, building: { type, size } }), open = basicAssets.building({ ...building, building: { type, size, view: 'open' } });
      const bounds = new THREE.Box3().setFromObject(closed);
      expect(bounds.min.y, type).toBeCloseTo(0); expect(bounds.max.y, type).toBeLessThanOrEqual(size[1] + .3);
      expect(bounds.min.x, type).toBeGreaterThanOrEqual(-size[0] / 2 - .12); expect(bounds.max.x, type).toBeLessThanOrEqual(size[0] / 2 + .12);
      expect(bounds.max.z, type).toBeLessThanOrEqual(size[2] / 2 + .56);
      expect(closed.getObjectByName('building-roof'), type).toBeDefined(); expect(open.getObjectByName('building-roof'), type).toBeUndefined();
      expect(new THREE.Box3().setFromObject(open).max.y, type).toBeCloseTo(.57);
      expect(closed.userData.buildingBounds.equals(open.userData.buildingBounds), type).toBe(true);
      closed.traverse(part => { if (part instanceof THREE.Mesh) { const positions = part.geometry.getAttribute('position'); for (let index = 0; index < positions.count; index++) for (const value of [positions.getX(index), positions.getY(index), positions.getZ(index)]) expect(Number.isFinite(value), type).toBe(true); } });
      disposeObject(closed); disposeObject(open);
    }
    store.dispose();
  });
  it('gives each type its declared architectural details, inherited colors and stable composition anchors', () => {
    const details = { generic: 'building-roof-seam', warehouse: 'building-shutter-slat', 'distribution-center': 'building-dock-door', workshop: 'building-gable', office: 'building-parapet', retail: 'building-awning', 'storage-shed': 'building-ridge' };
    for (const type of BUILDING_TYPES) {
      const node: AssetNode = { ...building, building: { type, colors: { roof: '#123456' } } };
      const closed = basicAssets.building(node, { theme: 'midnight' }), open = basicAssets.building({ ...node, building: { ...node.building, view: 'open' } });
      expect(closed.getObjectByName(details[type]), type).toBeDefined(); expect(open.getObjectByName(details[type]), type).toBeUndefined();
      for (const name of ['interior', 'entrance', 'roof']) expect(closed.getObjectByName(`anchor-${name}`)?.position.toArray()).toEqual(open.getObjectByName(`anchor-${name}`)?.position.toArray());
      const wall = closed.getObjectByName('building-wall') as THREE.Mesh; expect((wall.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(BUILDING_PALETTES.midnight.wall.slice(1));
      const roof = closed.getObjectByName(type === 'workshop' || type === 'storage-shed' ? 'building-roof-panel' : 'building-roof') as THREE.Mesh;
      expect((roof.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('123456');
      if (type === 'distribution-center') for (let index = 0; index < 3; index++) expect(closed.getObjectByName(`anchor-dock-${index}`)?.position.toArray()).toEqual(open.getObjectByName(`anchor-dock-${index}`)?.position.toArray());
      const resources = new Set<THREE.Material | THREE.BufferGeometry>(); closed.traverse(part => { if (part instanceof THREE.Mesh) { resources.add(part.geometry); resources.add(part.material as THREE.Material); } });
      const calls = [...resources].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(closed); calls.forEach(call => expect(call).toHaveBeenCalledTimes(1)); disposeObject(open);
    }
  });
  it('declares grounded bounds and anchors, and provides a static accessible cutaway', () => {
    const closed = basicAssets.building(building), open = basicAssets.building({ ...building, building: { view: 'open' } });
    const bounds = new THREE.Box3().setFromObject(closed); expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.y).toBeCloseTo(3.7825);
    expect(closed.getObjectByName('anchor-interior')?.position.toArray()).toEqual([0, .12, 0]); expect(closed.getObjectByName('anchor-entrance')?.position.z).toBeGreaterThan(3);
    expect(closed.getObjectByName('building-roof')).toBeDefined(); expect(open.getObjectByName('building-roof')).toBeUndefined();
    expect(new THREE.Box3().setFromObject(open).max.y).toBeCloseTo(.57); expect(open.userData.buildingBounds.equals(closed.userData.buildingBounds)).toBe(true);
    disposeObject(closed); disposeObject(open);
  });
  it('inherits both scene palettes with partial overrides and instance-owned disposal', () => {
    const first = basicAssets.building({ ...building, building: { colors: { roof: '#123456' } } }, { theme: 'midnight' });
    const second = basicAssets.building(building, { theme: 'light' });
    const color = (model: THREE.Object3D, name: string) => ((model.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
    expect(color(first, 'building-wall')).toBe(BUILDING_PALETTES.midnight.wall.slice(1)); expect(color(first, 'building-roof')).toBe('123456'); expect(color(second, 'building-wall')).toBe(BUILDING_PALETTES.light.wall.slice(1));
    const materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>(); first.traverse(part => { if (part instanceof THREE.Mesh) { geometries.add(part.geometry); materials.add(part.material as THREE.Material); } });
    const calls = [...materials, ...geometries].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(first); calls.forEach(call => expect(call).toHaveBeenCalledTimes(1));
    expect(color(second, 'building-wall')).toBe(BUILDING_PALETTES.light.wall.slice(1)); disposeObject(second);
  });
  it('inherits transforms for two distinct compositions while keeping child identities and counts intact', () => {
    const store = createSceneStore(buildingDefinition);
    for (const id of ['workshop', 'office'] as const) {
      const node = store.getSnapshot().nodes.find(candidate => candidate.id === id) as AssetNode;
      const parent = basicAssets.building(node); parent.position.set(...node.position!); parent.rotation.set(...node.rotation!); parent.scale.set(2, 2, 2);
      for (const child of buildingContents(id)) {
        if (child.kind !== 'asset') continue;
        const object = basicAssets[child.asset](child); object.position.set(...child.position!); parent.add(object); parent.updateMatrixWorld(true);
        const expected = new THREE.Vector3(...child.position!).applyMatrix4(parent.matrixWorld); expect(object.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-10);
        object.removeFromParent(); disposeObject(object);
      }
      disposeObject(parent);
    }
    store.dispose();
  });
});
