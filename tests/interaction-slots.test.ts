import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createNavGraph, nodeToWorld, nodeYawToWorld, resolveInteractionSlots, resolveSceneSlots, slotNavPoints, validateInteractionSlots, type AssetNode, type InteractionSlot } from '@opsorama/core';
import { assetInteractionSlots, basicAssets, disposeObject } from '@opsorama/renderer-three';

const node = (asset: string, extra: Partial<AssetNode> = {}): AssetNode => ({ id: asset, kind: 'asset', asset, ...extra });

describe('interaction slot transforms', () => {
  it('matches Three.js world transforms for rotated and scaled nodes', () => {
    const transformed = node('station', { position: [3, .2, -1], rotation: [.3, 1.1, -.2], scale: [.7, 1.2, 1.4] });
    const object = new THREE.Object3D(); object.position.set(...transformed.position!); object.rotation.set(...transformed.rotation!); object.scale.set(...transformed.scale!); object.updateMatrixWorld(true);
    const expected = new THREE.Vector3(.4, .5, -.8).applyMatrix4(object.matrixWorld);
    nodeToWorld(transformed, [.4, .5, -.8]).forEach((value, i) => expect(value).toBeCloseTo(expected.getComponent(i), 10));
    const yawed = { rotation: [0, .8, 0] as const };
    expect(nodeYawToWorld(yawed, Math.PI)).toBeCloseTo(Math.PI + .8 - 2 * Math.PI);
  });

  it('resolves slots to world space with stable IDs and default agents', () => {
    const shelf = node('shelf-b', { asset: 'shelf', position: [-1.8, 0, -3.2], scale: [.7, 1, 1] });
    const [pick] = resolveInteractionSlots(shelf, assetInteractionSlots.shelf);
    expect(pick).toMatchObject({ id: 'shelf-b:pick-0', nodeId: 'shelf-b', group: 'pick', pose: 'working', agents: ['person'] });
    expect(pick.position[0]).toBeCloseTo(-1.8 - .75 * .7);
    expect(pick.approach[2]).toBeCloseTo(-3.2 + 1.4);
    expect(pick.yaw).toBeCloseTo(Math.PI);
    expect(resolveInteractionSlots(node('tree'), assetInteractionSlots.tree)).toEqual([]);
    const [lifted] = resolveInteractionSlots(shelf, assetInteractionSlots.shelf, { lift: .1 });
    expect(lifted.position[1]).toBeCloseTo(.1); expect(lifted.approach[1]).toBeCloseTo(.1);
    expect(() => resolveInteractionSlots(shelf, assetInteractionSlots.shelf, { lift: NaN })).toThrow('lift');
  });

  it('turns slot approaches into movement-graph points', () => {
    const slots = resolveSceneSlots([node('station', { position: [0, 0, -3] }), { kind: 'zone' }], assetInteractionSlots);
    const graph = createNavGraph({ points: [{ id: 'aisle', position: [0, 0, 0] }, ...slotNavPoints(slots)], edges: [{ from: 'aisle', to: 'station:work' }], agents: { person: { speed: 1 } } });
    const plan = graph.plan({ agent: 'person', from: 'aisle', to: 'station:work' });
    expect(plan.ok && plan.route.positions.at(-1)).toEqual(slots[0].approach);
  });

  it('rejects invalid slot definitions', () => {
    const valid: InteractionSlot = { name: 'a', approach: [0, 0, 1], position: [0, 0, 0], yaw: 0, pose: 'idle' };
    expect(() => validateInteractionSlots([valid, valid])).toThrow('Duplicate');
    expect(() => validateInteractionSlots([{ ...valid, name: 'Bad Name' }])).toThrow('name');
    expect(() => validateInteractionSlots([{ ...valid, approach: [0, NaN, 0] }])).toThrow('finite');
    expect(() => validateInteractionSlots([{ ...valid, pose: '' }])).toThrow('pose');
    expect(() => validateInteractionSlots([{ ...valid, agents: [] }])).toThrow('agent list');
  });
});

describe('model interaction slots', () => {
  const seatCases: [string, number[]][] = [['desk-pod', [1, 2, 4, 6, 8]], ['meeting-table', [2, 6, 12]], ['bench', [0]], ['focus-pod', [0]]];
  it('keeps every seat slot on its model anchor and facing', () => {
    for (const [asset, counts] of seatCases) for (const count of counts) {
      const input = node(asset, count ? { count } : {}), object = basicAssets[asset](input), slots = assetInteractionSlots[asset](input);
      const anchors = object.children.filter(child => child.name.startsWith('anchor-seat-'));
      expect(slots, `${asset}/${count}`).toHaveLength(anchors.length);
      for (const slot of slots) {
        const anchor = object.getObjectByName(`anchor-${slot.anchor}`)!;
        expect(slot.position[0]).toBeCloseTo(anchor.position.x); expect(slot.position[2]).toBeCloseTo(anchor.position.z);
        expect(Math.cos(slot.yaw - anchor.rotation.y), `${asset}/${count}/${slot.name}`).toBeCloseTo(1);
        expect(slot.pose).toBe('seated');
        // The approach lies outside the seat, away from the furniture's center along the facing axis.
        expect(Math.hypot(slot.approach[0] - slot.position[0], slot.approach[2] - slot.position[2])).toBeGreaterThan(.5);
      }
      disposeObject(object);
    }
  });

  it('places working slots in front of the model, facing it', () => {
    for (const asset of ['shelf', 'station', 'parcel-locker', 'whiteboard']) {
      const object = basicAssets[asset](node(asset)), bounds = new THREE.Box3().setFromObject(object);
      for (const slot of assetInteractionSlots[asset](node(asset))) {
        expect(slot.position[2], `${asset}/${slot.name}`).toBeGreaterThan(bounds.max.z);
        expect(slot.approach[2]).toBeGreaterThan(slot.position[2]);
        expect(Math.cos(slot.yaw)).toBeCloseTo(-1);
      }
      disposeObject(object);
    }
  });

  it('declares only valid slots for every registered source', () => {
    for (const [asset, source] of Object.entries(assetInteractionSlots)) {
      expect(basicAssets[asset], asset).toBeTypeOf('function');
      expect(() => validateInteractionSlots(source(node(asset)))).not.toThrow();
    }
  });
});
