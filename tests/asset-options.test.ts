import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSceneStore, validateNode, type AssetNode } from '@opsorama/core';
import { assetValidator, createAssetRegistry, disposeObject, type AssetFactory } from '@opsorama/three';
import { CATALOG_OPTION_ASSETS, catalogAssets, validateCatalogOptions } from '@opsorama/objects';
import { workItemsKit } from '@opsorama/objects/work-items';

const validateAsset = assetValidator(catalogAssets);

describe('asset options', () => {
  it('accepts any plain JSON-like options in core and deep-freezes a copy', () => {
    const options = { anything: { nested: [1, 'two', null, { deep: true }] }, flag: false };
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'custom', kind: 'asset', asset: 'my-model', options }] });
    const stored = store.getSnapshot().nodes[0] as AssetNode;
    expect(stored.options).toEqual(options); expect(stored.options).not.toBe(options);
    expect(Object.isFrozen(stored.options)).toBe(true); expect(Object.isFrozen((stored.options!.anything as { nested: unknown[] }).nested)).toBe(true);
    options.flag = true; expect(stored.options!.flag).toBe(false);
    store.dispose();
  });

  it('rejects options that are not plain JSON-like data, naming the path', () => {
    const node = (options: unknown) => ({ id: 'n', kind: 'asset', asset: 'my-model', options }) as AssetNode;
    expect(() => validateNode(node([]))).toThrow('Options of n must be an object');
    expect(() => validateNode(node('fast'))).toThrow('Options of n must be an object');
    expect(() => validateNode(node({ callback: () => 1 }))).toThrow('n.options.callback is a function');
    expect(() => validateNode(node({ when: new Date(0) }))).toThrow('n.options.when is a Date instance');
    expect(() => validateNode(node({ list: [1, Symbol('x')] }))).toThrow('n.options.list[1] is a symbol');
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    expect(() => validateNode(node(cyclic))).toThrow('n.options.self refers to itself');
    expect(() => validateNode(node({ missing: undefined }))).not.toThrow();
  });

  it('accepts arbitrary options on a custom asset, also through assetValidator', () => {
    const seen: AssetNode[] = [];
    const custom: AssetFactory = node => { seen.push(node); return new THREE.Group(); };
    const assets = createAssetRegistry(workItemsKit, { 'my-model': custom });
    const store = createSceneStore({ schemaVersion: 1, nodes: [] }, {}, { validateAsset: assetValidator(assets) });
    store.upsert({ id: 'custom', kind: 'asset', asset: 'my-model', options: { mode: 'fast', speed: 3, path: [[0, 0], [1, 2]] } });
    expect((store.getSnapshot().nodes[0] as AssetNode).options).toEqual({ mode: 'fast', speed: 3, path: [[0, 0], [1, 2]] });
    expect(() => store.upsert({ id: 'other', kind: 'asset', asset: 'missing-model' })).toThrow('Unknown asset: missing-model. Add its AssetFactory');
    store.dispose();
  });

  it('names the asset, the option and the assets that accept it for an option a catalog asset does not accept', () => {
    const parcel: AssetNode = { id: 'p1', kind: 'asset', asset: 'parcel', options: { measurement: { value: 3 } } };
    const message = `Asset parcel does not accept options.measurement (node p1). It is accepted by ${CATALOG_OPTION_ASSETS.measurement.join(', ')}; remove options.measurement or use one of those assets.`;
    expect(() => validateCatalogOptions('parcel', parcel)).toThrow(message);
    expect(() => catalogAssets.parcel(parcel)).toThrow(message);
    expect(() => catalogAssets.parcel.validate!(parcel)).toThrow(message);
    expect(() => catalogAssets.parcel({ ...parcel, options: { speed: 2 } })).toThrow('Asset parcel has no option speed (node p1). Catalog options are forks, person, heatEnabled');
    for (const [option, assets] of Object.entries(CATALOG_OPTION_ASSETS)) for (const asset of assets) expect(Object.hasOwn(catalogAssets, asset), `${option}: ${asset}`).toBe(true);
  });

  it('rejects invalid options in the store on upsert and replace when the catalog validator is installed', () => {
    const store = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'gauge', kind: 'asset', asset: 'ring-gauge', options: { measurement: { value: 40 } } }] }, {}, { validateAsset });
    const before = store.getSnapshot();
    expect(() => store.upsert({ id: 'gauge', kind: 'asset', asset: 'ring-gauge', options: { measurement: { value: 40, min: 10, max: 5 } } })).toThrow('finite increasing range');
    expect(() => store.upsert({ id: 'cart', kind: 'asset', asset: 'shopping-cart', count: 2, options: { contents: { lines: [] } } })).toThrow('omit count and multiplier');
    expect(() => store.upsert({ id: 'truck', kind: 'asset', asset: 'forklift', options: { forks: { height: 9 } } })).toThrow('height of forklift must be from');
    expect(() => store.replace([{ id: 'oven', kind: 'asset', asset: 'pizza-oven', options: { heatEnabled: 'yes' as unknown as boolean } }])).toThrow('pizza-oven options.heatEnabled must be a boolean');
    expect(() => store.replace([{ id: 'shed', kind: 'asset', asset: 'building', variant: 'tall', options: { building: { type: 'storage-shed' } } }])).toThrow('Building does not support variants');
    expect(store.getSnapshot()).toBe(before);
    // Without the hook the store accepts the node; the renderer reports the error when it builds it.
    const plain = createSceneStore({ schemaVersion: 1, nodes: [{ id: 'gauge', kind: 'asset', asset: 'parcel', options: { measurement: { value: 40 } } }] });
    expect(plain.getSnapshot().nodes).toHaveLength(1); plain.dispose(); store.dispose();
    expect(() => createSceneStore({ schemaVersion: 1, nodes: [{ id: 'gauge', kind: 'asset', asset: 'parcel', options: { measurement: { value: 40 } } }] }, {}, { validateAsset })).toThrow('Asset parcel does not accept options.measurement');
  });

  it('leaves label text and height to catalog factory hints', () => {
    const parcel = catalogAssets.parcel({ id: 'box', kind: 'asset', asset: 'parcel', variant: 'open', label: 'Order 7', options: { contents: { lines: [{ id: 'a', title: 'Mug', quantity: 12 }] } } });
    expect(parcel.userData.labelText).toBe('Order 7 · 12 items · 9 shown +3 in detail'); disposeObject(parcel);
    const gauge = catalogAssets['ring-gauge']({ id: 'g', kind: 'asset', asset: 'ring-gauge', options: { measurement: { value: 72.5, unit: '%' } } });
    expect(gauge.userData.labelText).toBe('73 %'); expect(gauge.userData.labelWrap).toBe(true);
    expect(gauge.userData.labelHeight).toBeCloseTo(new THREE.Box3().setFromObject(gauge).max.y + .35); disposeObject(gauge);
    const labelled = catalogAssets['ring-gauge']({ id: 'g', kind: 'asset', asset: 'ring-gauge', label: 'Load', options: { measurement: { value: 72.5, unit: '%' } } });
    expect(labelled.userData.labelText).toBeUndefined(); disposeObject(labelled);
    const plain = catalogAssets.parcel({ id: 'box', kind: 'asset', asset: 'parcel', label: 'Order 7' });
    expect(plain.userData.labelText).toBeUndefined(); expect(plain.userData.labelHeight).toBeUndefined(); disposeObject(plain);
  });
});
