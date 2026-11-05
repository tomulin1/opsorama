import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { basicAssets, disposeObject } from '@opsorama/renderer-three';
import type { AssetNode } from '@opsorama/core';
import { animateAsset } from '../packages/renderer-three/src/animation';

describe('static tree assets', () => {
  for (const asset of ['tree-pine', 'tree-palm']) it(`${asset} has independent resources, foliage customization and a ground pivot`, () => {
    const node: AssetNode = { id: 'tree', kind: 'asset', asset, color: '#336699' };
    const first = basicAssets[asset](node), second = basicAssets[asset](node);
    const meshes: THREE.Mesh[] = []; first.traverse(child => { if (child instanceof THREE.Mesh) meshes.push(child); });
    const foliage = meshes.filter(part => part.name.startsWith('foliage-') || part.name === 'crown');
    expect(foliage.length).toBe(asset === 'tree-pine' ? 3 : 8);
    expect(foliage.every(part => (part.material as THREE.MeshStandardMaterial).color.getHexString() === '336699')).toBe(true);
    expect(meshes.find(part => part.name.startsWith('trunk'))?.material).not.toBe(second.children[0] && (second.children[0] as THREE.Mesh).material);
    const bounds = new THREE.Box3().setFromObject(first); expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.y).toBeGreaterThan(2.4); expect(bounds.max.y).toBeLessThan(2.7);
    expect(meshes.every(part => [...part.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = meshes.map(part => [part.position.toArray(), part.rotation.toArray(), part.scale.toArray()]);
    animateAsset(first, { time: 10, delta: 1 });
    expect(meshes.map(part => [part.position.toArray(), part.rotation.toArray(), part.scale.toArray()])).toEqual(before);
    const release = meshes.map(part => ({ geometry: vi.spyOn(part.geometry, 'dispose'), material: vi.spyOn(part.material as THREE.Material, 'dispose') }));
    disposeObject(first); release.forEach(part => { expect(part.geometry).toHaveBeenCalledTimes(1); expect(part.material).toHaveBeenCalledTimes(1); });
    disposeObject(second);
  });
});
