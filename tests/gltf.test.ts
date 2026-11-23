import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { AssetNode } from '@opsorama/core';
import { assetLoadsSettled, disposeObject, requestAssetRebuild, setAssetRebuildHandler, shareAssetResource, trackAssetLoad } from '../packages/three/src/assets';
import { hasAssetAnimator } from '../packages/three/src/animation';
import { gltfAsset, preloadGltf, type GltfLoaderLike } from '../packages/three/src/gltf';
import { createInstanceBatcher } from '../packages/three/src/instancing';
import { mergeStaticParts } from '../packages/three/src/static-merge';

const node = (extra: Partial<AssetNode> = {}): AssetNode => ({ id: 'drone-1', kind: 'asset', asset: 'drone', ...extra });
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

/** A loader whose files are three.js scenes made in code: a 2 × 1 × 4 body standing 1 m off its origin and a rotor. */
function testLoader({ fail = false, animated = false } = {}) {
  const calls: string[] = [];
  let resolve!: () => void;
  const gate = new Promise<void>(done => { resolve = done; });
  const loader: GltfLoaderLike = {
    async loadAsync(url) {
      calls.push(url); await gate;
      if (fail) throw new Error('404 Not Found');
      const scene = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardMaterial({ color: '#336699' }));
      body.position.y = 1.5; body.name = 'body';
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .1), new THREE.MeshStandardMaterial({ color: '#222222' })); rotor.position.y = 2.05; rotor.name = 'rotor';
      scene.add(body, rotor);
      const animations = animated ? [new THREE.AnimationClip('spin', 1, [new THREE.NumberKeyframeTrack('rotor.rotation[y]', [0, 1], [0, Math.PI * 2])])] : [];
      return { scene, animations };
    },
  };
  return { loader, calls, resolve };
}
const meshes = (object: THREE.Object3D) => { const found: THREE.Mesh[] = []; object.traverse(child => { if ((child as THREE.Mesh).isMesh) found.push(child as THREE.Mesh); }); return found; };

describe('glTF asset factories', () => {
  it('show a placeholder while loading, ask for a rebuild, then build the shared model', async () => {
    const { loader, calls, resolve } = testLoader(), factory = gltfAsset('/models/drone.glb', { loader });
    const placeholder = factory(node());
    expect(placeholder.getObjectByName('gltf-placeholder')).toBeDefined(); expect(placeholder.userData.labelHeight).toBeCloseTo(1.25);
    const rebuild = vi.fn(); setAssetRebuildHandler(placeholder, rebuild);
    const settled = assetLoadsSettled();
    resolve(); await settled; await tick();
    expect(rebuild).toHaveBeenCalledTimes(1);
    const a = factory(node()), b = factory(node({ id: 'drone-2' }));
    expect(calls).toEqual(['/models/drone.glb']);
    const [bodyA] = meshes(a), [bodyB] = meshes(b);
    expect(bodyA.geometry).toBe(bodyB.geometry); expect(bodyA.material).toBe(bodyB.material);
    expect(bodyA.castShadow && bodyA.receiveShadow).toBe(true);
    // Release: the placeholder's own box goes; the shared parts stay while a model uses them.
    const disposed = vi.fn(); bodyA.geometry.addEventListener('dispose', disposed);
    disposeObject(placeholder); disposeObject(a); await tick();
    expect(disposed).not.toHaveBeenCalled();
    disposeObject(b); await tick();
    expect(disposed).toHaveBeenCalledTimes(1);
    // The file loads again for the next node.
    factory(node()); expect(calls).toHaveLength(2);
  });

  it('normalize the model to the height, rotation and base-centre pivot', async () => {
    const { loader, resolve } = testLoader(); resolve();
    await preloadGltf('/models/drone.glb', loader);
    const model = gltfAsset('/models/drone.glb', { loader, height: 2 })(node());
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.min.y).toBeCloseTo(0); expect(bounds.max.y).toBeCloseTo(2); expect((bounds.min.x + bounds.max.x) / 2).toBeCloseTo(0); expect(bounds.max.z - bounds.min.z).toBeCloseTo(4 * 2 / 1.1);
    expect(model.userData.labelHeight).toBeCloseTo(2.25);
    const turned = gltfAsset('/models/drone.glb', { loader, rotation: [0, Math.PI / 2, 0], pivot: 'model-origin', scale: 0.5 })(node());
    turned.updateMatrixWorld(true);
    const turnedBounds = new THREE.Box3().setFromObject(turned);
    expect(turnedBounds.max.x - turnedBounds.min.x).toBeCloseTo(2); expect(turnedBounds.min.y).toBeCloseTo(0.5);
    disposeObject(model); disposeObject(turned);
  });

  it('report a failed file through the rebuilt node and try again after release', async () => {
    const { loader, resolve, calls } = testLoader({ fail: true }), factory = gltfAsset('/models/missing.glb', { loader });
    const placeholder = factory(node()), rebuild = vi.fn(); setAssetRebuildHandler(placeholder, rebuild);
    resolve(); await assetLoadsSettled(); await tick();
    expect(rebuild).toHaveBeenCalledTimes(1);
    expect(() => factory(node())).toThrow('Could not load the glTF model /models/missing.glb: 404 Not Found.');
    await expect(preloadGltf('/models/missing.glb', loader)).rejects.toThrow('404 Not Found');
    disposeObject(placeholder); await tick();
    factory(node()); expect(calls).toHaveLength(2);
  });

  it('play an animation clip and reject options and invalid settings', async () => {
    const { loader, resolve } = testLoader({ animated: true }); resolve();
    await preloadGltf('/models/drone.glb', loader);
    const model = gltfAsset('/models/drone.glb', { loader, animation: 'spin' })(node());
    expect(hasAssetAnimator(model)).toBe(true);
    expect(() => gltfAsset('/models/drone.glb', { loader, animation: 'fly' })(node())).toThrow('has no animation named fly. Clips: spin.');
    expect(() => gltfAsset('/models/drone.glb').validate!(node({ options: { blink: true } }))).toThrow('is a glTF model and accepts no options; remove options from node drone-1.');
    expect(() => gltfAsset('/x.glb', { height: 1, scale: 2 })).toThrow('pass height or scale, not both');
    expect(() => gltfAsset('/x.glb', { height: -1 })).toThrow('height must be a positive number');
    expect(() => gltfAsset('')).toThrow('needs the URL');
    expect(() => gltfAsset('/x.glb', { placeholder: [1, 0, 1] })).toThrow('placeholder is [width, height, depth]');
    disposeObject(model);
  });
});

