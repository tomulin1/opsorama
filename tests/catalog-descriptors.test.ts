import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { validateNode, validateObjectDescriptor, type AssetNode, type NodeSample } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { assetCountDefinitions, assetDescriptors, assetDisplayDefinitions, assetFootprintDefinitions, assetLabelSurfaces, assetMeasurementDefinitions, catalogAssets, checkAssetDescriptor } from '@opsorama/objects';
import { catalogObjects, objectNode, objectSnippet } from '../apps/site/src/features/docs/objects';

const build = (asset: string, sample: NodeSample = {}) => catalogAssets[asset]({ id: 'contract', kind: 'asset', asset, ...sample } as AssetNode);

describe('complete catalog descriptors', () => {
  it('requires one serializable contract for every factory and every portable catalog page', () => {
    expect(Object.keys(assetDescriptors).sort()).toEqual(Object.keys(catalogAssets).sort());
    expect(Object.keys(assetDescriptors).sort()).toEqual(catalogObjects.flatMap(item => item.asset ? [item.asset] : []).sort());
    for (const [asset, descriptor] of Object.entries(assetDescriptors)) {
      expect(descriptor.asset).toBe(asset);
      expect(() => validateObjectDescriptor(descriptor), asset).not.toThrow();
      expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
      for (const [registry, field] of [[assetCountDefinitions, 'count'], [assetDisplayDefinitions, 'display'], [assetFootprintDefinitions, 'footprint'], [assetLabelSurfaces, 'surfaceLabel'], [assetMeasurementDefinitions, 'measurement']] as const) {
        expect(descriptor.customization.some(option => option.field === field), `${asset}.${field}`).toBe(Object.hasOwn(registry, asset));
      }
    }
  });

  it('keeps every declared configuration finite with unique, declared anchors', () => {
    for (const [asset, descriptor] of Object.entries(assetDescriptors)) {
      const samples = descriptor.customization.flatMap(option => option.samples ?? []);
      for (const sample of samples) {
        const node: AssetNode = { id: 'sample', kind: 'asset', asset, ...sample };
        expect(() => validateNode(node), `${asset} ${JSON.stringify(sample)}`).not.toThrow();
        const object = build(asset, sample);
        try {
          const names: string[] = [], declared = descriptor.interaction.anchors.map(anchor => anchor.name);
          object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name.slice(7)); });
          expect(new Set(names).size, `${asset} ${JSON.stringify(sample)}`).toBe(names.length);
          expect(names.filter(name => !declared.includes(name)), `${asset} ${JSON.stringify(sample)}`).toEqual([]);
          const bounds = new THREE.Box3().setFromObject(object);
          expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite), asset).toBe(true);
        } finally { disposeObject(object); }
      }
    }
  }, 30000);

  it('documents preserved origins and rejects missing placement explanations', () => {
    for (const asset of ['forklift', 'security-camera', 'terrain']) expect(assetDescriptors[asset].geometry.pivot).toBe('model-origin');
    const descriptor = assetDescriptors.forklift;
    expect(() => validateObjectDescriptor({ ...descriptor, geometry: { ...descriptor.geometry, note: '' } })).toThrow('model-origin needs a note');
    const offsetRoot = (node: AssetNode) => { const object = catalogAssets.forklift(node); object.position.y = 1; return object; };
    expect(checkAssetDescriptor(descriptor, offsetRoot).checks.filter(check => !check.ok).map(check => check.name)).toContain('pivot preserves the model origin');
  });

  it('preserves both laboratory legacy color mappings with independent material overrides', () => {
    expect(assetDescriptors['lab-workstation'].palette.colorRole).toEqual(['accent', 'liquid']);
    const palette = assetDescriptors['lab-workstation'].palette;
    expect(() => validateObjectDescriptor({ ...assetDescriptors['lab-workstation'], palette: { ...palette, colorRole: ['accent', 'accent'] } })).toThrow('colorRole');
    const object = build('lab-workstation', { color: '#13579b', materials: { liquid: '#2468ac' } });
    try {
      const liquid = object.getObjectByName('flask-liquid') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const seat = object.getObjectByName('chair-seat') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      expect(liquid.material.color.getHexString()).toBe('2468ac');
      expect(seat.material.color.getHexString()).toBe('13579b');
    } finally { disposeObject(object); }
  });

  it('exports matching asset identity and material inputs for JS, React and native Vue', () => {
    for (const item of catalogObjects.filter(item => item.asset)) {
      const node = objectNode(item, { materials: { surface: '#2468ac' } });
      for (const framework of ['React', 'Vue', 'JavaScript'] as const) {
        const snippet = objectSnippet(node, framework);
        expect(snippet, `${item.asset}/${framework}`).toContain(item.asset);
        expect(snippet).toContain('2468ac');
      }
    }
  });
});
