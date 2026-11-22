#!/usr/bin/env node
/**
 * Measures how much toolkit code a scene bundles for a given import: the engine alone, the full catalog, every kit, and the
 * handling rules entry (which must bundle no models).
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
 * (engine 59.6, catalog 308.1, largest single kit 116.1 for vehicles); the handling budget is about 10% above its first measurement
 * on November 22, 2026 (26.7, core included). On November 22, 2026 core scene validation (problem collectors with located
 * messages and actionable fixes, used by the store, the route follower, controllers and catalog factories) grew the engine from
 * 61.5 to 66.9 and the largest kit (vehicles) from 126.8 to 133.0, so the engine budget was raised from 66 to 74 and the kit
 * budget from 130 to 146, about 10% above the new measurements. Raise a budget only with a note that explains the growth.
 */
const BUDGETS_KIB = { engine: 74, catalog: 340, kit: 146, handling: 30 };
const camel = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) + 'Kit';
// Kits are the subpaths whose source is in src/kits/; the root and other entries such as ./handling are not kits.
const kits = Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'packages/objects/package.json'), 'utf8')).exports).filter(([, source]) => source.startsWith('./src/kits/')).map(([key]) => key.slice(2));
const entries = [
  // `rulesOnly`: the entry must bundle no model and no renderer code, only @opsorama/core and the handling modules.
  { name: 'handling rules (no models)', budget: BUDGETS_KIB.handling, rulesOnly: true, contents: `import { createHandlingState, handlingItemPolicy, bindMoveMode } from '@opsorama/objects/handling'; globalThis.x = [createHandlingState, handlingItemPolicy, bindMoveMode];` },
  { name: 'engine only (createSceneRenderer)', budget: BUDGETS_KIB.engine, contents: `import { createSceneRenderer } from '@opsorama/three'; globalThis.x = createSceneRenderer;` },
  { name: 'full catalog (catalogAssets)', budget: BUDGETS_KIB.catalog, contents: `import { createSceneRenderer } from '@opsorama/three'; import { catalogAssets } from '@opsorama/objects'; globalThis.x = [createSceneRenderer, catalogAssets];` },
  ...kits.map(kit => ({ name: `kit ${kit}`, budget: BUDGETS_KIB.kit, contents: `import { createSceneRenderer } from '@opsorama/three'; import { ${camel(kit)} } from '@opsorama/objects/${kit}'; globalThis.x = [createSceneRenderer, ${camel(kit)}];` })),
  { name: 'two kits (work-items + furniture)', budget: BUDGETS_KIB.kit, contents: `import { createSceneRenderer, createAssetRegistry } from '@opsorama/three'; import { workItemsKit } from '@opsorama/objects/work-items'; import { furnitureKit } from '@opsorama/objects/furniture'; globalThis.x = [createSceneRenderer, createAssetRegistry(workItemsKit, furnitureKit)];` },
];
const check = process.argv.includes('--check');
const over = [];
for (const { name, budget, contents, rulesOnly } of entries) {
  const result = await esbuild.build({ stdin: { contents, resolveDir: root, loader: 'ts' }, bundle: true, minify: true, format: 'esm', platform: 'browser', external: ['three', 'three/*'], write: false, metafile: true, logLevel: 'silent' });
  const code = result.outputFiles[0].contents, size = code.length / 1024;
  if (rulesOnly) {
    const extra = Object.keys(result.metafile.inputs).filter(file => file.includes('packages/three/src/') || file.includes('packages/objects/src/') && !file.includes('packages/objects/src/handling/'));
    const three = Object.values(result.metafile.outputs).some(output => output.imports.some(item => item.path === 'three' || item.path.startsWith('three/')));
    if (extra.length || three) over.push(`${name}: must bundle only @opsorama/core and the handling modules, but includes ${[...extra, ...(three ? ['three'] : [])].join(', ')}.`);
  }
  const modules = Object.keys(result.metafile.inputs).filter(file => file.includes('packages/objects/src/')).length;
  console.log(`${name.padEnd(36)} ${size.toFixed(1).padStart(7)} KiB min  ${(zlib.gzipSync(code).length / 1024).toFixed(1).padStart(6)} KiB gzip  catalog modules: ${String(modules).padStart(2)}  budget ${budget} KiB`);
  if (size > budget) over.push(`${name}: ${size.toFixed(1)} KiB exceeds the ${budget} KiB budget. Find the new import with the metafile, or raise BUDGETS_KIB with an explanation.`);
}
if (check && over.length) { console.error(over.join('\n')); process.exit(1); }
if (check) console.log('All bundle budgets met.');
