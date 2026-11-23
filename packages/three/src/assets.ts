import * as THREE from 'three';
import type { AssetNode, MaterialOverrides } from '@opsorama/core';
import { clearAssetAnimator } from './animation';

/** Scene material settings the renderer passes to every asset factory. `theme` is the scene theme; `palette` holds the scene's partial material overrides. */
export interface MaterialContext { theme: 'light' | 'midnight'; palette?: MaterialOverrides; }
/**
 * Builds one model for an asset node. The returned object and every geometry, material and texture under it belong to that instance;
 * the renderer releases them with `disposeObject` when the node is removed or rebuilt. A factory that throws must release what it allocated.
 *
 * Optional `validate` checks a node without building it and throws an actionable error, for example for `AssetNode.options` the
 * model does not accept. The renderer calls it before building, and `assetValidator` lets a scene store call it before accepting a node.
 *
 * Optional hints the renderer reads from the returned object's `userData`:
 * - `labelHeight: number`: model-local height in metres of the floating label anchor. Default 1.65.
 * - `labelText: string`: text of the floating label instead of `AssetNode.label`, for example a summary of the model's options.
 *   The factory decides how it combines with `AssetNode.label`. Default: `AssetNode.label`.
 * - `labelWrap: boolean`: wrap long label text at 220 px instead of keeping it on one line. Default false.
 * - `containerBounds: THREE.Box3`: model-local bounds of a container that stay the same in every `view`. With `AssetNode.peekOnHover`,
 *   hovering inside them peeks the container's children.
 */
export interface AssetFactory {
  (node: AssetNode, context?: MaterialContext): THREE.Object3D;
  /** Throws when the node is not valid for this model, without building it. */
  validate?: (node: AssetNode) => void;
}
/**
 * Asset factories keyed by `AssetNode.asset`. The renderer has no built-in models: pass the registry your scene uses, for example
 * `catalogAssets` from `@opsorama/objects`, or your own factories, or both merged with `createAssetRegistry`.
 */
export type AssetRegistry = Readonly<Record<string, AssetFactory>>;

/**
 * Merges registries into one. Each key may appear only once across the inputs; a duplicate is an error, so a custom factory never
 * silently replaces another. The result is frozen.
 */
export function createAssetRegistry(...registries: readonly AssetRegistry[]): AssetRegistry {
  const merged: Record<string, AssetFactory> = {};
  for (const registry of registries) for (const [key, factory] of Object.entries(registry)) {
    if (Object.hasOwn(merged, key)) throw new Error(`Asset ${key} is registered twice. Give the custom factory its own asset name or leave one registry out.`);
    merged[key] = factory;
  }
  return Object.freeze(merged);
}

/** Internal to the renderer: the factory of `asset`; throws an actionable error for an asset name the registry does not contain. */
export function assetFactory(registry: AssetRegistry, asset: string): AssetFactory {
  if (!Object.hasOwn(registry, asset)) {
    const near = closestAssetName(asset, Object.keys(registry));
    throw new Error(`Unknown asset: ${asset}.${near ? ` Did you mean ${near}?` : ''} Add its AssetFactory to the renderer's assets option, for example catalogAssets from @opsorama/objects.`);
  }
  return registry[asset];
}

/** The registered name closest to `asset` by edit distance, when it is close enough to be a likely typo. */
function closestAssetName(asset: string, names: readonly string[]): string | undefined {
  const wanted = asset.toLowerCase();
  let best: string | undefined, bestDistance = Infinity;
  for (const name of names) {
    const candidate = name.toLowerCase();
    let previous = Array.from({ length: candidate.length + 1 }, (_, index) => index);
    for (let i = 1; i <= wanted.length; i++) {
      const row = [i];
      for (let j = 1; j <= candidate.length; j++) row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (wanted[i - 1] === candidate[j - 1] ? 0 : 1));
      previous = row;
    }
    if (previous[candidate.length] < bestDistance) { best = name; bestDistance = previous[candidate.length]; }
  }
  return best !== undefined && bestDistance <= Math.max(1, Math.floor(Math.max(asset.length, best.length) / 3)) ? best : undefined;
}

