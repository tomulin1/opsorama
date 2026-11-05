#!/usr/bin/env node
/**
 * Writes packages/objects/dist/catalog.json: a machine-readable index of the object catalog for agents and tools that cannot run WebGL.
 * It lists every kit (subpath, export name, asset names) and every asset with its kit and its serializable ObjectDescriptor from
 * assetDescriptors. The build fails if a descriptor holds a value JSON cannot represent (function, symbol, bigint, NaN, Infinity).
 * Usage: node scripts/build-catalog-json.mjs   (run by pnpm build:packages after @opsorama/objects)
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const objects = path.join(root, 'packages/objects');
const manifest = JSON.parse(fs.readFileSync(path.join(objects, 'package.json'), 'utf8'));
const kitNames = Object.keys(manifest.exports).filter(key => key !== '.').map(key => key.slice(2));
const camel = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) + 'Kit';
const contents = [
  `export { assetDescriptors, CATALOG_KITS } from './src/index.ts';`,
  ...kitNames.map(name => `export { ${camel(name)} } from './src/kits/${name}.ts';`),
].join('\n');
const temp = path.join(root, 'node_modules/.cache/opsorama-catalog-json.mjs');
fs.mkdirSync(path.dirname(temp), { recursive: true });
await esbuild.build({ stdin: { contents, resolveDir: objects, loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', external: ['three', 'three/*'], outfile: temp, logLevel: 'silent' });
const catalogModule = await import(pathToFileURL(temp).href);
fs.rmSync(temp, { force: true });

if (JSON.stringify(kitNames) !== JSON.stringify([...catalogModule.CATALOG_KITS])) throw new Error(`Kit subpaths in package.json (${kitNames.join(', ')}) differ from CATALOG_KITS (${catalogModule.CATALOG_KITS.join(', ')}). Update package.json exports.`);
const checkSerializable = (value, where) => {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error(`${where} is a ${typeof value}; descriptors must be plain JSON data.`);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${where} is ${value}; use a finite number or null.`);
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) checkSerializable(item, `${where}.${key}`);
};
const kits = {}, assets = {};
for (const name of kitNames) {
  const keys = Object.keys(catalogModule[camel(name)]);
  kits[name] = { import: `@opsorama/objects/${name}`, export: camel(name), assets: keys };
  for (const key of keys) {
    const descriptor = catalogModule.assetDescriptors[key];
    if (!descriptor) throw new Error(`Asset ${key} in kit ${name} has no descriptor in assetDescriptors.`);
    checkSerializable(descriptor, `assetDescriptors.${key}`);
    assets[key] = { kit: name, descriptor };
  }
}
const catalog = { format: 'opsorama-object-catalog', schemaVersion: 1, package: manifest.name, version: manifest.version, kits, assets };
fs.mkdirSync(path.join(objects, 'dist'), { recursive: true });
fs.writeFileSync(path.join(objects, 'dist/catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`wrote catalog.json: ${kitNames.length} kits, ${Object.keys(assets).length} assets`);
