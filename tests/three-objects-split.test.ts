import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { addObjectRelease, createAssetRegistry, disposeObject, type AssetFactory } from '@opsorama/three';
import { catalogAssets, assetDescriptors } from '@opsorama/objects';

const source = (dir: string) => readdirSync(dir).filter(file => file.endsWith('.ts')).map(file => [file, readFileSync(`${dir}/${file}`, 'utf8')] as const);

describe('engine and catalog packages', () => {
  it('keeps the engine free of catalog imports', () => {
    for (const [file, code] of source('packages/three/src')) expect(code, file).not.toMatch(/from\s+['"]@opsorama\/objects/);
    const engine = new Set(source('packages/three/src').map(([file]) => file.replace(/\.ts$/, '')));
    for (const [file, code] of source('packages/three/src')) for (const [, target] of code.matchAll(/from\s+'\.\/([a-z0-9-]+)'/g)) expect(engine.has(target), `${file} imports ./${target}`).toBe(true);
  });

  it('lists every catalog model once, matching the descriptors', () => {
    expect(Object.isFrozen(catalogAssets)).toBe(true);
    expect(Object.keys(catalogAssets).sort()).toEqual(Object.keys(assetDescriptors).sort());
  });

  it('merges registries and rejects a duplicate asset name', () => {
    const box: AssetFactory = () => new THREE.Group();
    const merged = createAssetRegistry(catalogAssets, { 'custom-box': box });
    expect(merged['custom-box']).toBe(box);
    expect(merged.parcel).toBe(catalogAssets.parcel);
    expect(Object.isFrozen(merged)).toBe(true);
    expect(() => createAssetRegistry(catalogAssets, { parcel: box })).toThrow('Asset parcel is registered twice');
  });

  it('runs registered releases once when a model or an ancestor is disposed', () => {
    const root = new THREE.Group(), child = new THREE.Group(); root.add(child);
    let rootReleases = 0, childReleases = 0;
    addObjectRelease(root, () => { rootReleases++; }); addObjectRelease(child, () => { childReleases++; });
    disposeObject(root); disposeObject(root);
    expect([rootReleases, childReleases]).toEqual([1, 1]);
  });

  it('rejects counts on a catalog model without a count definition and releases the model', () => {
    expect(() => catalogAssets.storefront({ id: 'shop', kind: 'asset', asset: 'storefront', count: 2 })).toThrow('Asset storefront has no count configuration');
    expect(() => catalogAssets.parcel({ id: 'order', kind: 'asset', asset: 'parcel', count: 2 })).toThrow('parcel-base');
  });
});
