#!/usr/bin/env node
/**
 * Measures how much toolkit code a scene bundles for a given import: the engine alone, the full catalog, and every kit.
 * Each entry is bundled with esbuild (ESM, minified, browser platform) with `three` external, so the numbers cover Opsorama code
 * (@opsorama/core, @opsorama/three, @opsorama/objects) only. Prints minified and gzip sizes and the number of catalog modules included.
 *
 * Usage:
 *   pnpm measure:bundles   Print the measurements.
 *   pnpm check:bundles     Also fail (exit 1) when an entry exceeds its minified budget in BUDGETS_KIB.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Minified size budgets in KiB, about 10% above the November 5, 2026 measurements with `sideEffects: false` declared
 * (engine 59.6, catalog 308.1, largest single kit 116.1 for vehicles). Raise a budget only with a note that explains the growth.
 */
const BUDGETS_KIB = { engine: 66, catalog: 340, kit: 130 };
const camel = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) + 'Kit';
const kits = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'packages/objects/package.json'), 'utf8')).exports).filter(key => key !== '.').map(key => key.slice(2));
const entries = [
  { name: 'engine only (createSceneRenderer)', budget: BUDGETS_KIB.engine, contents: `import { createSceneRenderer } from '@opsorama/three'; globalThis.x = createSceneRenderer;` },
  { name: 'full catalog (catalogAssets)', budget: BUDGETS_KIB.catalog, contents: `import { createSceneRenderer } from '@opsorama/three'; import { catalogAssets } from '@opsorama/objects'; globalThis.x = [createSceneRenderer, catalogAssets];` },
  ...kits.map(kit => ({ name: `kit ${kit}`, budget: BUDGETS_KIB.kit, contents: `import { createSceneRenderer } from '@opsorama/three'; import { ${camel(kit)} } from '@opsorama/objects/${kit}'; globalThis.x = [createSceneRenderer, ${camel(kit)}];` })),
  { name: 'two kits (work-items + furniture)', budget: BUDGETS_KIB.kit, contents: `import { createSceneRenderer, createAssetRegistry } from '@opsorama/three'; import { workItemsKit } from '@opsorama/objects/work-items'; import { furnitureKit } from '@opsorama/objects/furniture'; globalThis.x = [createSceneRenderer, createAssetRegistry(workItemsKit, furnitureKit)];` },
];
const check = process.argv.includes('--check');
const over = [];
for (const { name, budget, contents } of entries) {
  const result = await esbuild.build({ stdin: { contents, resolveDir: root, loader: 'ts' }, bundle: true, minify: true, format: 'esm', platform: 'browser', external: ['three', 'three/*'], write: false, metafile: true, logLevel: 'silent' });
  const code = result.outputFiles[0].contents, size = code.length / 1024;
  const modules = Object.keys(result.metafile.inputs).filter(file => file.includes('packages/objects/src/')).length;
  console.log(`${name.padEnd(36)} ${size.toFixed(1).padStart(7)} KiB min  ${(zlib.gzipSync(code).length / 1024).toFixed(1).padStart(6)} KiB gzip  catalog modules: ${String(modules).padStart(2)}  budget ${budget} KiB`);
  if (size > budget) over.push(`${name}: ${size.toFixed(1)} KiB exceeds the ${budget} KiB budget. Find the new import with the metafile, or raise BUDGETS_KIB with an explanation.`);
}
if (check && over.length) { console.error(over.join('\n')); process.exit(1); }
if (check) console.log('All bundle budgets met.');
