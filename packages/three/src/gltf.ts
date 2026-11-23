import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetNode } from '@opsorama/core';
import { setAssetAnimator } from './animation';
import { addObjectRelease, requestAssetRebuild, shareAssetResource, trackAssetLoad, type AssetFactory } from './assets';

/**
 * glTF and GLB models as asset factories: `@opsorama/three/gltf`. Kept on its own subpath so scenes without glTF models
 * do not load the glTF loader.
 */

/** Loads a glTF file; `GLTFLoader` from three.js fits, set up with Draco, meshopt or KTX2 decoders when the files need them. */
export interface GltfLoaderLike { loadAsync(url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>; }

/** Options of `gltfAsset`. */
export interface GltfAssetOptions {
  /** Height in metres: the model is scaled uniformly to it. Without `height` or `scale`, the file's own units are metres. */
  height?: number;
  /** Uniform scale of the model, instead of `height`. */
  scale?: number;
  /** Turn the model (radians, XYZ) before it is measured, so it stands on +y and faces +z like the catalog models. */
  rotation?: readonly [number, number, number];
  /** `base-center` (default) moves the model so the centre of its bounds' base is the node position; `model-origin` keeps the file's origin. */
  pivot?: 'base-center' | 'model-origin';
  /** Cast and receive shadows. Default true. */
  shadows?: boolean;
  /** Play an animation clip in a loop while scene motion is on: its name, or true for the first clip. */
  animation?: string | true;
  /** Size in metres [width, height, depth] of the box shown until the model has loaded, or false for none. Default [1, 1, 1]. */
  placeholder?: readonly [number, number, number] | false;
  /** Height in metres of the floating label. Default: 0.25 m above the model. */
  labelHeight?: number;
  /** Loader to use instead of a plain `GLTFLoader`, for example one with a `DRACOLoader`. Models load once per loader and URL. */
  loader?: GltfLoaderLike;
}

interface CachedModel {
  state: 'loading' | 'ready' | 'failed';
  scene?: THREE.Object3D; animations?: THREE.AnimationClip[]; error?: Error;
  /** Models built from it that are alive; it is disposed shortly after the count drops to zero. */
  refs: number; evictTimer?: ReturnType<typeof setTimeout>;
  /** Placeholders that are rebuilt once the file has loaded or failed. */
  waiting: Set<THREE.Object3D>;
  promise: Promise<void>;
}

const defaultLoader = new GLTFLoader();
const caches = new WeakMap<GltfLoaderLike, Map<string, CachedModel>>();
const cacheOf = (loader: GltfLoaderLike) => { let cache = caches.get(loader); if (!cache) { cache = new Map(); caches.set(loader, cache); } return cache; };

function materialsOf(object: THREE.Object3D): Set<THREE.Material> {
  const materials = new Set<THREE.Material>();
  object.traverse(child => { const material = (child as THREE.Mesh).material; if (material) for (const item of [material].flat()) materials.add(item); });
  return materials;
}

function load(loader: GltfLoaderLike, url: string): CachedModel {
  const cache = cacheOf(loader), existing = cache.get(url);
  if (existing) return existing;
  const model: CachedModel = { state: 'loading', refs: 0, waiting: new Set(), promise: Promise.resolve() };
  model.promise = loader.loadAsync(url).then(gltf => {
    model.state = 'ready'; model.scene = gltf.scene; model.animations = gltf.animations ?? [];
    // Every instance shares the geometry and materials; disposal skips them until the cache releases them.
    gltf.scene.traverse(child => { const geometry = (child as THREE.Mesh).geometry; if (geometry) shareAssetResource(geometry); });
    for (const material of materialsOf(gltf.scene)) shareAssetResource(material);
  }, (error: unknown) => {
    model.state = 'failed'; model.error = error instanceof Error ? error : new Error(String(error));
  }).finally(() => {
    // Placeholders ask their renderer for a rebuild, which builds the model (or reports the error) synchronously.
    const waiting = [...model.waiting]; model.waiting.clear();
    for (const placeholder of waiting) requestAssetRebuild(placeholder);
    // Nothing waited and nothing uses it: it was loaded for nothing (or preloaded), so it stays cached until used and released.
  });
  cache.set(url, model); trackAssetLoad(model.promise);
  return model;
}

function release(loader: GltfLoaderLike, url: string, model: CachedModel): void {
  model.refs--;
  if (model.refs > 0) return;
  clearTimeout(model.evictTimer);
  // A rebuild releases the old model after building the new one, and a remount happens within the same task: a short
  // delay keeps the file for both.
  model.evictTimer = setTimeout(() => {
    if (model.refs > 0 || cacheOf(loader).get(url) !== model) return;
    cacheOf(loader).delete(url);
    if (!model.scene) return;
    const textures = new Set<THREE.Texture>();
    for (const material of materialsOf(model.scene)) {
      for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
      material.dispose();
    }
    model.scene.traverse(child => { (child as THREE.Mesh).geometry?.dispose(); });
    textures.forEach(texture => texture.dispose());
  }, 0);
}

function acquire(root: THREE.Object3D, loader: GltfLoaderLike, url: string, model: CachedModel): void {
  model.refs++; clearTimeout(model.evictTimer); model.evictTimer = undefined;
  addObjectRelease(root, () => { model.waiting.delete(root); release(loader, url, model); });
}

/**
 * Starts loading a glTF file into the cache, so the first scene that uses it builds the model at once instead of showing
 * its placeholder. Resolves when the file has loaded; rejects when it fails. A preloaded model stays cached until a node
 * that used it is released.
 */
export function preloadGltf(url: string, loader: GltfLoaderLike = defaultLoader): Promise<void> {
  const model = load(loader, url);
  return model.promise.then(() => { if (model.state === 'failed') throw model.error; });
}

/**
 * An asset factory for a glTF (`.gltf`) or GLB (`.glb`) file, to register next to catalog models:
 * `createAssetRegistry(catalogAssets, { drone: gltfAsset('/models/drone.glb', { height: 0.6 }) })`.
 *
 * The file loads once per URL (and loader) and every node shares its geometry, materials and textures; the renderer draws
 * repeated meshes as one `InstancedMesh`. Until the file has loaded, a node shows a translucent placeholder box, then it
 * is built again with the model. A file that fails to load makes the node's build fail: the renderer reports it with the
 * node and the URL through `onError`, and tries again when the node changes. When the last node using a file is removed
 * or its renderer disposed, the file's geometry, materials and textures are released.
 *
 * The model is normalized once per factory: turned by `rotation`, scaled by `height` or `scale`, and moved so the centre
 * of its base is the node position (`pivot`). Node `position`, `rotation` and `scale` apply on top. Material roles, the
 * scene palette and visual states do not change a glTF model: it keeps the file's materials. Asset `options` are rejected.
 * Skinned meshes are cloned with their skeletons; `animation` plays a clip in a loop as the model's asset animation.
 */
export function gltfAsset(url: string, options: GltfAssetOptions = {}): AssetFactory {
  if (typeof url !== 'string' || !url.trim()) throw new Error('gltfAsset needs the URL of a .gltf or .glb file.');
  const { height, scale, rotation, pivot = 'base-center', shadows = true, animation, placeholder = [1, 1, 1], labelHeight, loader = defaultLoader } = options;
  if (height !== undefined && scale !== undefined) throw new Error(`gltfAsset ${url}: pass height or scale, not both.`);
  if (height !== undefined && !(height > 0 && Number.isFinite(height))) throw new Error(`gltfAsset ${url}: height must be a positive number of metres; received ${height}.`);
  if (scale !== undefined && !(scale > 0 && Number.isFinite(scale))) throw new Error(`gltfAsset ${url}: scale must be a positive number; received ${scale}.`);
  if (placeholder && (placeholder.length !== 3 || !placeholder.every(value => value > 0 && Number.isFinite(value)))) throw new Error(`gltfAsset ${url}: placeholder is [width, height, depth] in positive metres, or false.`);
  /** Transform from the file's scene (world) to the model frame, computed once from the first loaded scene. */
  let normalized: { matrix: THREE.Matrix4; height: number } | null = null;
  const normalize = (scene: THREE.Object3D) => {
    if (normalized) return normalized;
    const turn = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(rotation ?? [0, 0, 0])));
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3(), box = new THREE.Box3();
    scene.traverse(child => { const geometry = (child as THREE.Mesh).geometry; if (!geometry) return; if (!geometry.boundingBox) geometry.computeBoundingBox(); box.copy(geometry.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, child.matrixWorld)); bounds.union(box); });
    if (bounds.isEmpty()) bounds.set(new THREE.Vector3(), new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3()), factor = height !== undefined ? (size.y > 0 ? height / size.y : 1) : scale ?? 1;
    const offset = pivot === 'base-center' ? new THREE.Vector3(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2) : new THREE.Vector3();
    const matrix = new THREE.Matrix4().makeScale(factor, factor, factor).multiply(new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z)).multiply(turn);
    normalized = { matrix, height: (pivot === 'base-center' ? size.y : bounds.max.y) * factor };
    return normalized;
  };

  const factory: AssetFactory = () => {
    const model = load(loader, url), root = new THREE.Group(); root.name = `gltf:${url}`;
    if (model.state === 'failed') throw new Error(`Could not load the glTF model ${url}: ${model.error?.message ?? 'unknown error'}. Check the URL and that the server sends the file (and allows this origin for another origin).`);
    acquire(root, loader, url, model);
    if (model.state === 'loading') {
      model.waiting.add(root);
      if (placeholder) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(...placeholder), new THREE.MeshStandardMaterial({ color: '#9fb0c8', transparent: true, opacity: .35, depthWrite: false }));
        box.position.y = placeholder[1] / 2; box.name = 'gltf-placeholder'; root.add(box);
      }
      root.userData.labelHeight = labelHeight ?? (placeholder ? placeholder[1] + .25 : .25);
      return root;
    }
    const scene = model.scene!, { matrix, height: modelHeight } = normalize(scene);
    const skinned = (() => { let found = false; scene.traverse(child => { if ((child as THREE.SkinnedMesh).isSkinnedMesh) found = true; }); return found; })();
    const copy = skinned ? cloneSkinned(scene) : scene.clone(true);
    // The copy keeps the file's root transform under the normalization.
    scene.updateMatrix(); copy.matrixAutoUpdate = false; copy.matrix.multiplyMatrices(matrix, scene.matrix); copy.matrixWorldNeedsUpdate = true;
    copy.traverse(child => { if ((child as THREE.Mesh).isMesh) { child.castShadow = shadows; child.receiveShadow = shadows; } });
    root.add(copy);
    root.userData.labelHeight = labelHeight ?? modelHeight + .25;
    if (animation !== undefined) {
      const clips = model.animations ?? [], clip = animation === true ? clips[0] : THREE.AnimationClip.findByName(clips, animation);
      if (!clip) throw new Error(`The glTF model ${url} has no animation ${animation === true ? 'clip' : `named ${animation}`}. Clips: ${clips.map(item => item.name || '(unnamed)').join(', ') || 'none'}.`);
      const mixer = new THREE.AnimationMixer(copy); mixer.clipAction(clip).play();
      const animated: THREE.Object3D[] = []; copy.traverse(child => { if (child !== copy) animated.push(child); });
      setAssetAnimator(root, ({ delta }) => { mixer.update(delta); }, animated);
      addObjectRelease(root, () => { mixer.stopAllAction(); mixer.uncacheRoot(copy); });
    }
    return root;
  };
  factory.validate = (node: AssetNode) => {
    if (node.options !== undefined && Object.keys(node.options).length) throw new Error(`Asset ${node.asset} is a glTF model and accepts no options; remove options from node ${node.id}.`);
  };
  return factory;
}
