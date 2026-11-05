import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FORK_LIMITS, createBehaviorRunner, createNavGraph, createSceneStore, finalForkPose, forkMoveSeconds, forkPoseAt, routeDuration, sampleRoute, validateForkMotion, type AssetNode, type ForkMotion, type NodeRoute, type ResolvedSlot } from '@opsorama/core';
import { assetDescriptors, assetHandling, basicAssets, checkAssetHandling, disposeObject, hasAssetAnimator } from '@opsorama/renderer-three';
import { animateAsset } from '../packages/renderer-three/src/animation';
import { RACK_LEVELS, RACK_PLACES, ecommerceSlots } from '../apps/site/src/features/ecommerce/scene';

const build = (asset: string, forks?: ForkMotion, extra: Partial<AssetNode> = {}) => { const object = basicAssets[asset]({ id: asset, kind: 'asset', asset, ...(forks ? { forks } : {}), ...extra }); object.updateMatrixWorld(true); return object; };
const loadAnchor = (object: THREE.Object3D) => object.getObjectByName('anchor-load')!.getWorldPosition(new THREE.Vector3());

describe('fork motion', () => {
  const motion: ForkMotion = { height: 0, moves: [{ height: 2, seconds: 2 }, { height: 2, reach: 1, seconds: 1 }] };

  it('eases through the moves and ends at the confirmed pose', () => {
    expect(forkPoseAt(motion, 0)).toEqual({ height: 0, reach: 0 });
    expect(forkPoseAt(motion, 1).height).toBeCloseTo(1);
    expect(forkPoseAt(motion, 2)).toEqual({ height: 2, reach: 0 });
    expect(forkPoseAt(motion, 2.5).reach).toBeCloseTo(.5);
    expect(forkPoseAt(motion, 99)).toEqual(finalForkPose(motion));
    expect(finalForkPose({ height: 1 })).toEqual({ height: 1, reach: 0 });
    expect(forkMoveSeconds(motion.moves!)).toBe(3);
  });

  it('rejects other assets, poses outside the limits and bad durations, naming the fix', () => {
    expect(() => validateForkMotion('pallet', { height: 0 })).toThrow('supported only by forklift, reach-truck');
    expect(() => validateForkMotion('reach-truck', { height: FORK_LIMITS['reach-truck'].maxHeight + 1 })).toThrow('height of reach-truck must be from');
    expect(() => validateForkMotion('forklift', { height: 0, reach: .5 })).toThrow('reach of forklift must be from 0 to 0');
    expect(() => validateForkMotion('reach-truck', { height: 0, moves: [{ height: 1, seconds: 0 }] })).toThrow('seconds must be greater than 0');
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [{ id: 'p', kind: 'asset', asset: 'pallet', forks: { height: 0 } }] })).toThrow('forks is supported only');
  });

  it('freezes the motion in the store', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 't', kind: 'asset', asset: 'reach-truck', forks: motion }] }), node = store.getSnapshot().nodes[0] as AssetNode;
    expect(Object.isFrozen(node.forks)).toBe(true); expect(Object.isFrozen(node.forks!.moves![0])).toBe(true);
    store.dispose();
  });

  it('moves the load anchor with the forks on both trucks, and stays static without moves', () => {
    for (const asset of ['forklift', 'reach-truck']) {
      const low = build(asset), raised = build(asset, { height: 1 });
      expect(loadAnchor(raised).y - loadAnchor(low).y).toBeCloseTo(1);
      expect(hasAssetAnimator(raised)).toBe(false);
      disposeObject(low); disposeObject(raised);
    }
    const out = build('reach-truck', { height: 0, reach: 1 }), home = build('reach-truck');
    expect(loadAnchor(out).z - loadAnchor(home).z).toBeCloseTo(1);
    disposeObject(out); disposeObject(home);
  });

  it('builds at the confirmed pose and runs the moves on the visual clock', () => {
    const truck = build('reach-truck', motion), final = loadAnchor(truck).clone();
    expect(hasAssetAnimator(truck)).toBe(true);
    expect(final.z).toBeCloseTo(1.9);
    animateAsset(truck, { time: 0, delta: 0 }); truck.updateMatrixWorld(true);
    expect(loadAnchor(truck).y).toBeCloseTo(.23); expect(loadAnchor(truck).z).toBeCloseTo(.9);
    animateAsset(truck, { time: 3, delta: 3 }); truck.updateMatrixWorld(true);
    expect(loadAnchor(truck).distanceTo(final)).toBeLessThan(1e-6);
    disposeObject(truck);
    const off = build('reach-truck', motion, { localMotion: false });
    expect(hasAssetAnimator(off)).toBe(false); disposeObject(off);
  });

  it('keeps the handling contract and the unanimated catalog class of both trucks', () => {
    for (const asset of ['forklift', 'reach-truck']) {
      expect(checkAssetHandling(asset, assetHandling[asset], basicAssets[asset]).ok, asset).toBe(true);
      expect(assetDescriptors[asset].motion.animation).toBe('none');
    }
  });

  it('reaches a reach truck exactly onto every rack position', () => {
    for (const id of ['R01', 'R07', 'R08', 'R14']) {
      const rack = build('pallet-rack'), place = RACK_PLACES[id];
      rack.position.set(...place.position); rack.updateMatrixWorld(true);
      for (const [level, y] of RACK_LEVELS.entries()) for (const side of [0, 1]) {
        const slot = ecommerceSlots.find(item => item.id === `rack:${id}:load-${side}`)!;
        const position = rack.localToWorld(rack.getObjectByName(`anchor-slot-${level * 2 + side}`)!.position.clone().add(new THREE.Vector3(0, 0, -.55)));
        const truck = build('reach-truck', { height: y - .23, reach: 1 }); truck.position.set(...slot.position); truck.rotation.y = slot.yaw; truck.updateMatrixWorld(true);
        expect(loadAnchor(truck).distanceTo(position), `${id} level ${level} side ${side}`).toBeLessThan(1e-6);
        disposeObject(truck);
      }
      disposeObject(rack);
    }
  });
});

