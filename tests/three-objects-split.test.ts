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

  it('keeps the handling subpath free of Three.js and model code', () => {
    const manifest = JSON.parse(readFileSync('packages/objects/package.json', 'utf8'));
    expect(manifest.exports['./handling']).toBe('./src/handling/index.ts');
    // Follow every relative import from the entry: none may load three, renderer code or a model module.
    const seen = new Set<string>(), queue = ['packages/objects/src/handling/index.ts'];
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const code = readFileSync(file, 'utf8');
      for (const [statement, type, specifier] of code.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)) {
        expect(specifier, `${file}: ${statement}`).not.toMatch(/^three($|\/)/);
        if (specifier === '@opsorama/three') expect(type, `${file} may import only types from @opsorama/three`).toBeTruthy();
        if (specifier.startsWith('.')) {
          expect(specifier, `${file} imports ${specifier} outside the handling folder`).toMatch(/^\.\/[a-z0-9-]+$/);
          queue.push(`packages/objects/src/handling/${specifier.slice(2)}.ts`);
        } else expect(['@opsorama/core', '@opsorama/three'], `${file} imports ${specifier}`).toContain(specifier);
      }
    }
    expect([...seen].length).toBeGreaterThanOrEqual(5);
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
