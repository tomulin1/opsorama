import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, type SceneNode } from '@opsorama/core';
import { createInstanceBatcher, INSTANCED_BATCH_NAME } from '../packages/three/src/instancing';
import { createLabelGrid, LABEL_STEP, labelPriority, labelsCollide, placeLabel, type LabelRect } from '../packages/three/src/labels';
import { createNodeSignatureCache, nodeSignature } from '../packages/three/src/node-signature';
import { createCameraWatch, createPointerQueue, isRestingHover, pointerFrameWork, type PointerSample } from '../packages/three/src/pointer-frame';
import { detachChildNodes } from '../packages/three/src/scene-build';

/*
 * The pure parts behind the renderer's performance work: what a store change, a hover, a theme change and a pointer move
 * cost. The renderer itself needs WebGL; its counters (`getDiagnostics().work`) are checked in the
 * browser by apps/site/e2e/renderer-performance.spec.ts.
 */

const crates = (count: number): SceneNode[] => Array.from({ length: count }, (_, index) => ({ id: `crate-${index}`, kind: 'asset', asset: 'crate', position: [index % 50, 0, Math.floor(index / 50)] }));

describe('node signatures', () => {
  it('ignore position and route and include the theme and palette only for kinds drawn with them', () => {
    const asset: SceneNode = { id: 'a', kind: 'asset', asset: 'crate', position: [1, 0, 0] };
    expect(nodeSignature(asset, 'light', '')).toBe(nodeSignature({ ...asset, position: [9, 0, 9] }, 'light', ''));
    expect(nodeSignature(asset, 'light', '')).not.toBe(nodeSignature(asset, 'midnight', ''));
    expect(nodeSignature(asset, 'light', '')).not.toBe(nodeSignature(asset, 'light', '{"accent":"#fff"}'));
    const zone: SceneNode = { id: 'z', kind: 'zone', size: [4, 4] };
    expect(nodeSignature(zone, 'light', '')).toBe(nodeSignature(zone, 'midnight', '{"accent":"#fff"}'));
    const marker: SceneNode = { id: 'm', kind: 'marker', label: 'Alert' };
    expect(nodeSignature(marker, 'light', '')).toBe(nodeSignature(marker, 'midnight', ''));
    expect(nodeSignature(marker, 'light', '')).not.toBe(nodeSignature(marker, 'light', '{"accent":"#fff"}'));
  });

  it('are computed once per node object: selection, zoom and an equal palette compute none, an upsert only the changed node', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: crates(5000) }, { palette: { accent: '#3366ff' } });
    const cache = createNodeSignatureCache(), signAll = () => { const { settings, nodes } = store.getSnapshot(); cache.present(settings.theme, settings.palette); nodes.forEach(node => cache.get(node)); };
    signAll(); expect(cache.computed).toBe(5000);
    const before = store.getSnapshot().nodes;
    store.select('crate-7'); store.configure({ zoom: 1.4 }); store.configure({ palette: { accent: '#3366ff' } });
    // The node list keeps its identity, so the renderer skips the node loop entirely; signing again costs nothing.
    expect(store.getSnapshot().nodes).toBe(before);
    signAll(); expect(cache.computed).toBe(5000);
    store.upsert({ ...store.getSnapshot().nodes[10], position: [3, 0, 3] } as SceneNode);
    signAll(); expect(cache.computed).toBe(5001);
  });

  it('are computed again for every node after a theme or palette change', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: crates(300) });
    const cache = createNodeSignatureCache(), signAll = () => { const { settings, nodes } = store.getSnapshot(); const changed = cache.present(settings.theme, settings.palette); nodes.forEach(node => cache.get(node)); return changed; };
    expect(signAll()).toBe(true); expect(cache.computed).toBe(300);
    const light = cache.get(store.getSnapshot().nodes[0]);
    store.configure({ theme: 'midnight' }); expect(signAll()).toBe(true); expect(cache.computed).toBe(600);
    expect(cache.get(store.getSnapshot().nodes[0])).not.toBe(light);
    store.configure({ palette: { accent: '#ff0000' } }); expect(signAll()).toBe(true); expect(cache.computed).toBe(900);
    store.configure({ grid: false }); expect(signAll()).toBe(false); expect(cache.computed).toBe(900);
  });
});

