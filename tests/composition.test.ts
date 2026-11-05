import { describe, expect, it } from 'vitest';
import { createSceneStore, projectContents, contentsLabel, type AssetNode } from '@opsorama/core';
import { disposeObject } from '@opsorama/three';
import { catalogAssets, describeComposition } from '@opsorama/objects';
import { animateAsset } from '../packages/three/src/animation';

describe('generic attachments and contents', () => {
  const person: AssetNode = { id: 'person', kind: 'asset', asset: 'worker', variant: 'pushing' };
  const cart: AssetNode = { id: 'cart', kind: 'asset', asset: 'shopping-cart', entityId: 'session', attachment: { nodeId: 'person', anchor: 'cart' }, contents: { lines: [{ id: 'line', title: 'Goods', quantity: 10000, color: '#123456' }] } };
  it('bounds geometry and discloses exact overflow without allocating source-sized arrays', () => {
    const projected = projectContents(cart.contents!, 6); expect(projected.visible).toHaveLength(6); expect(projected.overflow).toBe(9994);
    expect(contentsLabel(cart.contents!, 6)).toContain('10000 items · 6 shown +9994 in detail');
    const object = catalogAssets['shopping-cart'](cart); expect(object.children.filter(child => child.name.startsWith('count-part-'))).toHaveLength(6); disposeObject(object);
    expect(() => projectContents({ lines: [{ id: 'x', title: 'Goods', quantity: -1 }] }, 6)).toThrow();
  });
  it('freezes contents and attachment inputs, rejects mixed cycles atomically and removes attached descendants', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [person, cart] }); const copy = store.getSnapshot().nodes[1] as AssetNode;
    expect(copy.contents).not.toBe(cart.contents); expect(Object.isFrozen(copy.contents!.lines[0])).toBe(true);
    store.select('cart'); const before = store.getSnapshot(); expect(() => store.upsert({ ...person, attachment: { nodeId: 'cart' } })).toThrow('cycle'); expect(store.getSnapshot()).toBe(before);
    store.remove('person'); expect(store.getSnapshot().nodes).toHaveLength(0); expect(store.getSnapshot().selection).toBeNull(); store.dispose();
  });
  it('shows a child only while its owner exists and preserves selection across contents updates', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [cart] }); store.select('cart'); expect(store.getSnapshot().selection).toBeNull();
    store.upsert(person); store.select('cart'); store.upsert({ ...cart, contents: { lines: [] } }); expect(store.getSnapshot().selection?.entityId).toBe('session'); store.dispose();
  });
  it('inherits palette roles and provides open/static cartons, anchors and finite person actions', () => {
    const carton = catalogAssets.parcel({ id: 'box', kind: 'asset', asset: 'parcel', variant: 'open', contents: { lines: [{ id: 'x', title: 'Goods', quantity: 2 }] } }, { theme: 'midnight', palette: { surface: '#123456' } });
    expect(carton.getObjectByName('anchor-contents')).toBeTruthy(); expect(carton.getObjectByName('content-part-1')).toBeTruthy();
    const wall = carton.getObjectByName('carton-wall') as import('three').Mesh; expect((wall.material as import('three').MeshStandardMaterial).color.getHexString()).toBe('123456');
    const worker = catalogAssets.worker({ ...person, variant: 'picking' }); expect(worker.getObjectByName('anchor-hand')).toBeTruthy(); expect(worker.getObjectByName('anchor-cart')).toBeTruthy();
    animateAsset(worker, { time: .4, delta: .4 }); const first = worker.getObjectByName('worker-right-arm')!.rotation.x; animateAsset(worker, { time: 2, delta: 2 }); const settled = worker.getObjectByName('worker-right-arm')!.rotation.x; expect(first).not.toBe(settled); animateAsset(worker, { time: 5, delta: 3 }); expect(worker.getObjectByName('worker-right-arm')!.rotation.x).toBe(settled); disposeObject(worker); disposeObject(carton);
    const staticWorker = catalogAssets.worker({ ...person, variant: 'working', localMotion: false }), arm = staticWorker.getObjectByName('worker-right-arm')!;
    const pose = arm.rotation.x; animateAsset(staticWorker, { time: 10, delta: 10 }); expect(arm.rotation.x).toBe(pose); disposeObject(staticWorker);
  });
  it('describes actual local bounds and anchors without retaining instance resources', () => {
    for (const node of [person, cart, { id: 'box', kind: 'asset' as const, asset: 'parcel', variant: 'open' }]) {
      const descriptor = describeComposition(node)!; expect(descriptor.ownership).toBe('instance'); expect(descriptor.bounds.min.every(Number.isFinite)).toBe(true);
      expect(descriptor.bounds.max.every((value, index) => value > descriptor.bounds.min[index])).toBe(true);
      expect(descriptor.anchors.length).toBeGreaterThan(0); expect(descriptor.paletteRoles.length).toBeGreaterThan(0);
    }
    expect(describeComposition({ id: 'tree', kind: 'asset', asset: 'tree' })).toBeNull();
  });
});
