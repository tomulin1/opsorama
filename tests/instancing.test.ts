import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { applyShadowPolicy, createInstanceBatcher, disposeObject, INSTANCED_BATCH_NAME, INSTANCING_MIN_COUNT, keepPartsSeparate, mergeStaticParts, setAssetAnimator } from '@opsorama/three';
import { catalogAssets } from '@opsorama/objects';

const box = (parent: THREE.Object3D, color = '#ff0000', options: { roughness?: number; transparent?: boolean; size?: number } = {}) => {
  const size = options.size ?? .5, mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? .7, transparent: options.transparent ?? false }));
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};
/** A node object as the renderer holds it: picking ids on every descendant, added to the scene. */
const nodeObject = (scene: THREE.Object3D, id: string, x: number, build: (root: THREE.Group) => void = root => { box(root); }) => {
  const root = new THREE.Group(); build(root); root.position.set(x, 0, 0); root.traverse(child => { child.userData.nodeId = id; }); scene.add(root); return root;
};
const batches = (scene: THREE.Object3D) => scene.getObjectByName(INSTANCED_BATCH_NAME)!.children as THREE.InstancedMesh[];
const meshesOf = (object: THREE.Object3D) => { const list: THREE.Mesh[] = []; object.traverse(child => { if ((child as THREE.Mesh).isMesh) list.push(child as THREE.Mesh); }); return list; };
const setup = (count: number, build?: (root: THREE.Group, i: number) => void) => {
  const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene);
  const objects = Array.from({ length: count }, (_, i) => nodeObject(scene, `n${i}`, i * 2, build && (root => build(root, i))));
  scene.updateMatrixWorld(true); objects.forEach(object => batcher.add(object)); batcher.update();
  return { scene, batcher, objects };
};