describe('driving in reverse', () => {
  const route: NodeRoute = { points: [[0, 0, 0], [0, 0, 2], [3, 0, 2]], speed: 1, reverseSegments: 1, startYaw: Math.PI, profile: { acceleration: 1, turnRate: 2, turnInPlaceAngle: Math.PI / 3 } };

  it('keeps the heading along reversed segments, then stops and turns', () => {
    expect(sampleRoute(route, .1).turning).toBeUndefined();
    const backing = sampleRoute(route, 1);
    expect(backing.moving).toBe(true); expect(Math.abs(Math.sin(backing.yaw))).toBeLessThan(1e-6); expect(Math.cos(backing.yaw)).toBeCloseTo(-1); expect(backing.position[2]).toBeGreaterThan(0);
    const forward = { ...route, reverseSegments: undefined };
    expect(sampleRoute(forward, .1).turning).toBe(true);
    expect(routeDuration(route)).toBeLessThan(routeDuration(forward) + Math.PI);
    expect(sampleRoute(route, Infinity).position).toEqual([3, 0, 2]);
  });

  it('validates the count and refuses loops', () => {
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [{ id: 't', kind: 'asset', asset: 'forklift', route: { ...route, reverseSegments: 9 } }] })).toThrow('reverse segments');
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [{ id: 't', kind: 'asset', asset: 'forklift', route: { points: [[0, 0, 0], [1, 0, 0], [0, 0, 0]], speed: 1, loop: true, reverseSegments: 1 } }] })).toThrow('cannot drive in reverse');
  });

  it('backs an agent with backOut out of a slot along its approach', () => {
    const graph = createNavGraph({ points: [{ id: 'aisle', position: [0, 0, 0] }, { id: 'away', position: [5, 0, 0] }, { id: 'rack:load', position: [0, 0, 1] }], edges: [{ from: 'aisle', to: 'away' }, { from: 'aisle', to: 'rack:load' }], agents: { truck: { speed: 1, acceleration: 1, turnRate: 2, turnInPlaceAngle: Math.PI / 3 } } });
    const slots: ResolvedSlot[] = [{ id: 'rack:load', nodeId: 'rack', name: 'load', group: 'load', pose: 'idle', agents: ['truck'], approach: [0, 0, 1], position: [0, 0, 2], yaw: 0 }];
    const runner = createBehaviorRunner({ graph, slots, agents: [{ id: 't', agent: 'truck', start: 'aisle', backOut: true, steps: [{ kind: 'interact', node: 'rack', seconds: 1 }, { kind: 'move', to: 'away' }] }] });
    runner.advance(8);
    const leaving = runner.getAgent('t')!;
    expect(leaving.route?.reverseSegments).toBe(1);
    expect(leaving.route?.points[0]).toEqual([0, 0, 2]);
    runner.advance(30);
    expect(runner.getAgent('t')?.position).toEqual([5, 0, 0]);
    runner.dispose();
  });
});
