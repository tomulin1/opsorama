import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, resolveCountRepresentation, type AssetNode } from '@opsorama/core';
import { assetCountDefinitions, basicAssets, disposeObject } from '@opsorama/renderer-three';

const parcel = (count: number, multiplier = 1): AssetNode => ({ id: 'parcels', kind: 'asset', asset: 'parcel-base', count, multiplier });
const parts = (object: THREE.Object3D) => { const result: THREE.Object3D[] = []; object.traverse(part => { if (part.name.startsWith('count-part-')) result.push(part); }); return result; };
describe('bounded model counts', () => {
  it('validates finite ranges, exact variants, multiplier and overflow', () => {
    expect(resolveCountRepresentation(parcel(27, 1000), assetCountDefinitions['parcel-base'])).toEqual({ count: 27, multiplier: 1000, total: 27000 });
    expect(resolveCountRepresentation({}, assetCountDefinitions.shelf)).toEqual({ count: 12, multiplier: 1, total: 12 });
    for (const count of [-1, 1.5, 28, NaN]) expect(() => basicAssets['parcel-base'](parcel(count))).toThrow();
    for (const multiplier of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) expect(() => basicAssets['parcel-base'](parcel(27, multiplier))).toThrow();
    for (const asset of ['parcel-base', 'pallet']) { const empty = basicAssets[asset]({ ...parcel(0), asset }); expect(parts(empty)).toHaveLength(0); expect(empty.children.length).toBeGreaterThan(0); disposeObject(empty); }
    expect(() => resolveCountRepresentation({}, { kind: 'range', label: 'Broken range', unit: 'parts', default: 1, min: 1, max: Infinity, step: 1 })).toThrow('finite integer range');
  });
  it('fills parcels in three rows by three columns by three layers with no overlap', () => {
    for (const count of [1, 3, 9, 10, 18, 27]) {
      const model = basicAssets['parcel-base'](parcel(count)), children = parts(model);
      expect(children).toHaveLength(count);
      expect(new Set(children.map(part => part.position.toArray().join(','))).size).toBe(count);
      expect(new Set(children.map(part => part.position.x)).size).toBe(Math.min(count, 3));
      expect(new Set(children.map(part => part.position.z)).size).toBe(Math.min(Math.ceil(count / 3), 3));
      expect(new Set(children.map(part => part.position.y)).size).toBe(Math.ceil(count / 9));
      disposeObject(model);
    }
  });
  it('supports empty and full shelves and preserves existing defaults', () => {
    for (const count of [0, 1, 4, 5, 12]) { const model = basicAssets.shelf({ ...parcel(count), asset: 'shelf' }); expect(parts(model)).toHaveLength(count); expect(model.children.length).toBeGreaterThan(0); disposeObject(model); }
    for (const asset of ['parcel', 'parcel-base']) { const model = basicAssets[asset]({ id: 'order', kind: 'asset', asset }); expect(parts(model)).toHaveLength(1); disposeObject(model); }
  });
  it('multipliers preserve geometry and every owned resource is released', () => {
    const a = basicAssets['parcel-base'](parcel(27)), b = basicAssets['parcel-base'](parcel(27, 1000000));
    expect(new THREE.Box3().setFromObject(a).equals(new THREE.Box3().setFromObject(b))).toBe(true);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    a.traverse(part => { if (part instanceof THREE.Mesh) { geometries.add(part.geometry); materials.add(part.material as THREE.Material); } });
    const release = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    disposeObject(a); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(b);
  });
  it('preserves node selection on count updates', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [parcel(1)] }); store.select('parcels'); store.upsert(parcel(27, 1000));
    expect(store.getSnapshot().selection?.nodeId).toBe('parcels');
    store.dispose();
  });
});
