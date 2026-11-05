import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { ANIMAL_POSES, BIRD_POSES, animalDescriptors, catalogAssets, checkAssetDescriptor } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof catalogAssets[string]>[1]) => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()])); return values; };
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!.getWorldPosition(new THREE.Vector3()); };

const ANIMALS = ['cow', 'horse', 'sheep', 'pig', 'chicken', 'dog', 'cat'] as const;
/** Ground animals share ANIMAL_POSES; the bird has its own flying/perched poses. */
const POSES: Readonly<Record<string, readonly string[]>> = { ...Object.fromEntries(ANIMALS.map(asset => [asset, ANIMAL_POSES])), bird: BIRD_POSES };
const ALL = Object.keys(POSES);
const tagOf = (asset: string) => asset === 'bird' ? 'bird-band' : `${asset}-tag`;
/** Parts that `color` changes (the hair role); every other part keeps its palette role or fixed natural tone. */
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  cow: ['cow-body', 'cow-leg', 'cow-neck', 'cow-head', 'cow-tail'], horse: ['horse-body', 'horse-leg', 'horse-neck', 'horse-head', 'horse-ear'],
  sheep: ['sheep-body', 'sheep-wool', 'sheep-wool-cap', 'sheep-tail'], pig: ['pig-body', 'pig-leg', 'pig-head', 'pig-tail'],
  chicken: ['chicken-body', 'chicken-neck', 'chicken-head'], dog: ['dog-body', 'dog-leg', 'dog-paw', 'dog-neck', 'dog-head', 'dog-snout', 'dog-tail'],
  cat: ['cat-body', 'cat-leg', 'cat-head', 'cat-ear', 'cat-tail'], bird: ['bird-body', 'bird-head'],
};

describe('animal objects', () => {
  for (const [asset, poses] of Object.entries(POSES)) for (const variant of poses) it(`${asset} (${variant}) is grounded, finite and owns its resources`, () => {
    const first = build(asset, { variant }), second = build(asset, { variant }), bounds = new THREE.Box3().setFromObject(first);
    expect(bounds.min.y, asset).toBeCloseTo(0, 1); expect(bounds.min.y).toBeGreaterThan(-.02);
    expect(Math.abs(bounds.min.x + bounds.max.x) / 2, asset).toBeLessThan(.02);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    // Standing, walking, flying and perched animate in place; lying never animates.
    const before = transforms(first); animateAsset(first, { time: 1.3, delta: 1 });
    if (variant === 'lying') expect(transforms(first), asset).toEqual(before); else expect(transforms(first), asset).not.toEqual(before);
    expect(first.position.toArray()).toEqual([0, 0, 0]);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('passes the common object contract for every definition', () => {
    expect(Object.keys(animalDescriptors).sort()).toEqual([...ALL].sort());
    for (const [asset, descriptor] of Object.entries(animalDescriptors)) {
      const report = checkAssetDescriptor(descriptor, catalogAssets[asset]);
      expect(report.checks.filter(check => !check.ok), asset).toEqual([]);
      expect(descriptor.category).toBe('Animals');
    }
  });

  it('rejects unknown poses', () => {
    for (const asset of ALL) expect(() => build(asset, { variant: 'grazing' }), asset).toThrow(/Unknown/);
  });

  it('applies color to the coat only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'light', palette: { trim: '#abcdef', skin: '#abcdef', accent: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('keeps identification tags neutral and unlit for every host alert', () => {
    for (const asset of ALL) {
      const model = build(asset, { state: 'critical' }, { theme: 'light', palette: { critical: '#fedcba' } });
      expect(colored(model, 'fedcba'), asset).toEqual(new Set()); disposeObject(model);
      const inactive = build(asset, { state: 'inactive' }), tag = meshes(inactive).find(mesh => mesh.name === tagOf(asset))!;
      expect((tag.material as THREE.MeshStandardMaterial).emissive.getHex(), asset).toBe(0); disposeObject(inactive);
    }
  });

  it('lowers lying animals, keeps the head anchor in front and the label anchor above the pose', () => {
    for (const asset of ANIMALS) {
      const standing = build(asset), lying = build(asset, { variant: 'lying' });
      const height = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object).max.y;
      expect(height(lying), asset).toBeLessThan(height(standing));
      for (const model of [standing, lying]) {
        expect(worldAnchor(model, 'top').y, asset).toBeGreaterThan(height(model));
        expect(worldAnchor(model, 'head').z, asset).toBeGreaterThan(0);
      }
      // The head anchor follows the idle head turn.
      const before = worldAnchor(standing, 'head'); animateAsset(standing, { time: 3, delta: 1 }); expect(worldAnchor(standing, 'head').x, asset).not.toBeCloseTo(before.x, 3);
      disposeObject(standing); disposeObject(lying);
    }
    // The brooding hen tucks its legs away.
    const hen = build('chicken', { variant: 'lying' }); expect(meshes(hen).some(mesh => mesh.name === 'chicken-leg')).toBe(false); disposeObject(hen);
  });

  it('flies with spread, beating wings and tucked legs by default, and perches on its feet', () => {
    const flying = build('bird'), perched = build('bird', { variant: 'perched' });
    expect(flying.name).toBe('bird-flying');
    const span = (object: THREE.Object3D) => { const box = new THREE.Box3().setFromObject(object); return box.max.x - box.min.x; };
    expect(span(flying)).toBeGreaterThan(.25); expect(span(perched)).toBeLessThan(.1);
    expect(meshes(flying).some(mesh => mesh.name === 'bird-foot')).toBe(false); expect(meshes(perched).filter(mesh => mesh.name === 'bird-foot')).toHaveLength(2);
    const wing = () => flying.getObjectByName('bird-wing-pivot')!.rotation.z;
    animateAsset(flying, { time: .9, delta: .1 }); const up = wing(); animateAsset(flying, { time: .93, delta: .03 }); expect(wing()).not.toBeCloseTo(up, 3);
    for (const model of [flying, perched]) expect(worldAnchor(model, 'head').z).toBeGreaterThan(.1);
    disposeObject(flying); disposeObject(perched);
  });
});
