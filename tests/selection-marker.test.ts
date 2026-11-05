import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, DEFAULT_SETTINGS } from '@opsorama/core';
import { advanceCornerMarker, createCornerMarker, createGlowHighlight, createInstanceBatcher, INSTANCING_MIN_COUNT, selectionColor, showCornerMarker } from '@opsorama/renderer-three';

const box = (color = '#ff0000', transparent = false) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color, transparent }));
const nodeObject = (scene: THREE.Object3D, id: string, x = 0) => { const root = new THREE.Group(); root.add(box()); root.position.set(x, 0, 0); root.traverse(child => { child.userData.nodeId = id; }); scene.add(root); return root; };
const shells = (scene: THREE.Object3D) => scene.getObjectByName('selection-glow')!.children as THREE.Mesh[];

describe('selection style setting', () => {
  it('defaults to corners and rejects an unknown style with the valid values', () => {
    expect(DEFAULT_SETTINGS.selectionStyle).toBe('corners');
    const store = createSceneStore({ schemaVersion: 1, nodes: [] });
    store.configure({ selectionStyle: 'glow' });
    expect(store.getSnapshot().settings.selectionStyle).toBe('glow');
    expect(() => store.configure({ selectionStyle: 'ring' as 'glow' })).toThrow('Use corners, glow');
  });
  it('uses palette roles by node state, with fallbacks', () => {
    const palette = { accent: '#111111', warning: '#222222', critical: '#333333' };
    expect(['normal', 'warning', 'critical'].map(state => selectionColor(state as 'normal', palette))).toEqual(['#111111', '#222222', '#333333']);
    expect(selectionColor(undefined, undefined)).toBe('#4779ed');
  });
});

describe('corner marker', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-2, 0, 1), new THREE.Vector3(4, 3, 2));
  const span = (mesh: THREE.Mesh) => { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox!.getSize(new THREE.Vector3()); };
  it('fits the model footprint at the floor level and stays out of picking', () => {
    const marker = createCornerMarker(bounds, .5), brackets = marker.object.children[1] as THREE.Mesh;
    expect(marker.object.position.toArray()).toEqual([1, .61, 1.5]);
    expect(span(brackets).x).toBeCloseTo(6.44); expect(span(brackets).z).toBeCloseTo(1.44);
    const hits: THREE.Intersection[] = []; brackets.raycast(new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0)), hits);
    expect(hits).toHaveLength(0);
  });
  it('lets objects in front hide the corners they cover', () => {
    const marker = createCornerMarker(bounds, 0);
    expect(marker.brackets.depthTest).toBe(true); expect(marker.pad.material.depthTest).toBe(true);
  });
  it('keeps a readable size for tiny and empty bounds', () => {
    const marker = createCornerMarker(new THREE.Box3(), 0);
    expect(span(marker.object.children[0] as THREE.Mesh).x).toBeCloseTo(.8);
  });
  it('separates hover from selection and settles the selection animation', () => {
    const marker = createCornerMarker(bounds, 0);
    expect(marker.object.visible).toBe(false);
    showCornerMarker(marker, 'hovered', '#123456');
    expect(marker.object.visible).toBe(true); expect(marker.pad.visible).toBe(false); expect(marker.brackets.opacity).toBeLessThan(1); expect(marker.settle).toBe(0);
    showCornerMarker(marker, 'selected', '#123456');
    expect(marker.pad.visible).toBe(true); expect(marker.brackets.opacity).toBe(1); expect(marker.settle).toBe(1);
    advanceCornerMarker(marker, .05); expect(marker.object.scale.x).toBeGreaterThan(1);
    advanceCornerMarker(marker, Infinity); expect(marker.object.scale.x).toBe(1); expect(marker.settle).toBe(0);
    showCornerMarker(marker, null, '#123456'); expect(marker.object.visible).toBe(false);
  });
});

describe('glow highlight', () => {
  it('covers opaque meshes only and leaves model materials untouched', () => {
    const scene = new THREE.Scene(), root = nodeObject(scene, 'a'), glass = box('#00ff00', true); root.add(glass);
    const material = (root.children[0] as THREE.Mesh).material, glow = createGlowHighlight(scene, mesh => mesh.visible);
    glow.show('selected', root, '#123456');
    expect(shells(scene)).toHaveLength(1); expect(shells(scene)[0].geometry).toBe((root.children[0] as THREE.Mesh).geometry);
    expect((root.children[0] as THREE.Mesh).material).toBe(material);
    glow.show('selected', null, '#123456'); expect(shells(scene)).toHaveLength(0);
  });
  it('skips meshes of child scene nodes', () => {
    const scene = new THREE.Scene(), root = nodeObject(scene, 'a'); root.add(nodeObject(scene, 'carried'));
    const glow = createGlowHighlight(scene, mesh => mesh.visible);
    glow.show('selected', root, '#123456'); expect(shells(scene)).toHaveLength(1);
  });
  it('follows hidden instanced proxies, which render through their batch', () => {
    const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene);
    const objects = Array.from({ length: INSTANCING_MIN_COUNT }, (_, i) => nodeObject(scene, `n${i}`, i * 2));
    scene.updateMatrixWorld(true); objects.forEach(object => batcher.add(object)); batcher.update();
    const glow = createGlowHighlight(scene, mesh => mesh.visible || batcher.isProxy(mesh)), proxy = objects[1].children[0] as THREE.Mesh;
    expect(proxy.visible).toBe(false);
    glow.show('selected', objects[1], '#123456'); objects[1].position.x = 9; scene.updateMatrixWorld(); glow.update(0, false);
    expect(shells(scene)[0].visible).toBe(true);
    expect(new THREE.Vector3().setFromMatrixPosition(shells(scene)[0].matrixWorld).x).toBe(9);
  });
  it('hides a shell with its model part and holds a static tint without motion', () => {
    const scene = new THREE.Scene(), root = nodeObject(scene, 'a'), glow = createGlowHighlight(scene, mesh => mesh.visible);
    glow.show('selected', root, '#123456'); root.children[0].visible = false; glow.update(.5, false);
    const material = shells(scene)[0].material as THREE.MeshBasicMaterial, resting = material.opacity;
    expect(shells(scene)[0].visible).toBe(false);
    glow.update(.5, true); expect(material.opacity).toBeGreaterThan(resting);
    glow.update(.5, false); expect(material.opacity).toBe(resting);
  });
  it('removes its group and shells on dispose', () => {
    const scene = new THREE.Scene(), glow = createGlowHighlight(scene, mesh => mesh.visible);
    glow.show('hovered', nodeObject(scene, 'a'), '#123456'); glow.dispose();
    expect(scene.getObjectByName('selection-glow')).toBeUndefined();
  });
});