describe('cleaning a node object', () => {
  const nodeObject = (id: string, children = 0) => {
    const root = new THREE.Group();
    for (let index = 0; index < children; index++) root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    root.traverse(object => { object.userData.nodeId = id; });
    return root;
  };

  it('detaches only the roots of other nodes and never walks into them', () => {
    const owner = nodeObject('rack', 3), anchor = new THREE.Group(); anchor.userData.nodeId = 'rack'; anchor.name = 'anchor-top'; owner.add(anchor);
    const child = nodeObject('server', 2), carried = nodeObject('box', 1), grandchild = nodeObject('disk', 1);
    owner.add(child); anchor.add(carried); child.add(grandchild);
    const visited = vi.spyOn(grandchild, 'children', 'get');
    expect(new Set(detachChildNodes(owner))).toEqual(new Set([child, carried]));
    expect(child.parent).toBeNull(); expect(carried.parent).toBeNull();
    // The child keeps its own children; they belong to its entry.
    expect(grandchild.parent).toBe(child);
    expect(visited).not.toHaveBeenCalled();
    expect(owner.children).toHaveLength(4);
  });

  it('is linear in the size of the owner, not in the number of nodes', () => {
    // 2000 child nodes under one container: the walk visits each child root once.
    const container = nodeObject('hall'), children = Array.from({ length: 2000 }, (_, index) => nodeObject(`desk-${index}`, 1));
    children.forEach(child => container.add(child));
    const reads = children.map(child => vi.spyOn(child, 'children', 'get'));
    expect(detachChildNodes(container)).toHaveLength(2000);
    expect(reads.every(read => read.mock.calls.length === 0)).toBe(true);
  });
});

describe('instance batching removal', () => {
  const setup = (count: number) => {
    const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene), geometry = new THREE.BoxGeometry(.5, .5, .5);
    const objects = Array.from({ length: count }, (_, index) => {
      const root = new THREE.Group(), mesh = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial({ color: index % 2 ? '#ff0000' : '#00ff00' }));
      root.add(mesh); root.position.set(index * 2, 0, 0); root.traverse(child => { child.userData.nodeId = `n${index}`; }); scene.add(root); return root;
    });
    scene.updateMatrixWorld(true); objects.forEach(object => batcher.add(object)); batcher.update();
    return { scene, batcher, objects };
  };
  const batch = (scene: THREE.Scene) => scene.getObjectByName(INSTANCED_BATCH_NAME)!.children[0] as THREE.InstancedMesh;

  it('swaps the last member into a removed slot and still draws every remaining proxy exactly', () => {
    const { scene, batcher, objects } = setup(9);
    for (const index of [0, 4, 8]) batcher.remove(objects[index]);
    batcher.update();
    const mesh = batch(scene), remaining = objects.filter((_, index) => ![0, 4, 8].includes(index)).map(object => object.children[0] as THREE.Mesh);
    expect(mesh.count).toBe(6); expect(batcher.stats()).toEqual({ batches: 1, instances: 6 });
    const drawn = Array.from({ length: mesh.count }, (_, index) => { const matrix = new THREE.Matrix4(), color = new THREE.Color(); mesh.getMatrixAt(index, matrix); mesh.getColorAt(index, color); return `${matrix.elements[12]}|${color.getHex()}`; });
    expect(drawn.sort()).toEqual(remaining.map(proxy => `${proxy.matrixWorld.elements[12]}|${(proxy.material as THREE.MeshStandardMaterial).color.getHex()}`).sort());
    expect(remaining.every(proxy => !proxy.visible && batcher.isProxy(proxy))).toBe(true);
    expect((objects[4].children[0] as THREE.Mesh).visible).toBe(true);
  });

  it('removes thousands of members in any order and releases the batch with the last', () => {
    const { scene, batcher, objects } = setup(3000);
    const order = objects.map((object, index) => ({ object, key: (index * 7919) % 3000 })).sort((a, b) => a.key - b.key).map(item => item.object);
    for (const object of order.slice(0, 2990)) batcher.remove(object);
    batcher.update(); expect(batch(scene).count).toBe(10);
    for (const object of order.slice(2990)) batcher.remove(object);
    batcher.update(); expect(batcher.stats()).toEqual({ batches: 0, instances: 0 });
    expect(scene.getObjectByName(INSTANCED_BATCH_NAME)!.children).toHaveLength(0);
  });
});