describe('shared asset resources', () => {
  it('are not disposed or merged with a model, but are instanced, textures included', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1), texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture });
    shareAssetResource(geometry); shareAssetResource(material);
    const model = () => { const root = new THREE.Group(); root.userData.nodeId = `n${Math.random()}`; for (const x of [0, 2]) { const mesh = new THREE.Mesh(geometry, material); mesh.position.x = x; root.add(mesh); } return root; };
    const merged = model(); expect(mergeStaticParts(merged)).toEqual({ meshesBefore: 2, meshesAfter: 2 });
    const disposed = vi.fn(); geometry.addEventListener('dispose', disposed); material.addEventListener('dispose', disposed);
    disposeObject(merged); expect(disposed).not.toHaveBeenCalled();
    const scene = new THREE.Scene(), batcher = createInstanceBatcher(scene), models = [model(), model()];
    for (const root of models) { scene.add(root); root.updateMatrixWorld(true); batcher.add(root); }
    batcher.update();
    expect(batcher.stats()).toEqual({ batches: 1, instances: 4 });
    // A second texture object is another batch, even with the same pixels.
    const other = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: new THREE.Texture() })); other.userData.nodeId = 'other';
    const holder = new THREE.Group(); holder.userData.nodeId = 'holder'; holder.add(other); scene.add(holder); holder.updateMatrixWorld(true); batcher.add(holder); batcher.update();
    expect(batcher.stats()).toEqual({ batches: 1, instances: 4 });
    batcher.dispose();
  });

  it('track loads and route rebuild requests to the renderer that holds the model', async () => {
    let finish!: () => void; const load = new Promise<void>(done => { finish = done; });
    trackAssetLoad(load);
    let settled = false; void assetLoadsSettled().then(() => { settled = true; });
    await tick(); expect(settled).toBe(false);
    finish(); await tick(); expect(settled).toBe(true);
    const object = new THREE.Group(), handler = vi.fn();
    expect(requestAssetRebuild(object)).toBe(false);
    setAssetRebuildHandler(object, handler);
    expect(requestAssetRebuild(object)).toBe(true); expect(requestAssetRebuild(object)).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('the default GLTFLoader', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('loads a real .gltf file and builds it', async () => {
    // three.js FileLoader reports progress with the browser's ProgressEvent, which Node lacks.
    vi.stubGlobal('ProgressEvent', class extends Event { loaded: number; total: number; lengthComputable: boolean; constructor(type: string, init: { loaded?: number; total?: number; lengthComputable?: boolean } = {}) { super(type); this.loaded = init.loaded ?? 0; this.total = init.total ?? 0; this.lengthComputable = init.lengthComputable ?? false; } });
    // One quad, 2 m wide and 1 m tall, standing on its origin; positions and indices in one embedded buffer.
    const positions = new Float32Array([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0]), indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const bytes = new Uint8Array(positions.byteLength + indices.byteLength); bytes.set(new Uint8Array(positions.buffer)); bytes.set(new Uint8Array(indices.buffer), positions.byteLength);
    const gltf = {
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'panel' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1] } }],
      buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}` }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-1, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' }],
    };
    const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(gltf)).toString('base64')}`;
    await preloadGltf(url);
    const model = gltfAsset(url, { height: 3 })(node());
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(3); expect(bounds.max.x - bounds.min.x).toBeCloseTo(6);
    expect(meshes(model)[0].material).toBeInstanceOf(THREE.MeshStandardMaterial);
    disposeObject(model);
  });
});
