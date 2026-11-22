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
 * budget from 130 to 146, about 10% above the new measurements. On November 22, 2026 the camera API (camera settings and view
 * checks in core, the camera rig, perspective projection, timed transitions and change events in the renderer) grew the engine
 * from 66.9 to 74.6 (gzip 25.3 to 27.8), the catalog from 324.6 to 332.4 and the largest kit (vehicles) from 133.0 to 140.7, so
 * the engine budget was raised from 74 to 82, about 10% above the new measurement. Every kit and catalog entry bundles the
 * renderer (`createSceneRenderer`) as well, so renderer growth adds the same amount to each of them. On November 22, 2026 touch
 * gestures (one-finger pan, pinch zoom, two-finger orbit; `gestures.ts` replaced the mouse-only pan module, 2.2 → 6.0 KiB
 * minified on its own) grew every renderer entry by 3.9 KiB (gzip 1.4): the engine from 79.8 to 83.7, the catalog from 337.6
 * to 341.6 and the largest kit (vehicles) from 145.9 to 149.8, so the engine, catalog and kit budgets were each raised by 6,
 * the measured growth plus a margin of about 2. On November 22, 2026 the engine hooks (pointer events with node and world
 * point, the frame hook with fixed simulation steps and renderer plugins, with their validation messages; the new modules are
 * frame-clock.ts 2.0, plugins.ts 1.3 and pointer.ts 1.1 KiB minified) grew every renderer entry by 6.8 KiB (gzip 2.5): the
 * engine from 83.7 to 90.5, the catalog from 341.6 to 348.4 and the largest kit (vehicles) from 149.8 to 156.6, so the engine,
 * catalog and kit budgets were each raised by 9, the measured growth plus a margin of about 2. Later on November 22, 2026
 * the shape, line and group nodes (their validation rules and messages in core, and nodes.ts with the unit shape geometry,
 * the line tube and the shared node builder in the renderer) grew every renderer entry by 5.0 KiB (gzip 1.7): the engine
 * from 90.5 to 95.5, the catalog from 348.4 to 353.4 and the largest kit (vehicles) from 156.6 to 161.6, so the engine,
 * catalog and kit budgets were each raised by 7, the measured growth plus a margin of about 2. Raise a budget only with a
 * note that explains the growth.
 */
const BUDGETS_KIB = { engine: 104, catalog: 362, kit: 168, handling: 30 };
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
