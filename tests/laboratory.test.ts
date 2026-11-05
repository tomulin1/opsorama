import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, validateNode, type AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets, LAB_PALETTES, resolveLabPalette } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';

const LABORATORY_ASSETS = ['lab-flask', 'lab-tray', 'lab-workstation'];

describe('laboratory objects', () => {
  it('records bounded geometry costs at maximum tray occupancy', () => {
    const metrics: Record<string, unknown> = {};
    for (const asset of LABORATORY_ASSETS) {
      const object = catalogAssets[asset]({ id: 'cost', kind: 'asset', asset, ...(['lab-tray', 'lab-workstation'].includes(asset) ? { count: 9 } : {}) });
      let meshes = 0, triangles = 0; object.traverse(child => { if (child instanceof THREE.Mesh) { meshes++; triangles += (child.geometry.index?.count ?? child.geometry.getAttribute('position').count) / 3; } });
      const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
      metrics[asset] = { meshes, triangles, bounds: size.toArray().map(value => Number(value.toFixed(3))) };
      expect(meshes).toBeLessThan(150); expect(triangles).toBeLessThan(12000); disposeObject(object);
    }
    console.info('Laboratory default geometry costs (maximum flask occupancy, no artwork):', JSON.stringify(metrics));
  });
  it('creates static, finite, independently owned models', () => {
    for (const asset of LABORATORY_ASSETS) {
      const node: AssetNode = { id: 'model', kind: 'asset', asset };
      const a = catalogAssets[asset](node), b = catalogAssets[asset](node);
      const bounds = new THREE.Box3().setFromObject(a); expect(bounds.min.y).toBeCloseTo(0, 2);
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      const resources = (object: THREE.Object3D) => { const set = new Set<THREE.BufferGeometry | THREE.Material>(); object.traverse(child => { if (child instanceof THREE.Mesh) { set.add(child.geometry); (Array.isArray(child.material) ? child.material : [child.material]).forEach(value => set.add(value)); } }); return set; };
      const owned = resources(a), other = resources(b), spies = [...owned].map(value => vi.spyOn(value, 'dispose'));
      expect([...owned].some(value => other.has(value))).toBe(false);
      const transforms = () => { const values: unknown[] = []; a.traverse(child => values.push(child.matrix.toArray(), child.rotation.toArray())); return values; };
      const before = transforms(); animateAsset(a, { time: 5, delta: 1 }); expect(transforms()).toEqual(before);
      disposeObject(a); expect(spies.every(spy => spy.mock.calls.length === 1)).toBe(true); disposeObject(b);
    }
  });
  it('keeps tray slots fixed at empty/partial/full counts and rejects invalid counts', () => {
    for (const asset of ['lab-tray', 'lab-workstation']) {
      let first: number[] | undefined;
      for (const count of [0, 1, 3, 6, 9]) {
        const object = catalogAssets[asset]({ id: 'tray', kind: 'asset', asset, count });
        const parts: THREE.Object3D[] = []; object.traverse(child => { if (/^count-part-\d+$/.test(child.name) && child.getObjectByName('flask-liquid')) parts.push(child); });
        expect(parts).toHaveLength(count);
        if (count) { if (first) expect(parts[0].position.toArray()).toEqual(first); first = parts[0].position.toArray(); }
        expect(object.getObjectByName(asset === 'lab-tray' ? 'anchor-load' : 'anchor-tray')).toBeDefined(); disposeObject(object);
      }
      for (const count of [-1, 10, 1.5]) expect(() => catalogAssets[asset]({ id: 'bad', kind: 'asset', asset, count })).toThrow();
    }
  });
  it('resolves and snapshots semantic theme/scene/instance colors', () => {
    const materials = { liquid: '#112233' }, palette = { surface: '#445566' };
    const node: AssetNode = { id: 'tray', kind: 'asset', asset: 'lab-tray', materials };
    const store = createSceneStore({ schemaVersion: 1, nodes: [node] }, { palette }); materials.liquid = '#000000'; palette.surface = '#000000';
    const saved = store.getSnapshot().nodes[0] as AssetNode;
    expect(saved.materials?.liquid).toBe('#112233'); expect(store.getSnapshot().settings.palette?.surface).toBe('#445566');
    const resolved = resolveLabPalette(saved, { theme: 'midnight', palette: store.getSnapshot().settings.palette });
    expect(resolved.surface).toBe('#445566'); expect(resolved.liquid).toBe('#112233'); expect(resolved.glass).toBe(LAB_PALETTES.midnight.glass);
    expect(() => store.configure({ palette: { liquid: 'red' } })).toThrow();
    expect(() => store.configure({ palette: [] as never })).toThrow();
    expect(() => createSceneStore(undefined, { palette: [] as never })).toThrow();
    expect(() => validateNode({ ...node, materials: { liquid: '#zzzzzz' } })).toThrow();
    const desk = catalogAssets['lab-workstation']({ id: 'roles', kind: 'asset', asset: 'lab-workstation', materials: { accent: '#d9b397', skin: '#123456' } });
    const body = desk.getObjectByName('desk-worker')!.getObjectByName('worker-rig')!.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
    expect(body.material.color.getHexString()).toBe('d9b397'); disposeObject(desk); store.dispose();
  });
});
