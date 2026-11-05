import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, validateNode, type AssetNode } from '@opsorama/core';
import { basicAssets, disposeObject, assetCountDefinitions, assetCountLayoutDefaults } from '@opsorama/renderer-three';
import { catalogObjects, objectNode, objectSnippet } from '../src/features/docs/objects';
import { previewScale } from '../src/features/docs/object-rendering';
import { animateAsset } from '../packages/renderer-three/src/animation';

const build = (asset: string, count: number, extra: Partial<AssetNode> = {}) => basicAssets[asset]({ id: 'stock', kind: 'asset', asset, count, ...extra });
function parts(model: THREE.Object3D) { const result: THREE.Object3D[] = []; model.traverse(part => { if (part.name.startsWith('count-part-')) result.push(part); }); return result; }
function counts(asset: string) { const definition = assetCountDefinitions[asset]; return definition.kind === 'variants' ? [...definition.values] : Array.from({ length: (definition.max - definition.min) / definition.step + 1 }, (_, index) => definition.min + index * definition.step); }

describe('pallet and reserved count layouts', () => {
  it('fills all 27 pallet slots without moving or resizing existing boxes or changing the wooden base', () => {
    const full = build('pallet', 27), fullParts = parts(full), base = full.getObjectByName('pallet-deck') as THREE.Mesh<THREE.BoxGeometry>;
    const maximum = fullParts.map(part => ({ position: part.position.toArray(), scale: part.scale.toArray() }));
    const bounds = new THREE.Box3().setFromObject(full); expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.x - bounds.min.x).toBeCloseTo(1.2, 2); expect(bounds.max.z - bounds.min.z).toBeCloseTo(1, 2);
    expect(full.getObjectByName('anchor-load')?.position.y).toBeCloseTo(.21);
    expect(full.getObjectByName('anchor-front')?.position.z).toBeCloseTo(.5);
    for (let count = 0; count <= 27; count++) {
      const model = build('pallet', count), children = parts(model);
      expect(children).toHaveLength(count); expect(children.map(part => ({ position: part.position.toArray(), scale: part.scale.toArray() }))).toEqual(maximum.slice(0, count));
      expect((model.getObjectByName('pallet-deck') as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters).toEqual(base.geometry.parameters);
      expect(model.children.filter(part => part.name.startsWith('pallet-'))).toHaveLength(20);
      disposeObject(model);
    }
    const boxes = fullParts.map(part => new THREE.Box3().setFromObject(part));
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(boxes[a].intersectsBox(boxes[b])).toBe(false);
    const before = fullParts.map(part => part.position.toArray()); animateAsset(full, { time: 2, delta: 1 }); expect(fullParts.map(part => part.position.toArray())).toEqual(before);
    disposeObject(full);
  });

  it('preserves slots and part geometry across every supported reserved-layout count', () => {
    for (const asset of Object.keys(assetCountLayoutDefaults)) {
      const values = counts(asset), full = build(asset, Math.max(...values), { countLayout: 'reserved' });
      const signature = (part: THREE.Object3D) => { const meshes: unknown[] = []; part.traverse(child => { if (child instanceof THREE.Mesh) meshes.push([child.name, child.geometry.getAttribute('position').array]); }); return [part.position.toArray(), part.rotation.toArray(), part.scale.toArray(), meshes]; };
      const fullParts = parts(full).map(signature);
      for (const count of values) {
        const model = build(asset, count, { countLayout: 'reserved' });
        expect(parts(model).map(signature), `${asset}: ${count}`).toEqual(fullParts.slice(0, count));
        if (asset === 'parcel-base') {
          const fullBounds = new THREE.Box3().setFromObject(full), bounds = new THREE.Box3().setFromObject(model);
          expect(bounds.min.x).toBeCloseTo(fullBounds.min.x); expect(bounds.max.x).toBeCloseTo(fullBounds.max.x);
          expect(bounds.min.z).toBeCloseTo(fullBounds.min.z); expect(bounds.max.z).toBeCloseTo(fullBounds.max.z);
        }
        disposeObject(model);
      }
      disposeObject(full);
    }
  });

  it('fits every counted catalog preview to capacity, including empty containers, independently of current count', () => {
    for (const item of catalogObjects.filter(item => item.countDefinition)) {
      const scales = counts(item.asset!).map(count => previewScale(item, { count, measurement: false }));
      expect(scales.every(scale => scale === scales[0]), item.asset).toBe(true); expect(scales[0]).toBeGreaterThan(0);
    }
  });

  it('preserves host compact defaults, validates layout input and exports the selected layout', () => {
    const compact = build('parcel-base', 1), reserved = build('parcel-base', 1, { countLayout: 'reserved' });
    expect(parts(compact)[0].position.toArray()).toEqual([0, 0, 0]); expect(parts(reserved)[0].position.toArray()).toEqual([-1.12, 0, -.93]);
    // An empty compact base keeps the one-parcel plate; an empty reserved base keeps the full capacity.
    const plate = (model: THREE.Object3D) => (model.getObjectByName('base-plate') as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters;
    const emptyCompact = build('parcel-base', 0), emptyReserved = build('parcel-base', 0, { countLayout: 'reserved' });
    expect(plate(emptyCompact)).toMatchObject(plate(compact)); expect(plate(emptyReserved)).toMatchObject(plate(reserved)); disposeObject(emptyCompact); disposeObject(emptyReserved);
    expect(() => validateNode({ id: 'bad', kind: 'asset', asset: 'parcel-base', countLayout: 'bad' as AssetNode['countLayout'] })).toThrow('Invalid count layout');
    const item = catalogObjects.find(item => item.asset === 'parcel-base')!, node = objectNode(item);
    expect(node).toMatchObject({ countLayout: 'reserved' }); expect(objectSnippet(node, 'React')).toContain('countLayout="reserved"'); expect(objectSnippet(node, 'Vue')).toContain('countLayout="reserved"');
    expect(objectSnippet(objectNode(item, { countLayout: 'compact' }), 'JavaScript')).toContain('"countLayout": "compact"');
    disposeObject(compact); disposeObject(reserved);
  });

  it('validates pallet counts, conserves source quantity and disposes all instance-owned resources', () => {
    for (const count of [28, -1, 1.5, NaN]) expect(() => build('pallet', count)).toThrow();
    const a = build('pallet', 27, { multiplier: 1000 }), b = build('pallet', 27, { multiplier: 1 });
    expect(new THREE.Box3().setFromObject(a)).toEqual(new THREE.Box3().setFromObject(b));
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    a.traverse(part => { if (part instanceof THREE.Mesh) { resources.add(part.geometry); resources.add(part.material as THREE.Material); } });
    const spies = [...resources].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(a); spies.forEach(spy => expect(spy).toHaveBeenCalledOnce()); disposeObject(b);
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'stock', kind: 'asset', asset: 'pallet', count: 1 }] }); store.select('stock'); store.upsert({ id: 'stock', kind: 'asset', asset: 'pallet', count: 27, multiplier: 1000 });
    expect(store.getSnapshot().selection).toMatchObject({ nodeId: 'stock' }); store.dispose();
  });
});
