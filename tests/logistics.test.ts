import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeObject } from '@opsorama/three';
import { SHIPPING_CONTAINER, catalogAssets } from '@opsorama/objects';
import type { AssetNode, VisualState } from '@opsorama/core';
import { animateAsset } from '../packages/three/src/animation';
import { makeLogisticsStore, updateLogistics } from '../apps/site/examples/logistics-data';

const keys = ['forklift', 'loading-dock', 'shipping-container'] as const;
const build = (asset: string, options: Partial<AssetNode> = {}, theme: 'light' | 'midnight' = 'light') => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, { theme, palette: { trim: '#123456' } });
const resources = (object: THREE.Object3D) => { const result = new Set<THREE.BufferGeometry | THREE.Material>(); object.traverse(child => { if (child instanceof THREE.Mesh) { result.add(child.geometry); for (const material of Array.isArray(child.material) ? child.material : [child.material]) result.add(material); } }); return result; };
const color = (object: THREE.Object3D, name: string) => ((object.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHexString();

describe('preserved logistics objects', () => {
  it('has grounded finite geometry, local anchors/bounds, static poses and independent owned resources', () => {
    for (const asset of keys) {
      const first = build(asset), second = build(asset), bounds = new THREE.Box3().setFromObject(first);
      expect(bounds.min.y).toBeCloseTo(0, 5);
      expect(first.userData.logisticsBounds).toEqual({ min: bounds.min.toArray(), max: bounds.max.toArray() });
      for (const name of ['base', 'label', asset === 'loading-dock' ? 'approach' : 'load']) expect(first.getObjectByName(`anchor-${name}`)).toBeDefined();
      first.traverse(child => { if (child instanceof THREE.Mesh) expect([...child.geometry.getAttribute('position').array].every(Number.isFinite)).toBe(true); });
      const before = first.toJSON(); animateAsset(first, { time: 10, delta: 1 }); expect(first.toJSON()).toEqual(before);
      const owned = resources(first); expect([...resources(second)].some(resource => owned.has(resource))).toBe(false);
      const release = [...owned].map(resource => vi.spyOn(resource, 'dispose')); disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
    }
  });
  it('inherits scene roles, preserves partial overrides and keeps body styling independent of alert metadata', () => {
    for (const [asset, body, trim, status] of [['forklift', 'forklift-body', 'forklift-fork', 'forklift-status'], ['loading-dock', 'dock-frame', 'dock-bumper-cap', 'dock-status'], ['shipping-container', 'container-body', 'container-rib', 'container-status']]) {
      const light = build(asset), dark = build(asset, {}, 'midnight');
      expect(color(light, body)).not.toBe(color(dark, body)); expect(color(light, trim)).toBe('123456');
      disposeObject(light); disposeObject(dark);
      for (const state of ['normal', 'busy', 'warning', 'critical', 'inactive'] as VisualState[]) {
        const model = build(asset, { color: '#abcdef', materials: { surface: '#654321' }, state });
        expect(color(model, body)).toBe('abcdef'); expect(model.getObjectByName(status)).toBeUndefined(); disposeObject(model);
      }
      expect(() => build(asset, { materials: { trim: 'invalid' } })).toThrow();
    }
  });
  it('builds the shipping container at 20 ft ISO size, with a floor for two rows of pallets and a forklift', () => {
    const container = build('shipping-container'), size = new THREE.Box3().setFromObject(container).getSize(new THREE.Vector3()), { floor, floorTop } = SHIPPING_CONTAINER;
    expect(size.z).toBeCloseTo(6.058, 2); expect(size.x).toBeCloseTo(2.438, 2); expect(size.y).toBeCloseTo(2.591, 2);
    expect(floor.length).toBeLessThan(size.z); expect(floor.width).toBeLessThan(size.x); expect(floorTop + floor.clearHeight).toBeLessThan(size.y);
    expect(container.getObjectByName('anchor-load')!.position.y).toBeCloseTo(floorTop); expect(container.getObjectByName('anchor-entrance')!.position.z).toBeCloseTo(size.z / 2);
    const forklift = build('forklift'), fork = new THREE.Box3().setFromObject(forklift).getSize(new THREE.Vector3());
    expect(floor.clearHeight).toBeGreaterThan(fork.y); expect(floor.width).toBeGreaterThan(fork.x);
    disposeObject(container); disposeObject(forklift);
  });
  it('updates the dock pose and palette without changing identities or inventing quantities', () => {
    const store = makeLogisticsStore(); store.select('dock'); updateLogistics(store, true, true);
    const snapshot = store.getSnapshot(), dock = snapshot.nodes.find(node => node.id === 'dock')!;
    expect(dock.kind === 'asset' && dock.variant).toBe('open'); expect(snapshot.selection?.nodeId).toBe('dock'); expect(snapshot.settings.theme).toBe('midnight');
    const closed = build('loading-dock'), open = build('loading-dock', { variant: 'open' });
    expect(new THREE.Box3().setFromObject(closed).equals(new THREE.Box3().setFromObject(open))).toBe(true);
    expect(open.getObjectByName('dock-shutter')?.position.y).toBeGreaterThan(closed.getObjectByName('dock-shutter')!.position.y);
    expect(() => build('loading-dock', { variant: 'unknown' })).toThrow();
    disposeObject(closed); disposeObject(open); store.dispose();
  });
});
