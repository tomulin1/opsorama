import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { CROP_FIELD, CROP_STAGES, PADDOCK_FENCE, basicAssets, checkAssetDescriptor, disposeObject, farmDescriptors } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof basicAssets[string]>[1]) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const named = (object: THREE.Object3D, name: string) => meshes(object).filter(mesh => mesh.name === name);
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!.getWorldPosition(new THREE.Vector3()); };
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray()])); return values; };

const VARIANTS: Readonly<Record<string, readonly string[]>> = {
  barn: ['closed', 'open'], 'paddock-fence': ['rail', 'gate', 'gate-open'], 'hay-bale': ['round', 'square'], trough: ['water', 'feed'], 'chicken-coop': ['open', 'closed'], 'crop-field': CROP_STAGES,
};
/** Parts that `color` changes; every other part keeps its palette role or fixed natural tone. */
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  barn: ['barn-wall', 'barn-loft-door', 'barn-door'], 'paddock-fence': ['fence-post', 'fence-rail'], 'hay-bale': ['bale-hay'], trough: ['trough-tank'], 'chicken-coop': ['coop-house', 'coop-gable', 'coop-nest-box'], 'crop-field': ['field-crop'],
};

describe('farm objects', () => {
  for (const [asset, variants] of Object.entries(VARIANTS)) for (const variant of variants) it(`${asset} (${variant}) is grounded, finite, static and owns its resources`, () => {
    const first = build(asset, { variant }), second = build(asset, { variant }), bounds = new THREE.Box3().setFromObject(first);
    expect(bounds.min.y, asset).toBeCloseTo(0, 1);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = transforms(first); animateAsset(first, { time: 2, delta: 1 }); expect(transforms(first)).toEqual(before);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('passes the common object contract for every definition', () => {
    expect(Object.keys(farmDescriptors).sort()).toEqual(Object.keys(VARIANTS).sort());
    for (const [asset, descriptor] of Object.entries(farmDescriptors)) {
      const report = checkAssetDescriptor(descriptor, basicAssets[asset]);
      expect(report.checks.filter(check => !check.ok), asset).toEqual([]);
      expect(descriptor.category).toBe('Farm');
    }
  });

  it('rejects unknown variants and out-of-range field footprints', () => {
    for (const asset of Object.keys(VARIANTS)) expect(() => build(asset, { variant: 'unknown' }), asset).toThrow(/Unknown/);
    expect(() => build('crop-field', { footprint: [2, 10] })).toThrow(/Footprint must be 4–60 m/);
    expect(() => build('crop-field', { footprint: [61, 10] })).toThrow(/Footprint/);
  });

  it('applies color to the documented parts only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'light', palette: { structure: '#abcdef', trim: '#abcdef', surface: '#abcdef', wood: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('keeps trough alerts neutral and uses explicit fillLevel for contents', () => {
    for (const variant of ['water', 'feed']) {
      const model = build('trough', { variant, state: 'critical' }, { theme: 'light', palette: { critical: '#fedcba' } });
      expect(colored(model, 'fedcba'), variant).toEqual(new Set()); disposeObject(model);
      const empty = build('trough', { variant, fillLevel: 0 });
      expect(named(empty, variant === 'water' ? 'trough-water' : 'trough-feed'), variant).toHaveLength(0);
      expect(named(empty, 'trough-status')).toHaveLength(0); disposeObject(empty);
    }
    for (const asset of ['barn', 'paddock-fence', 'hay-bale', 'chicken-coop', 'crop-field']) {
      const normal = build(asset), critical = build(asset, { state: 'critical' });
      expect(meshes(critical).map(hex), asset).toEqual(meshes(normal).map(hex)); disposeObject(normal); disposeObject(critical);
    }
  });

  it('chains fence segments end to start and swings an open gate inward', () => {
    const fence = build('paddock-fence'), start = worldAnchor(fence, 'start'), end = worldAnchor(fence, 'end');
    expect(end.x - start.x).toBeCloseTo(PADDOCK_FENCE.span); expect(start.z).toBeCloseTo(0); disposeObject(fence);
    const open = build('paddock-fence', { variant: 'gate-open' }), box = new THREE.Box3().setFromObject(open.getObjectByName('fence-gate')!);
    expect(box.max.z).toBeGreaterThan(PADDOCK_FENCE.gate - .1); expect(worldAnchor(open, 'opening').x).toBeCloseTo(0); disposeObject(open);
  });

  it('opens the barn and coop doors and keeps their entrance anchors in front', () => {
    const closed = build('barn'), open = build('barn', { variant: 'open' });
    expect(named(closed, 'barn-interior')).toHaveLength(0); expect(named(open, 'barn-interior')).toHaveLength(1);
    expect(worldAnchor(open, 'door').z).toBeGreaterThan(new THREE.Box3().setFromObject(open.getObjectByName('barn-doors')!).max.z - .1);
    disposeObject(closed); disposeObject(open);
    const coop = build('chicken-coop'), entrance = worldAnchor(coop, 'entrance'), ramp = new THREE.Box3().setFromObject(named(coop, 'coop-ramp')[0]);
    expect(entrance.z).toBeGreaterThan(ramp.max.z - .05); expect(ramp.min.y).toBeLessThan(.05); disposeObject(coop);
  });

  it('adds crop rows with the footprint instead of stretching them', () => {
    const rows = (footprint: readonly [number, number]) => { const field = build('crop-field', { footprint }), furrows = named(field, 'field-furrow')[0], count = furrows.geometry.getAttribute('position').count; disposeObject(field); return count; };
    expect(rows([16, 20])).toBeGreaterThan(rows([16, 10]) * 1.8);
    const field = build('crop-field', { footprint: [30, 12] }), box = new THREE.Box3().setFromObject(field);
    expect(box.max.x - box.min.x).toBeCloseTo(30, 1); expect(box.max.z - box.min.z).toBeCloseTo(12, 1);
    expect(Math.floor((12 - .5) / CROP_FIELD.rowSpacing)).toBe(15); disposeObject(field);
    // Plowed has no plants; ripe grain is taller than growing plants.
    const plowed = build('crop-field', { variant: 'plowed' }), ripe = build('crop-field', { variant: 'ripe' }), growing = build('crop-field');
    expect(named(plowed, 'field-crop')).toHaveLength(0);
    expect(new THREE.Box3().setFromObject(ripe).max.y).toBeGreaterThan(new THREE.Box3().setFromObject(growing).max.y);
    expect(growing.name).toBe('crop-field-growing');
    [plowed, ripe, growing].forEach(disposeObject);
  });
});