describe('label placement', () => {
  it('orders markers, the selection, critical, warning and zones before other labels', () => {
    const order = [labelPriority({ kind: 'marker' }, false), labelPriority({ kind: 'asset' }, true), labelPriority({ kind: 'asset', state: 'critical' }, false), labelPriority({ kind: 'asset', state: 'warning' }, false), labelPriority({ kind: 'zone' }, false), labelPriority({ kind: 'asset' }, false)];
    expect([...order].sort((a, b) => b - a)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });

  it('finds the same collisions in the grid as a test against every placed label', () => {
    let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const grid = createLabelGrid(), placed: LabelRect[] = [];
    for (let round = 0; round < 3; round++) {
      grid.clear(); placed.length = 0;
      for (let index = 0; index < 400; index++) {
        // Labels also lie off the canvas (negative coordinates) and on cell borders.
        const rect = { x: random() * 1800 - 300, y: random() * 900 - 100, width: 8 + random() * 220 };
        if (index % 9 === 0) { rect.x = Math.round(rect.x / 96) * 96; rect.y = Math.round(rect.y / 27) * 27; }
        expect(grid.collides(rect.x, rect.y, rect.width)).toBe(placed.some(other => labelsCollide(rect, other)));
        if (index % 3 === 0) { grid.add(rect); placed.push(rect); }
      }
    }
  });

  it('moves a colliding label by a step, hides it after the attempts and never moves a marker', () => {
    const grid = createLabelGrid();
    expect(placeLabel(grid, 100, 100, 60, 'marker', 400)).toEqual({ y: 100, visible: true });
    // Below the marker on the next free row.
    expect(placeLabel(grid, 100, 100, 60, 'asset', 400)).toEqual({ y: 100 + LABEL_STEP, visible: true });
    // A zone label moves up instead.
    expect(placeLabel(grid, 100, 100, 60, 'zone', 400)).toEqual({ y: 100 - LABEL_STEP, visible: true });
    // A marker overlaps whatever is there and stays visible.
    expect(placeLabel(grid, 100, 100 + LABEL_STEP, 60, 'marker', 400).visible).toBe(true);
    // The viewport edge stops the search: the label keeps its place and is hidden.
    const top = createLabelGrid(); top.add({ x: 50, y: 30, width: 40 });
    expect(placeLabel(top, 50, 30, 40, 'zone', 400)).toEqual({ y: 30, visible: false });
    const tight = createLabelGrid(); tight.add({ x: 50, y: 380, width: 40 });
    expect(placeLabel(tight, 50, 380, 40, 'asset', 400)).toEqual({ y: 380, visible: false });
  });
});

describe('pointer input per frame', () => {
  const move = (x: number, extra: Partial<PointerSample> = {}): PointerSample => ({ clientX: x, clientY: 10, pointerType: 'mouse', buttons: 0, ...extra });

  it('keeps only the latest move and merges the requests of listeners that queue the same event', () => {
    const queue = createPointerQueue(), first = move(1), second = move(2);
    queue.push(first, undefined, { hover: true }); queue.push(second, 'label-a', { report: true }); queue.push(second, 'label-a', { hover: true });
    expect(queue.take()).toEqual({ event: second, label: 'label-a', hover: true, report: true });
    expect(queue.take()).toBeNull();
    queue.push(first, undefined, { report: true }); queue.clear(); expect(queue.take()).toBeNull();
  });

  it('casts the queued move, else the resting hover position only when the camera moved, at most once per frame', () => {
    expect(pointerFrameWork(true, true, true)).toBe('queued');
    expect(pointerFrameWork(true, false, false)).toBe('queued');
    expect(pointerFrameWork(false, true, true)).toBe('resting');
    expect(pointerFrameWork(false, true, false)).toBe('none');
    expect(pointerFrameWork(false, false, true)).toBe('none');
  });

  it('re-casts a resting hover only for a mouse or pen over the canvas with no button pressed', () => {
    expect(isRestingHover({ event: move(1), label: undefined, hover: true })).toBe(true);
    expect(isRestingHover({ event: move(1, { pointerType: 'pen' }), label: undefined, hover: true })).toBe(true);
    expect(isRestingHover({ event: move(1, { pointerType: 'touch' }), label: undefined, hover: true })).toBe(false);
    expect(isRestingHover({ event: move(1, { buttons: 1 }), label: undefined, hover: true })).toBe(false);
    expect(isRestingHover({ event: move(1), label: 'crate-1', hover: true })).toBe(false);
    expect(isRestingHover({ event: move(1), label: undefined, hover: false })).toBe(false);
  });

  it('notices a moved, zoomed or switched camera since the last cast', () => {
    const watch = createCameraWatch(), camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -100, 100), other = new THREE.PerspectiveCamera();
    camera.position.set(5, 5, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    expect(watch.changed(camera)).toBe(true);
    watch.record(camera); expect(watch.changed(camera)).toBe(false);
    camera.zoom = 2; camera.updateProjectionMatrix(); expect(watch.changed(camera)).toBe(true);
    watch.record(camera); camera.position.x += .01; camera.updateMatrixWorld(); expect(watch.changed(camera)).toBe(true);
    watch.record(camera); expect(watch.changed(other)).toBe(true);
    // The tail of an easing glide is far below a pixel and counts as still.
    camera.position.x += 1e-9; camera.updateMatrixWorld(); expect(watch.changed(camera)).toBe(false);
  });
});
