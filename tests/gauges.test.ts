import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { basicAssets, assetMeasurementDefinitions, disposeObject } from '@opsorama/renderer-three';
import type { AssetNode } from '@opsorama/core';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { catalogObjects, objectNode, objectSnippet } from '../apps/site/src/features/docs/objects';

const build = (asset: string, options: Partial<AssetNode> = {}) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options });
const meshes = (model: THREE.Object3D) => { const list: THREE.Mesh[] = []; model.traverse(part => { if (part instanceof THREE.Mesh) list.push(part); }); return list; };
const pose = (model: THREE.Object3D) => { const list: unknown[] = []; model.traverse(part => list.push([part.position.toArray(), part.rotation.toArray(), part.scale.toArray()])); return list; };

describe('shared measured gauges', () => {
  it('bounds procedural resources across variants at maximum band detail', () => {
    const costs: Record<string, { meshes: number; triangles: number; bufferBytes: number }> = {};
    for (const [asset, definition] of Object.entries(assetMeasurementDefinitions)) {
      const maximum = { meshes: 0, triangles: 0, bufferBytes: 0 };
      for (const variant of definition.variants) {
        const model = build(asset, { variant, measurement: { value: 100, target: 100, bands: Array.from({ length: 12 }, (_, i) => ({ from: i * 100 / 12, to: (i + 1) * 100 / 12, state: 'normal' })) } });
        const list = meshes(model), triangles = list.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3, 0);
        const bufferBytes = list.reduce((sum, mesh) => sum + Object.values(mesh.geometry.attributes).reduce((bytes, attribute) => bytes + (attribute as THREE.BufferAttribute).array.byteLength, 0) + (mesh.geometry.index?.array.byteLength ?? 0), 0);
        maximum.meshes = Math.max(maximum.meshes, list.length); maximum.triangles = Math.max(maximum.triangles, triangles); maximum.bufferBytes = Math.max(maximum.bufferBytes, bufferBytes);
        expect(list.length).toBeLessThan(100); expect(triangles).toBeLessThan(20000); expect(bufferBytes).toBeLessThan(1000000); disposeObject(model);
      }
      costs[asset] = maximum;
    }
    console.info('Gauge factory resource maxima (12 bands):', JSON.stringify(costs));
  });
  for (const [asset, definition] of Object.entries(assetMeasurementDefinitions)) it(`${asset} variants are grounded, static and own their resources`, () => {
    for (const variant of definition.variants) {
      const model = build(asset, { variant, measurement: { value: 72.5, target: 80, bands: [{ from: 0, to: 100, state: 'normal' }] } }), second = build(asset, { variant });
      const bounds = new THREE.Box3().setFromObject(model); expect(bounds.min.y, variant).toBeCloseTo(0, 5);
      expect(bounds.max.y, variant).toBeLessThan(2.6);
      expect(model.getObjectByName('anchor-front')).toBeDefined(); expect(model.getObjectByName('anchor-value')).toBeDefined();
      for (const mesh of meshes(model)) expect([...mesh.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true);
      const resources = new Set(meshes(model).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
      expect(meshes(second).some(mesh => resources.has(mesh.geometry) || resources.has(mesh.material as THREE.Material))).toBe(false);
      const before = pose(model); animateAsset(model, { time: 1, delta: 1 }); expect(pose(model)).toEqual(before);
      const release = [...resources].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(model); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
    }
  });
  it('every model distinguishes unknown and zero and shows overflow without extending its reading scale', () => {
    for (const asset of Object.keys(assetMeasurementDefinitions)) {
      const zero = build(asset, { measurement: { value: 0 } }), unknown = build(asset, { measurement: { value: null } }), over = build(asset, { measurement: { value: 125 } }), full = build(asset, { measurement: { value: 100 } });
      expect(zero.getObjectByName('gauge-unknown')).toBeUndefined(); expect(unknown.getObjectByName('gauge-unknown')).toBeDefined(); expect(over.getObjectByName('gauge-overflow')).toBeDefined();
      const names = asset === 'dial-gauge' ? ['dial-needle'] : meshes(full).filter(mesh => mesh.name.includes('fill')).map(mesh => mesh.name);
      for (const name of names) { const a = over.getObjectByName(name) as THREE.Mesh, b = full.getObjectByName(name) as THREE.Mesh; expect(new THREE.Box3().setFromObject(a).equals(new THREE.Box3().setFromObject(b))).toBe(true); }
      [zero, unknown, over, full].forEach(disposeObject);
    }
  });
  it('continuous and segmented capacities retain partial decimal fill', () => {
    for (const variant of ['vertical-continuous', 'horizontal-continuous', 'vertical-segmented', 'horizontal-segmented']) {
      const half = build('capacity-gauge', { variant, measurement: { value: 50 } }), decimal = build('capacity-gauge', { variant, measurement: { value: 52.5 } });
      const fillBounds = (model: THREE.Object3D) => { const bounds = new THREE.Box3(); meshes(model).filter(mesh => mesh.name.startsWith('gauge-fill')).forEach(mesh => bounds.expandByObject(mesh)); return bounds; };
      const a = fillBounds(half), b = fillBounds(decimal), axis = variant.startsWith('horizontal') ? 'x' : 'y';
      expect(b.max[axis]).toBeGreaterThan(a.max[axis]); [half, decimal].forEach(disposeObject);
    }
  });
  it('dial needle points left at minimum, upward at midpoint and right at maximum', () => {
    for (const [value, angle] of [[0, Math.PI], [50, Math.PI / 2], [100, 0]]) {
      const model = build('dial-gauge', { measurement: { value } }), needle = model.getObjectByName('dial-needle')!;
      expect(needle.rotation.z).toBeCloseTo(angle); disposeObject(model);
    }
  });
  it('semicircle ticks, needle, hub, bands and endpoint targets stay inside the dial face', () => {
    for (const value of [0, 25, 50, 75, 100]) for (const target of [0, 100]) {
      const model = build('dial-gauge', { variant: 'semicircle', measurement: { value, target, bands: [{ from: 0, to: 100, state: 'normal' }] } });
      model.updateMatrixWorld(true);
      const face = model.getObjectByName('dial-face')!, centerY = face.position.y;
      const marks = meshes(model).filter(mesh => ['dial-tick', 'dial-needle', 'dial-hub', 'gauge-target', 'gauge-band'].includes(mesh.name));
      for (const mesh of marks) {
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          expect(point.y, `${value}/${target}/${mesh.name}`).toBeGreaterThanOrEqual(centerY - 1e-6);
          expect(Math.hypot(point.x, point.y - centerY), mesh.name).toBeLessThanOrEqual(.85 + 1e-6);
        }
      }
      const ticks = marks.filter(mesh => mesh.name === 'dial-tick');
      expect(ticks[0].position.y).toBeCloseTo(ticks[10].position.y);
      expect(ticks[0].position.z - .025 / 2).toBeGreaterThan(.045);
      disposeObject(model);
    }
  });
  it('keeps threshold fill and target meaning independent of host alert metadata', () => {
    const reading = { value: 75, target: 25, bands: [{ from: 0, to: 100, state: 'warning' as const }] };
    const model = build('capacity-gauge', { color: '#123456', measurement: reading }), critical = build('capacity-gauge', { state: 'critical', measurement: reading });
    expect(((model.getObjectByName('gauge-fill-0') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('e8b553');
    expect(((critical.getObjectByName('gauge-fill-0') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString()).toBe('e8b553');
    expect(model.getObjectByName('gauge-target')!.position.y).toBeCloseTo(.28 + 1.9 * .25); [model, critical].forEach(disposeObject);
  });
  it('battery charge and fault glyphs are static and independent of cell count', () => {
    const busy = build('battery-indicator', { state: 'busy' }), fault = build('battery-indicator', { state: 'critical' });
    expect(busy.getObjectByName('battery-charge')).toBeDefined(); expect(fault.getObjectByName('gauge-unknown')).toBeDefined();
    [busy, fault].forEach(disposeObject);
    expect(() => build('battery-indicator', { count: 3 })).toThrow();
  });
  it('preserves legacy capacity count and explicitly rejects unsupported combinations', () => {
    for (const count of [0, 6, 10]) { const model = build('capacity-gauge', { count }); expect(model.children.filter(part => part.name.startsWith('count-part-'))).toHaveLength(count); disposeObject(model); }
    expect(() => build('capacity-gauge', { count: 6, measurement: { value: 60 } })).toThrow();
    expect(() => build('capacity-gauge', { count: 6, variant: 'vertical-continuous' })).toThrow();
    expect(() => build('parcel', { measurement: { value: 2 } })).toThrow('no measurement');
    for (const asset of Object.keys(assetMeasurementDefinitions)) expect(() => build(asset, { variant: 'unsupported' })).toThrow();
  });
  it('catalog nodes and all three snippets retain measured values and omit counted quantities', () => {
    for (const asset of Object.keys(assetMeasurementDefinitions)) {
      const item = catalogObjects.find(item => item.asset === asset)!, node = objectNode(item, { measurement: { value: 72.5, unit: '%' } });
      expect(node).toMatchObject({ measurement: { value: 72.5 } }); expect(node).not.toHaveProperty('count'); expect(node).not.toHaveProperty('label');
      for (const framework of ['React', 'Vue', 'JavaScript'] as const) expect(objectSnippet(node, framework)).toContain('72.5');
    }
  });
});
