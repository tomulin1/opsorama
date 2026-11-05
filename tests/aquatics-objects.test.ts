import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { resolveInteractionSlots, type AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { LAP_POOL, aquaticsDescriptors, assetInteractionSlots, assetLabelSurfaces, catalogAssets, checkAssetDescriptor, lapPoolLaneZ } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';

const build = (asset: string, options: Partial<AssetNode> = {}, context?: Parameters<typeof catalogAssets[string]>[1]) => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options }, context);
const meshes = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if (child instanceof THREE.Mesh) list.push(child); }); return list; };
const hex = (mesh: THREE.Mesh) => (mesh.material as THREE.MeshStandardMaterial).color.getHexString();
const transforms = (object: THREE.Object3D) => { const values: unknown[] = []; object.traverse(child => { values.push([child.position.toArray(), child.rotation.toArray(), child.scale.toArray()]); if (child instanceof THREE.Mesh) values.push((child.material as THREE.MeshStandardMaterial).opacity); }); return values; };
const colored = (object: THREE.Object3D, value: string) => new Set(meshes(object).filter(mesh => hex(mesh) === value).map(mesh => mesh.name));
const named = (object: THREE.Object3D, name: string) => meshes(object).filter(mesh => mesh.name === name);
const worldAnchor = (object: THREE.Object3D, name: string) => { object.updateMatrixWorld(true); return object.getObjectByName(`anchor-${name}`)!; };

const VARIANTS: Readonly<Record<string, readonly (string | undefined)[]>> = {
  'lap-pool': ['open', 'covered'], 'wading-pool': ['fountain', 'still'], swimmer: ['freestyle', 'floating'], 'starting-block': [undefined], 'lifeguard-chair': [undefined],
  'pool-ladder': [undefined], 'sun-lounger': ['reclined', 'flat'], 'deck-shower': [undefined], 'life-ring-post': [undefined], 'dosing-station': [undefined], 'sand-filter': [undefined],
};
/** Configurations with a local animator; every other configuration is static. */
const ANIMATED = new Set(['lap-pool/open', 'wading-pool/fountain', 'swimmer/freestyle', 'deck-shower/']);
/** Parts that `color` changes; every other part keeps its palette role or fixed natural material. */
const COLOR_PARTS: Readonly<Record<string, readonly string[]>> = {
  'lap-pool': ['pool-water'], 'wading-pool': ['wading-water'], swimmer: ['swimmer-cap'], 'starting-block': ['block-top'], 'lifeguard-chair': ['chair-seat', 'chair-back', 'chair-canopy'],
  'pool-ladder': ['ladder-rail'], 'sun-lounger': ['lounger-cushion'], 'deck-shower': ['shower-column', 'shower-arm', 'shower-button'], 'life-ring-post': ['ring-buoy'], 'dosing-station': ['dosing-board'], 'sand-filter': ['filter-vessel'],
};

