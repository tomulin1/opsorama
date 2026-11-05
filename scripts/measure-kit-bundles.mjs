#!/usr/bin/env node
/**
 * Measures how much toolkit code a scene bundles for a given import: the engine alone, the full catalog, and single kits.
 * Each entry is bundled with esbuild (ESM, minified, browser platform) with `three` external, so the numbers cover Opsorama code
 * (@opsorama/core, @opsorama/three, @opsorama/objects) only. Prints minified and gzip sizes and the number of catalog modules included.
 * Usage: pnpm measure:bundles
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = {
  'engine only (createSceneRenderer)': `import { createSceneRenderer } from '@opsorama/three'; globalThis.x = createSceneRenderer;`,
  'full catalog (catalogAssets)': `import { createSceneRenderer } from '@opsorama/three'; import { catalogAssets } from '@opsorama/objects'; globalThis.x = [createSceneRenderer, catalogAssets];`,
  'one kit (vehicles)': `import { createSceneRenderer } from '@opsorama/three'; import { vehiclesKit } from '@opsorama/objects/vehicles'; globalThis.x = [createSceneRenderer, vehiclesKit];`,
  'one kit (restaurant)': `import { createSceneRenderer } from '@opsorama/three'; import { restaurantKit } from '@opsorama/objects/restaurant'; globalThis.x = [createSceneRenderer, restaurantKit];`,
  'two kits (work-items + furniture)': `import { createSceneRenderer, createAssetRegistry } from '@opsorama/three'; import { workItemsKit } from '@opsorama/objects/work-items'; import { furnitureKit } from '@opsorama/objects/furniture'; globalThis.x = [createSceneRenderer, createAssetRegistry(workItemsKit, furnitureKit)];`,
};
for (const [name, contents] of Object.entries(entries)) {
  const result = await esbuild.build({ stdin: { contents, resolveDir: root, loader: 'ts' }, bundle: true, minify: true, format: 'esm', platform: 'browser', external: ['three', 'three/*'], write: false, metafile: true, logLevel: 'silent' });
  const code = result.outputFiles[0].contents;
  const modules = Object.keys(result.metafile.inputs).filter(file => file.includes('packages/objects/src/')).length;
  console.log(`${name.padEnd(36)} ${(code.length / 1024).toFixed(1).padStart(7)} KiB min  ${(zlib.gzipSync(code).length / 1024).toFixed(1).padStart(6)} KiB gzip  catalog modules: ${modules}`);
}