describe('instance batching', () => {
  it('draws identical meshes of different nodes as one InstancedMesh and hides the proxies', () => {
    const { scene, batcher, objects } = setup(INSTANCING_MIN_COUNT);
    const [batch] = batches(scene), proxies = objects.map(object => meshesOf(object)[0]);
    expect(batches(scene)).toHaveLength(1); expect(batch.count).toBe(INSTANCING_MIN_COUNT);
    expect(batcher.stats()).toEqual({ batches: 1, instances: INSTANCING_MIN_COUNT });
    expect(proxies.every(proxy => !proxy.visible && batcher.isProxy(proxy))).toBe(true);
    expect(batch.castShadow).toBe(true); expect(batch.receiveShadow).toBe(true); expect(batch.frustumCulled).toBe(false);
    // Instance i draws proxy i exactly: same world matrix and base color, same material otherwise.
    proxies.forEach((proxy, i) => {
      const matrix = new THREE.Matrix4(), color = new THREE.Color(); batch.getMatrixAt(i, matrix); batch.getColorAt(i, color);
      expect(matrix.elements).toEqual(proxy.matrixWorld.elements); expect(color.getHex()).toBe((proxy.material as THREE.MeshStandardMaterial).color.getHex());
    });
    expect((batch.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff); expect((batch.material as THREE.MeshStandardMaterial).roughness).toBe(.7);
    // Batches are never picked; the proxies are.
    const hits: THREE.Intersection[] = []; batch.raycast(new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0)), hits); expect(hits).toEqual([]);
  });

  it('leaves groups below the minimum as built', () => {
    const { scene, batcher, objects } = setup(INSTANCING_MIN_COUNT - 1);
    expect(batches(scene)).toHaveLength(0); expect(batcher.stats()).toEqual({ batches: 0, instances: 0 });
    expect(objects.every(object => meshesOf(object)[0].visible)).toBe(true);
  });

  it('batches meshes that differ only in color and keeps other materials, geometries and shadow flags apart', () => {
    const { scene } = setup(8, (root, i) => {
      const mesh = box(root, ['#ff0000', '#00ff00'][i % 2], { roughness: i < 4 ? .7 : .2 });
      if (i === 7) mesh.castShadow = false;
    });
    // Roughness .7 (n0–n3, two colors) is one batch; roughness .2 has three casters (n4–n6) and one non-caster, both below the minimum.
    expect(batches(scene).map(batch => batch.count)).toEqual([4]);
    const { scene: sizes } = setup(8, (root, i) => { box(root, '#ff0000', { size: i < 4 ? .5 : .6 }); });
    expect(batches(sizes).map(batch => batch.count)).toEqual([4, 4]);
  });

  it('copies moved and hidden members into the batch every update', () => {
    const { scene, batcher, objects } = setup(INSTANCING_MIN_COUNT), [batch] = batches(scene), matrix = new THREE.Matrix4();
    const version = batch.instanceMatrix.version;
    batcher.update(); expect(batch.instanceMatrix.version).toBe(version);
    objects[1].position.z = 3; scene.updateMatrixWorld(); batcher.update();
    expect(batch.instanceMatrix.version).toBe(version + 1); batch.getMatrixAt(1, matrix); expect(matrix.elements[14]).toBe(3);
    objects[2].visible = false; scene.updateMatrixWorld(); batcher.update();
    batch.getMatrixAt(2, matrix); expect(matrix.elements.slice(0, 15).every(value => value === 0)).toBe(true);
    // A member detached from the scene is not drawn either.
    objects[3].removeFromParent(); batcher.update(); batch.getMatrixAt(3, matrix); expect(matrix.elements[0]).toBe(0);
  });

  it('skips declared animated meshes, separate, transparent and mirrored parts but batches static meshes inside animated frames', () => {
    const { scene, objects } = setup(INSTANCING_MIN_COUNT, (root, i) => {
      const frame = new THREE.Group(); frame.name = 'arm'; root.add(frame); box(frame, '#123456');
      const wheel = box(root, '#222222'); setAssetAnimator(root, () => {}, [frame, wheel]);
      keepPartsSeparate(box(root, '#333333', { size: .7 }));
      box(root, '#444444', { transparent: true, size: .8 });
      if (i === 0) { const mirrored = box(root, '#555555', { size: .9 }); mirrored.scale.x = -1; }
    });
    expect(batches(scene)).toHaveLength(1);
    const color = new THREE.Color(); batches(scene)[0].getColorAt(0, color); expect(color.getHexString()).toBe('123456');
    const [arm] = objects.map(object => object.getObjectByName('arm')!.children[0] as THREE.Mesh);
    expect(arm.visible).toBe(false);
    expect(meshesOf(objects[0]).filter(mesh => mesh.visible)).toHaveLength(4);
  });

  it('skips meshes of other nodes nested in an object', () => {
    const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene), parent = nodeObject(scene, 'parent', 0, () => {});
    for (let i = 0; i < INSTANCING_MIN_COUNT; i++) parent.add(nodeObject(new THREE.Group(), `child${i}`, i));
    scene.updateMatrixWorld(true); batcher.add(parent); batcher.update();
    expect(batches(scene)).toHaveLength(0);
    parent.children.forEach(child => batcher.add(child)); batcher.update();
    expect(batches(scene)[0].count).toBe(INSTANCING_MIN_COUNT);
  });

  it('re-keys a refreshed object after its shadow flags change and releases batches that fall below the minimum', () => {
    const { scene, batcher, objects } = setup(INSTANCING_MIN_COUNT + 1), [batch] = batches(scene);
    let disposed = 0; batch.geometry.addEventListener('dispose', () => { disposed++; }); (batch.material as THREE.Material).addEventListener('dispose', () => { disposed++; });
    applyShadowPolicy(objects[0], { interior: true }); batcher.refresh(objects[0]); batcher.update();
    expect(batches(scene).map(item => item.count)).toEqual([4]); expect(meshesOf(objects[0])[0].visible).toBe(true);
    batcher.remove(objects[1]); batcher.update();
    expect(batches(scene)).toHaveLength(0); expect(disposed).toBe(2);
    expect(objects.every(object => meshesOf(object)[0].visible)).toBe(true);
  });

  it('dispose releases every batch and shows every proxy', () => {
    const { scene, batcher, objects } = setup(INSTANCING_MIN_COUNT), [batch] = batches(scene);
    let disposed = false; batch.addEventListener('dispose', () => { disposed = true; });
    batcher.dispose();
    expect(disposed).toBe(true); expect(scene.getObjectByName(INSTANCED_BATCH_NAME)).toBeUndefined();
    expect(objects.every(object => meshesOf(object)[0].visible)).toBe(true);
  });

  it('batches repeated real assets after shadow narrowing and static merging, as the renderer builds them', () => {
    const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene), objects: THREE.Object3D[] = [];
    const nodes: AssetNode[] = [...Array.from({ length: 6 }, (_, i): AssetNode => ({ id: `cabinet${i}`, kind: 'asset', asset: 'equipment-cabinet', position: [i * 1.2, 0, 0] })), ...Array.from({ length: 5 }, (_, i): AssetNode => ({ id: `worker${i}`, kind: 'asset', asset: 'worker', position: [i * 2, 0, 4] }))];
    for (const node of nodes) {
      const object = catalogAssets[node.asset](node); applyShadowPolicy(object, { interior: false }); mergeStaticParts(object);
      object.position.set(...node.position!); object.traverse(child => { child.userData.nodeId = node.id; }); scene.add(object); objects.push(object);
    }
    scene.updateMatrixWorld(true); objects.forEach(object => batcher.add(object)); batcher.update();
    const drawnBefore = objects.reduce((sum, object) => sum + meshesOf(object).length, 0), proxies = objects.reduce((sum, object) => sum + meshesOf(object).filter(mesh => batcher.isProxy(mesh)).length, 0);
    const { batches: count, instances } = batcher.stats();
    expect(instances).toBe(proxies); expect(count).toBeGreaterThan(0);
    // Draws after instancing: one per batch plus every mesh still drawn on its own.
    expect(count + drawnBefore - proxies).toBeLessThan(drawnBefore / 2);
    batcher.dispose(); objects.forEach(disposeObject);
  });
});