/**
 * A validator for `createSceneStore(definition, settings, { validateAsset })`: it rejects asset names the registry does not
 * contain and runs the factory's `validate`, so the store refuses the nodes the renderer would fail to build. Pass the same
 * registry as the renderer's `assets` option.
 */
export function assetValidator(registry: AssetRegistry): (node: AssetNode) => void {
  return node => { assetFactory(registry, node.asset).validate?.(node); };
}

const releases = new WeakMap<THREE.Object3D, (() => void)[]>();
/**
 * Registers a release callback for a resource that Three.js disposal does not cover, such as an image request or an object URL.
 * `disposeObject` runs it once when it disposes `object` or an ancestor of it. Lifecycle: register while building the model.
 */
export function addObjectRelease(object: THREE.Object3D, release: () => void): void {
  const list = releases.get(object);
  if (list) list.push(release); else releases.set(object, [release]);
}

/** Releases a model: registered release callbacks, its animator, and every geometry, material and instanced buffer under it (a sprite's material, not the geometry all sprites share). Shared resources (`shareAssetResource`) and textures are not disposed: a factory that creates its own textures releases them with `addObjectRelease`. Call it once per built model. */
export function disposeObject(object: THREE.Object3D) {
  object.traverse(child => { const list = releases.get(child); if (!list) return; releases.delete(child); for (const release of list) release(); });
  clearAssetAnimator(object);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  object.traverse(child => { if (child instanceof THREE.InstancedMesh) child.dispose(); if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) { geometries.add(child.geometry); const list = Array.isArray(child.material) ? child.material : [child.material]; list.forEach(m => materials.add(m)); }
    // Every sprite shares one geometry; only its material is its own.
    else if (child instanceof THREE.Sprite) materials.add(child.material); });
  geometries.forEach(g => { if (!shared.has(g)) g.dispose(); }); materials.forEach(m => { if (!shared.has(m)) m.dispose(); });
}

const shared = new WeakSet<object>();
/**
 * Marks a geometry or material that several models use at once, such as the parts of a loaded glTF model that every
 * instance shares. `disposeObject` and the renderer's static merging leave it alone; the factory that shares it disposes
 * it when the last model using it is released (see `addObjectRelease`). Meshes with shared parts can still be drawn as
 * one `InstancedMesh` by the renderer.
 */
export function shareAssetResource(resource: THREE.BufferGeometry | THREE.Material): void { shared.add(resource); }
/** Whether `shareAssetResource` marked `resource`. */
export function isSharedAssetResource(resource: object): boolean { return shared.has(resource); }

const rebuildHandlers = new WeakMap<THREE.Object3D, () => void>();
/**
 * Internal to renderers: called with every model a factory returned, so the factory can ask for its node to be built
 * again with `requestAssetRebuild`. The handler is dropped with the model.
 */
export function setAssetRebuildHandler(object: THREE.Object3D, handler: () => void): void { rebuildHandlers.set(object, handler); }
/**
 * Asks the renderer that holds `object` (a model returned by an asset factory) to build its node again, for example
 * after content the factory loads asynchronously has arrived: the factory returns a placeholder at first, and the rebuild
 * calls it again when it can return the real model. Returns false when no renderer holds the model any more, for
 * example after it was disposed or when the factory was called outside a renderer.
 */
export function requestAssetRebuild(object: THREE.Object3D): boolean {
  const handler = rebuildHandlers.get(object);
  if (!handler) return false;
  rebuildHandlers.delete(object); handler();
  return true;
}

const pendingLoads = new Set<Promise<unknown>>();
/**
 * Registers a load an asset factory started, such as a glTF file, so `assetLoadsSettled` can wait for it. The promise
 * may reject; a rejection is the factory's to report (usually by rebuilding and throwing an actionable error).
 */
export function trackAssetLoad(load: Promise<unknown>): void {
  pendingLoads.add(load);
  const done = () => { pendingLoads.delete(load); };
  load.then(done, done);
}
/**
 * Resolves once every load registered with `trackAssetLoad` has settled, including loads that start while it waits. Tools
 * that capture a scene (screenshots, the `opsorama render` command) await it after `SceneRenderer.loaded`, then wait for
 * the next frames, so asynchronously loaded models are drawn.
 */
export async function assetLoadsSettled(): Promise<void> {
  while (pendingLoads.size) await Promise.allSettled([...pendingLoads]);
}
