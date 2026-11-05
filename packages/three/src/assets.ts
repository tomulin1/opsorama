import * as THREE from 'three';
import type { AssetNode, MaterialOverrides } from '@opsorama/core';
import { clearAssetAnimator } from './animation';

/** Scene material settings the renderer passes to every asset factory. `theme` is the scene theme; `palette` holds the scene's partial material overrides. */
export interface MaterialContext { theme: 'light' | 'midnight'; palette?: MaterialOverrides; }
/**
 * Builds one model for an asset node. The returned object and every geometry, material and texture under it belong to that instance;
 * the renderer releases them with `disposeObject` when the node is removed or rebuilt. A factory that throws must release what it allocated.
 */
export type AssetFactory = (node: AssetNode, context?: MaterialContext) => THREE.Object3D;
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

const releases = new WeakMap<THREE.Object3D, (() => void)[]>();
/**
 * Registers a release callback for a resource that Three.js disposal does not cover, such as an image request or an object URL.
 * `disposeObject` runs it once when it disposes `object` or an ancestor of it. Lifecycle: register while building the model.
 */
export function addObjectRelease(object: THREE.Object3D, release: () => void): void {
  const list = releases.get(object);
  if (list) list.push(release); else releases.set(object, [release]);
}

/** Releases a model: registered release callbacks, its animator, and every geometry, material and instanced buffer under it. Call it once per built model. */
export function disposeObject(object: THREE.Object3D) {
  object.traverse(child => { const list = releases.get(child); if (!list) return; releases.delete(child); for (const release of list) release(); });
  clearAssetAnimator(object);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  object.traverse(child => { if (child instanceof THREE.InstancedMesh) child.dispose(); if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) { geometries.add(child.geometry); const list = Array.isArray(child.material) ? child.material : [child.material]; list.forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