describe('aquatics objects', () => {
  for (const [asset, variants] of Object.entries(VARIANTS)) for (const variant of variants) it(`${asset}${variant ? ` (${variant})` : ''} is grounded, finite and owns its resources`, () => {
    const options = variant ? { variant } : {}, first = build(asset, options), second = build(asset, options);
    expect(new THREE.Box3().setFromObject(first).min.y, asset).toBeCloseTo(0, 1);
    expect(meshes(first).every(mesh => [...mesh.geometry.getAttribute('position').array].every(Number.isFinite))).toBe(true);
    const before = transforms(first); animateAsset(first, { time: 1.3, delta: 1 });
    if (ANIMATED.has(`${asset}/${variant ?? ''}`)) expect(transforms(first), asset).not.toEqual(before); else expect(transforms(first), asset).toEqual(before);
    const own = new Set(meshes(first).flatMap(mesh => [mesh.geometry, mesh.material as THREE.Material]));
    expect(meshes(second).some(mesh => own.has(mesh.geometry) || own.has(mesh.material as THREE.Material))).toBe(false);
    const release = [...own].map(resource => vi.spyOn(resource as THREE.Material, 'dispose'));
    disposeObject(first); release.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); disposeObject(second);
  });

  it('passes the common object contract for every definition', () => {
    expect(Object.keys(aquaticsDescriptors).sort()).toEqual(Object.keys(VARIANTS).sort());
    for (const [asset, descriptor] of Object.entries(aquaticsDescriptors)) {
      const report = checkAssetDescriptor(descriptor, catalogAssets[asset]);
      expect(report.checks.filter(check => !check.ok), asset).toEqual([]);
      expect(descriptor.category).toBe('Aquatics');
    }
  });

  it('rejects unknown variants', () => {
    for (const asset of ['lap-pool', 'wading-pool', 'swimmer', 'sun-lounger']) expect(() => build(asset, { variant: 'unknown' }), asset).toThrow(/Unknown/);
  });

  it('applies color to the documented parts only and inherits scene palette roles elsewhere', () => {
    for (const [asset, names] of Object.entries(COLOR_PARTS)) {
      const model = build(asset, { color: '#123456' }); expect(colored(model, '123456'), asset).toEqual(new Set(names)); disposeObject(model);
      const themed = build(asset, {}, { theme: 'midnight', palette: { structure: '#abcdef', trim: '#abcdef', accent: '#abcdef', liquid: '#abcdef' } });
      expect(colored(themed, 'abcdef').size, asset).toBeGreaterThan(0); disposeObject(themed);
    }
  });

  it('keeps treatment equipment neutral and shower water explicit', () => {
    for (const [asset] of [['dosing-station', 'dosing-status'], ['sand-filter', 'filter-status']] as const) {
      const model = build(asset, { state: 'critical' }, { theme: 'light', palette: { critical: '#fedcba' } });
      expect(colored(model, 'fedcba'), asset).toEqual(new Set()); disposeObject(model);
    }
    for (const asset of ['lap-pool', 'wading-pool', 'swimmer', 'pool-ladder', 'sun-lounger', 'life-ring-post']) {
      const normal = build(asset), critical = build(asset, { state: 'critical' });
      expect(meshes(critical).map(hex), asset).toEqual(meshes(normal).map(hex)); disposeObject(normal); disposeObject(critical);
    }
    const dry = build('deck-shower', { waterRunning: false }); expect(named(dry, 'shower-water')).toHaveLength(0);
    const before = transforms(dry); animateAsset(dry, { time: 2, delta: 1 }); expect(transforms(dry)).toEqual(before); disposeObject(dry);
  });

  it('lays out six lanes with starting anchors facing along them', () => {
    const pool = build('lap-pool'); pool.updateMatrixWorld(true);
    for (let lane = 0; lane < LAP_POOL.lanes; lane++) {
      const start = worldAnchor(pool, `lane-${lane}-start`), end = worldAnchor(pool, `lane-${lane}-end`);
      expect(start.position.z).toBeCloseTo(lapPoolLaneZ(lane)); expect(end.position.z).toBeCloseTo(lapPoolLaneZ(lane));
      expect(start.position.y).toBeCloseTo(LAP_POOL.coping); expect(start.position.x).toBeLessThan(-LAP_POOL.length / 2); expect(end.position.x).toBeGreaterThan(LAP_POOL.length / 2);
      // A starting block's +z (toward the water) points along +x from the start end and −x from the far end.
      expect(new THREE.Vector3(0, 0, 1).applyQuaternion(start.quaternion).x).toBeCloseTo(1); expect(new THREE.Vector3(0, 0, 1).applyQuaternion(end.quaternion).x).toBeCloseTo(-1);
    }
    expect(lapPoolLaneZ(0)).toBeCloseTo(5); expect(lapPoolLaneZ(5)).toBeCloseTo(-5);
    for (let i = 0; i < 4; i++) {
      const ladder = worldAnchor(pool, `ladder-${i}`), inward = new THREE.Vector3(0, 0, 1).applyQuaternion(ladder.quaternion);
      expect(Math.sign(inward.z)).toBe(-Math.sign(ladder.position.z)); expect(Math.abs(ladder.position.z)).toBeCloseTo((LAP_POOL.width + LAP_POOL.side) / 2);
    }
    // Seven ropes over open water; the cover replaces them.
    expect(named(pool, 'pool-lane-rope')).toHaveLength(3); disposeObject(pool);
    const covered = build('lap-pool', { variant: 'covered' }); expect(named(covered, 'pool-lane-rope')).toHaveLength(0); expect(named(covered, 'pool-cover')).toHaveLength(1); disposeObject(covered);
  });

  it('exposes seat, stand and service anchors that follow the geometry', () => {
    const chair = build('lifeguard-chair'), seat = new THREE.Box3().setFromObject(named(chair, 'chair-seat')[0]);
    expect(worldAnchor(chair, 'seat').position.y).toBeCloseTo(seat.max.y, 1); expect(worldAnchor(chair, 'seat').position.y - .52).toBeGreaterThan(1); disposeObject(chair);
    const block = build('starting-block'), stand = worldAnchor(block, 'stand').getWorldPosition(new THREE.Vector3()); expect(stand.y).toBeGreaterThan(.7); disposeObject(block);
    const ladder = build('pool-ladder'); expect(worldAnchor(ladder, 'deck').position.z).toBeLessThan(0); disposeObject(ladder);
    const names = (asset: string) => resolveInteractionSlots({ id: asset, kind: 'asset', asset }, assetInteractionSlots[asset]).map(slot => slot.name);
    expect(names('dosing-station')).toEqual(['service']); expect(names('sand-filter')).toEqual(['service']); expect(names('deck-shower')).toEqual(['shower']);
  });

  it('places label surfaces on the matching faces and hides their placeholders', () => {
    for (const [asset, face, placeholder] of [['starting-block', 'block-plate', 'block-number'], ['life-ring-post', 'ring-post-sign', 'ring-post-mark'], ['dosing-station', 'dosing-display', 'dosing-digits']] as const) {
      const model = build(asset); model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(named(model, face)[0]), surface = assetLabelSurfaces[asset], center = new THREE.Vector3(...surface.position);
      expect(center.x, asset).toBeGreaterThan(box.min.x); expect(center.x).toBeLessThan(box.max.x); expect(center.y).toBeGreaterThan(box.min.y); expect(center.y).toBeLessThan(box.max.y);
      expect(center.z, asset).toBeGreaterThanOrEqual(box.max.z - .001); expect(surface.replaceParts).toEqual([placeholder]);
      expect(surface.size[0], asset).toBeLessThanOrEqual(box.max.x - box.min.x + .001); disposeObject(model);
    }
  });
});
