import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createSceneStore, validateNode, type AssetNode, type VisualState } from '@opsorama/core';
import { Asset as ReactAsset } from '@opsorama/react';
import { Asset as VueAsset, DashboardProvider } from '@opsorama/vue';
import * as THREE from 'three';
import { disposeObject } from '@opsorama/three';
import { assetVisualStates } from '@opsorama/objects';
import { assetDescriptors, catalogAssets } from '@opsorama/objects';
import { animateAsset, hasAssetAnimator } from '../packages/three/src/animation';
import { catalogObjects, objectNode, objectSnippet } from '../apps/site/src/features/docs/objects';
import { exampleSelectionNodeId } from '../apps/site/src/features/example-selection';

const states: readonly VisualState[] = ['normal', 'busy', 'warning', 'critical', 'inactive'];
const build = (asset: string, options: Partial<AssetNode> = {}) => catalogAssets[asset]({ id: asset, kind: 'asset', asset, ...options });
const contentsPart = (object: THREE.Object3D, name: string) => { let found: THREE.Mesh | undefined; object.traverse(part => { if (part instanceof THREE.Mesh && part.name === name) found = part; }); return found; };
const signature = (object: THREE.Object3D) => {
  animateAsset(object, { time: 7, delta: .1 });
  const parts: unknown[] = [];
  object.traverse(part => {
    const mesh = part as THREE.Mesh;
    parts.push([part.name, part.position.toArray(), part.rotation.toArray(), part.scale.toArray(), part.visible,
      mesh.geometry?.attributes.position?.count,
      mesh.material && (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(value => {
        const material = value as THREE.MeshStandardMaterial;
        return [material.color?.getHexString(), material.emissive?.getHexString(), material.opacity];
      }), part instanceof THREE.InstancedMesh ? Array.from(part.instanceColor?.array ?? []) : null]);
  });
  const result = JSON.stringify([parts, hasAssetAnimator(object)]);
  disposeObject(object);
  return result;
};

describe('model-native status and explicit operation', () => {
  it('keeps every neutral catalog model and variant independent of all five host states', () => {
    let neutral = 0;
    for (const item of catalogObjects) {
      if (!item.asset || assetVisualStates[item.asset]) continue;
      neutral++;
      expect(item.states, item.slug).toBeUndefined();
      for (const variant of item.variants ?? [undefined]) {
        const sample = objectNode(item, { variant }) as AssetNode;
        const normal = signature(catalogAssets[item.asset](sample));
        for (const state of states) expect(signature(catalogAssets[item.asset]({ ...sample, state })), `${item.slug}/${variant}/${state}`).toBe(normal);
      }
      const descriptor = assetDescriptors[item.asset];
      if (descriptor) expect(descriptor.customization.some(option => option.field === 'state'), item.slug).toBe(false);
    }
    expect(neutral).toBe(152);
  }, 20_000);

  it('derives chooser capabilities from native support and treats unsupported busy as normal', () => {
    expect(Object.keys(assetVisualStates)).toHaveLength(8);
    expect(Object.values(assetVisualStates).filter(values => values.includes('busy'))).toHaveLength(3);
    for (const [asset, values] of Object.entries(assetVisualStates)) {
      expect(catalogObjects.find(item => item.asset === asset)?.states).toEqual(values);
      if (!values.includes('busy')) expect(signature(build(asset, { state: 'busy' })), asset).toBe(signature(build(asset)));
    }
  });

  it('uses fillLevel for water and feed without inferring contents from alert severity', () => {
    for (const variant of ['water', 'feed']) {
      const name = variant === 'water' ? 'trough-water' : 'trough-feed';
      const empty = build('trough', { variant, fillLevel: 0, state: 'normal' });
      expect(contentsPart(empty, name)).toBeUndefined(); disposeObject(empty);
      const full = build('trough', { variant, state: 'inactive' }), half = build('trough', { variant, fillLevel: .5, state: 'critical' });
      expect(contentsPart(full, name)).toBeDefined();
      expect(new THREE.Box3().setFromObject(contentsPart(half, name)!).max.y).toBeLessThan(new THREE.Box3().setFromObject(contentsPart(full, name)!).max.y);
      expect(full.getObjectByName('trough-status')).toBeUndefined(); disposeObject(full); disposeObject(half);
    }
  });

  it('controls heat and water independently of severity and cleans up the water animator', () => {
    const off = build('heated-pass', { heatEnabled: false, state: 'critical' });
    expect(off.getObjectByName('pass-heat-glow')).toBeUndefined(); disposeObject(off);
    const hot = build('heated-pass', { state: 'inactive' }); expect(hot.getObjectByName('pass-heat-glow')).toBeDefined(); disposeObject(hot);
    const dry = build('deck-shower', { waterRunning: false, state: 'normal' }); expect(dry.getObjectByName('shower-water')).toBeUndefined(); expect(hasAssetAnimator(dry)).toBe(false); disposeObject(dry);
    const wet = build('deck-shower', { state: 'inactive' }); expect(wet.getObjectByName('shower-water')).toBeDefined(); expect(hasAssetAnimator(wet)).toBe(true); disposeObject(wet); expect(hasAssetAnimator(wet)).toBe(false);
    for (const [asset, part] of [['espresso-machine', 'espresso-steam'], ['pizza-oven', 'oven-fire']]) {
      const hot = build(asset, { state: 'inactive' }); expect(hot.getObjectByName(part), asset).toBeDefined(); disposeObject(hot);
      const cold = build(asset, { heatEnabled: false, state: 'critical' }); expect(cold.getObjectByName(part), asset).toBeUndefined(); expect(hasAssetAnimator(cold)).toBe(false); disposeObject(cold);
    }
  });

  it('rejects wrong model properties and invalid values in both stores and factories', () => {
    for (const [asset, field, invalid] of [['espresso-machine', 'heatEnabled', 0], ['pizza-oven', 'heatEnabled', 'false'], ['heated-pass', 'heatEnabled', 0], ['deck-shower', 'waterRunning', 'false'], ['trough', 'fillLevel', -.1], ['trough', 'fillLevel', 1.1], ['trough', 'fillLevel', NaN], ['trough', 'fillLevel', Infinity]] as const) {
      const node = { id: asset, kind: 'asset', asset, [field]: invalid } as AssetNode;
      expect(() => validateNode(node)).toThrow(field); expect(() => catalogAssets[asset](node)).toThrow(field);
    }
    for (const field of ['heatEnabled', 'waterRunning', 'fillLevel']) {
      const node = { id: 'wrong', kind: 'asset', asset: 'parcel', [field]: field === 'fillLevel' ? .5 : false } as AssetNode;
      expect(() => validateNode(node)).toThrow('supported only'); expect(() => catalogAssets.parcel(node)).toThrow('supported only');
    }
  });

  it('preserves explicit operation in catalog snippets and native JS, React and Vue nodes', async () => {
    for (const [asset, property, value] of [['espresso-machine', 'heatEnabled', false], ['pizza-oven', 'heatEnabled', false], ['heated-pass', 'heatEnabled', false], ['deck-shower', 'waterRunning', false], ['trough', 'fillLevel', .25]] as const) {
      const item = catalogObjects.find(item => item.asset === asset)!;
      const node = objectNode(item, { [property]: value }) as AssetNode;
      for (const framework of ['React', 'Vue', 'JavaScript'] as const) expect(objectSnippet(node, framework)).toContain(property);
      const { kind, ...props } = node;
      expect(kind).toBe('asset');
      const react = ReactAsset(props) as ReactElement<{ node: AssetNode }>;
      expect(react.props.node[property]).toBe(value);
      const store = createSceneStore({ schemaVersion: 1, nodes: [node] });
      expect((store.getSnapshot().nodes[0] as AssetNode)[property]).toBe(value); store.replace([]);
      await renderToString(createSSRApp({ render: () => h(DashboardProvider, { store }, { default: () => h(VueAsset, { id: props.id, asset: props.asset, [property]: value }) }) }));
      expect((store.getSnapshot().nodes[0] as AssetNode)[property]).toBe(value); store.dispose();
    }
  });

  it('opens the owning record when a composed alert marker is selected', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [
      { id: 'table:T1', kind: 'asset', asset: 'dining-table', entityId: 'T1' },
      { id: 'alert:T1', kind: 'asset', asset: 'map-pin', attachment: { nodeId: 'table:T1', anchor: 'top' }, entityId: 'T1', state: 'warning' },
      { id: 'location', kind: 'asset', asset: 'map-pin', selectable: true },
    ] });
    expect(exampleSelectionNodeId(store.getSnapshot())).toBeNull();
    store.select('alert:T1'); expect(exampleSelectionNodeId(store.getSnapshot())).toBe('table:T1');
    expect(store.getSnapshot().selection?.entityId).toBe('T1');
    store.select('table:T1'); expect(exampleSelectionNodeId(store.getSnapshot())).toBe('table:T1');
    store.select('location'); expect(exampleSelectionNodeId(store.getSnapshot())).toBe('location');
    store.dispose();
  });
});
