import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { basicAssets, disposeObject, setAssetAnimator } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { createEcommerceSimulation } from '../src/features/ecommerce/simulation';
import { SCENARIOS } from '../src/features/ecommerce/model';

const worker = (id: string, variant: string): AssetNode => ({ id, kind: 'asset', asset: 'worker', variant, color: '#e59a32' });
describe('worker assets and animation lifecycle', () => {
  it('animates working and walking poses using an explicit visual clock', () => {
    const working = basicAssets.worker(worker('packer', 'working')); const arm = working.getObjectByName('worker-left-arm')!;
    animateAsset(working, { time: 1, delta: .016 }); const first = arm.rotation.x; animateAsset(working, { time: 2, delta: .016 }); expect(arm.rotation.x).not.toBe(first);
    const walking = basicAssets.worker(worker('shopper', 'walking')); const rig = walking.getObjectByName('worker-rig')!;
    animateAsset(walking, { time: 1, delta: .016 }); const z = rig.position.z; animateAsset(walking, { time: 2, delta: .016 }); expect(rig.position.z).not.toBe(z); disposeObject(working); disposeObject(walking);
  });
  it('removes registered animation callbacks when disposing an instance', () => {
    const object = new THREE.Group(), animator = vi.fn(); setAssetAnimator(object, animator, []); animateAsset(object, { time: 1, delta: .1 }); expect(animator).toHaveBeenCalledTimes(1);
    disposeObject(object); animateAsset(object, { time: 2, delta: .1 }); expect(animator).toHaveBeenCalledTimes(1);
  });
  it('rejects unknown worker variants and keeps role data in the host', () => {
    expect(() => basicAssets.worker({ id: 'bad', kind: 'asset', asset: 'worker', variant: 'unknown' })).toThrow('Unknown worker variant');
    // The e-commerce example draws staff as plain worker nodes; roles live only in labels and host records.
    const packers = createEcommerceSimulation('peak').nodes().filter((node): node is AssetNode => node.kind === 'asset' && node.id.startsWith('packer:'));
    expect(packers).toHaveLength(SCENARIOS.peak.crew.packing);
    for (const node of packers) { expect(node.asset).toBe('worker'); expect(node.selectable).toBe(false); }
  });
});
