import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';

const VEHICLES = [
  // The operator must stay below the roof or overhead guard (bottom face heights).
  { asset: 'forklift', roof: 'forklift-roof' },
  { asset: 'reach-truck', roof: 'reach-guard' },
] as const;
const build = (asset: string, options: Partial<AssetNode> = {}, palette: Record<string, string> = {}) => basicAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, { theme: 'light', palette });
const anchors = (object: THREE.Object3D) => { const names: string[] = []; object.traverse(child => { if (child.name.startsWith('anchor-')) names.push(child.name); }); return names.sort(); };
const shirt = (object: THREE.Object3D) => {
  // The torso is the first mesh of the worker rig inside the operator group.
  const rig = object.getObjectByName('vehicle-operator')!.getObjectByName('worker-rig')!;
  return ((rig.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();
};

describe('vehicle operator variants', () => {
  for (const { asset, roof } of VEHICLES) {
    it(`${asset} adds a static operator under the ${roof} without new anchors`, () => {
      const empty = build(asset), operated = build(asset, { variant: 'operated' });
      expect(build(asset, { variant: 'empty' }).getObjectByName('vehicle-operator')).toBeUndefined();
      expect(empty.getObjectByName('vehicle-operator')).toBeUndefined();
      const operator = operated.getObjectByName('vehicle-operator')!;
      expect(operator).toBeDefined();
      // The vehicle keeps exactly its own anchors; the worker's hand, carry and cart anchors are removed.
      expect(anchors(operated)).toEqual(anchors(empty));
      operated.updateMatrixWorld(true);
      const figure = new THREE.Box3().setFromObject(operator), guard = new THREE.Box3().setFromObject(operated.getObjectByName(roof)!);
      expect(figure.min.y).toBeGreaterThan(0); expect(figure.max.y).toBeLessThan(guard.min.y);
      expect(new THREE.Box3().setFromObject(operated).min.y).toBeCloseTo(0, 5);
      // Static: neither the vehicle nor its operator animates.
      const before = operated.toJSON(); animateAsset(operated, { time: 5, delta: 1 }); expect(operated.toJSON()).toEqual(before);
      disposeObject(empty); disposeObject(operated);
    });

    it(`${asset} operator wears the scene warning role, not the vehicle color, and is disposed with the vehicle`, () => {
      const standard = build(asset, { variant: 'operated' }), custom = build(asset, { variant: 'operated' }, { warning: '#abcdef' });
      expect(shirt(custom)).toBe('abcdef'); expect(shirt(standard)).not.toBe('abcdef');
      const painted = build(asset, { variant: 'operated', color: '#123456' });
      expect(shirt(painted)).toBe(shirt(standard)); expect(shirt(painted)).not.toBe('123456');
      const owned = new Set<THREE.BufferGeometry | THREE.Material>();
      painted.getObjectByName('vehicle-operator')!.traverse(child => { if (child instanceof THREE.Mesh) { owned.add(child.geometry); owned.add(child.material as THREE.Material); } });
      const release = [...owned].map(resource => vi.spyOn(resource, 'dispose'));
      disposeObject(painted); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
      disposeObject(standard); disposeObject(custom);
    });

    it(`${asset} rejects unknown variants with the valid names`, () => {
      expect(() => build(asset, { variant: 'driven' })).toThrow(/Unknown .*variant/);
    });
  }
});
